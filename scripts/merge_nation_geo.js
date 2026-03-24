#!/usr/bin/env node
// Вспомогательный: вливает JSON-патч в data/nation_geo.js
// Использование: node scripts/merge_nation_geo.js <patch.json>
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'nation_geo.js');

let existing = {};
if (fs.existsSync(OUT)) {
  const code = fs.readFileSync(OUT, 'utf8').replace(/^var /mg, 'var ');
  const s = vm.createContext({ console });
  vm.runInContext(code, s);
  existing = s.NATION_GEO ?? {};
}

const patch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const merged = { ...existing, ...patch };

fs.writeFileSync(OUT,
  `// AUTO-GENERATED: исторические границы наций 304 BC\n// Не редактировать вручную — создаётся merge_nation_geo.js\nvar NATION_GEO = ${JSON.stringify(merged, null, 2)};\n`,
  'utf8'
);
console.log(`✓ Добавлено ${Object.keys(patch).length} наций. Итого: ${Object.keys(merged).length}`);
