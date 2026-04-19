// Сканирует ui/, engine/, ai/, data/, config.js на все `export` и
// печатает JSON-массив имён — эти символы через `_reg()` в ui/boot.js
// попадают на `window` и могут быть вызваны bare-идентификатором из
// любого другого ES-модуля проекта.
//
// Используется eslint.config.mjs как источник правдивого списка
// window-globals. Любой bare-вызов символа, которого нет ни в этом
// списке, ни среди локальных declarations/imports/params — падает
// под `no-undef` (см. багу с `formatWant` из Session-N, когда
// панель "Управление государством" открывалась пустой).

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['ui', 'engine', 'ai', 'data'];
const EXTRA_FILES = ['config.js'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [];
for (const d of DIRS) walk(path.join(ROOT, d), files);
for (const f of EXTRA_FILES) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) files.push(p);
}

const names = new Set();

const RE_DECL   = /^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm;
const RE_LIST   = /^\s*export\s*\{\s*([^}]+)\s*\}/gm;
// Прямые присваивания на window/globalThis (GAME_STATE, INITIAL_GAME_STATE
// и т.д. не имеют `export`, но создаются на рантайме и доступны по имени).
const RE_WINDOW = /\b(?:window|globalThis)\.(\w+)\s*=/g;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  RE_DECL.lastIndex = 0;
  while ((m = RE_DECL.exec(src))) names.add(m[1]);
  RE_LIST.lastIndex = 0;
  while ((m = RE_LIST.exec(src))) {
    for (const raw of m[1].split(',')) {
      const parts = raw.trim().split(/\s+as\s+/);
      const exported = (parts[1] || parts[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(exported)) names.add(exported);
    }
  }
  RE_WINDOW.lastIndex = 0;
  while ((m = RE_WINDOW.exec(src))) names.add(m[1]);
}

// Рантайм-символы, которые биндятся в ui/boot.js после загрузки
// state (до этого они не существуют, но ESLint по ним не отличает
// статически). Добавляем вручную.
for (const manual of ['GAME_STATE']) names.add(manual);

process.stdout.write(JSON.stringify([...names].sort(), null, 2) + '\n');
