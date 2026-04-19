// ESLint flat config. Единственная цель — ловить bare-вызовы
// незаявленных символов (no-undef). Спас бы нам багу `formatWant is not
// defined` в ui/government_tab.js:657 (оверлей "Управление
// государством" открывался пустым, т.к. panels.js формально не
// экспортировал `formatWant`, значит _reg() не клал его на window).
//
// Список `windowGlobals` собирается из `scripts/collect_window_globals.cjs`
// перед каждым запуском линта (см. `npm run lint`). Трогать вручную
// не нужно: он автогенерится из `export …` во всех .js под
// ui/ engine/ ai/ data/ и config.js.

import fs       from 'node:fs';
import path     from 'node:path';
import url      from 'node:url';
import globals  from 'globals';

const __dirname    = path.dirname(url.fileURLToPath(import.meta.url));
const windowGlobalsPath = path.join(__dirname, '.eslint-window-globals.json');

let projectWindowGlobals = [];
if (fs.existsSync(windowGlobalsPath)) {
  try {
    projectWindowGlobals = JSON.parse(fs.readFileSync(windowGlobalsPath, 'utf8'));
  } catch (e) {
    console.warn(`[eslint.config] Could not parse ${windowGlobalsPath}:`, e.message);
  }
} else {
  console.warn(`[eslint.config] ${windowGlobalsPath} not found. Run: npm run lint:refresh-globals`);
}

const projectGlobalsMap = Object.fromEntries(
  projectWindowGlobals.map((name) => [name, 'readonly'])
);

// Глобалы из CDN-скриптов (подключены <script> в index.html, не
// проходят через _reg и не попадают в collect_window_globals.cjs).
const cdnGlobals = {
  L: 'readonly',        // Leaflet
  PIXI: 'readonly',     // Pixi.js
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'data/backups/**',
      'models/**',
      'scripts/_patch/**',
      'assets/**',
      '.playwright-mcp/**',
      'perf/**',
    ],
  },
  {
    files: ['ui/**/*.js', 'engine/**/*.js', 'ai/**/*.js', 'config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
        ...cdnGlobals,
        ...projectGlobalsMap,
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    files: ['tests/**/*.cjs', 'scripts/**/*.cjs', 'agents/**/*.js', 'agents/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        GAME_STATE: 'readonly',
        MAP_REGIONS: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
