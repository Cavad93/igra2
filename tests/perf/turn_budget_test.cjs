/**
 * tests/perf/turn_budget_test.cjs
 *
 * Session 15 — регрессионный guard на скорость хода.
 *
 * Читает perf/last_run.json (снимок 10 ходов, который пишет perf/profile.mjs)
 * и проверяет, что ключевые метрики не превысили бюджет. Бюджет — это значения
 * Session 14 × 1.2, округлённые вверх. Если метрика выходит за бюджет,
 * тест падает: значит, какая-то последующая правка откатила оптимизации
 * из Sessions 1-14.
 *
 * Почему не запускает профайлер сам: perf/profile.mjs тянет Playwright
 * с хардкоженым абсолютным путём и браузер. В обычном unit-прогоне это
 * долго (~30с) и привязано к QA-окружению. Логика:
 *
 *   - По умолчанию → читать perf/last_run.json. Если его нет — сказать,
 *     что прогон пропущен (exit 0), чтобы не ломать CI в средах без
 *     Playwright, но вывести предупреждение.
 *   - `RUN_PROFILE=1 node tests/perf/turn_budget_test.cjs` → дополнительно
 *     прогнать `node perf/profile.mjs` перед проверкой (для локального
 *     использования или ночного job'a).
 *
 * Запуск:
 *   node tests/perf/turn_budget_test.cjs                  # проверить существующий last_run.json
 *   RUN_PROFILE=1 node tests/perf/turn_budget_test.cjs    # сначала снять свежий замер
 *
 * Бюджет — Session 14 p50/p95 × 1.2:
 *
 *   | метрика            | S14 (ms) | budget (×1.2, ms) |
 *   |--------------------|---------:|------------------:|
 *   | total p50          |   2117.6 |              2541 |
 *   | total p95          |   6678.0 |              8014 |
 *   | Экономика p50      |    948.2 |              1138 |
 *   | Экономика p95      |   4617.3 |              5541 |
 *   | ИИ думает p50      |    179.9 |               216 |
 *   | ИИ думает p95      |    261.3 |               314 |
 *
 * Бюджет total p95 сознательно «щедрый» — 10-й ход стабильно тяжелее
 * остальных из-за прогрева AI-worker'a и первой полной рецессии в
 * экономическом цикле. Если p95 начнёт превышать 8000 ms — это реальная
 * регрессия, а не шум.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const LAST_RUN = path.join(REPO, 'perf', 'last_run.json');
const PROFILE_MJS = path.join(REPO, 'perf', 'profile.mjs');

// Бюджет: Session 14 p50/p95 × 1.2, округлено вверх до сотен миллисекунд
// для удобства чтения (кроме мелких ступеней, где сотни — слишком грубо).
const BUDGET = {
  total:      { p50: 2541, p95: 8014 },
  'Экономика':{ p50: 1138, p95: 5541 },
  'ИИ думает':{ p50:  216, p95:  314 },
  'Население':{ p50:  200, p95:  300 }, // S14: p50=60, p95=93
  'Заговоры': { p50:  100, p95:  200 }, // S14: p50=19, p95=51
  'Армии':    { p50:   50, p95:  100 }, // S14: p50=7,  p95=24
  'Сохранение':{p50:   30, p95:   50 }, // S14: p50=3,  p95=8
  'Договоры': { p50:   20, p95:   30 }, // S14: p50=1,  p95=2
  'Рендер':   { p50:   20, p95:   30 }, // S14: p50=2,  p95=4
};

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  \u2713 ${msg}${detail ? ' (' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`  \u2717 FAIL: ${msg}${detail ? ' (' + detail + ')' : ''}`);
    failed++;
    failures.push(msg + (detail ? ' | ' + detail : ''));
  }
}

function loadSnapshot() {
  if (!fs.existsSync(LAST_RUN)) return null;
  try {
    return JSON.parse(fs.readFileSync(LAST_RUN, 'utf8'));
  } catch (e) {
    console.error(`  \u2717 perf/last_run.json не парсится: ${e.message}`);
    return null;
  }
}

function maybeRunProfile() {
  if (!process.env.RUN_PROFILE) return;
  console.log('  \u2022 RUN_PROFILE=1 \u2192 запускаю node perf/profile.mjs...');
  const r = spawnSync('node', [PROFILE_MJS], {
    cwd: REPO, stdio: 'inherit', timeout: 5 * 60 * 1000,
  });
  if (r.status !== 0) {
    console.error(`  \u2717 profile.mjs упал (exit=${r.status}). Продолжаю с существующим last_run.json, если есть.`);
  }
}

function checkMetric(label, kind, measured, budget) {
  if (typeof measured !== 'number' || !Number.isFinite(measured)) {
    assert(false, `${label} ${kind}`, `measured=${measured} (нет в last_run.json)`);
    return;
  }
  const ok = measured <= budget;
  const pct = budget > 0 ? Math.round((measured / budget) * 100) : 0;
  assert(ok, `${label} ${kind} <= ${budget}ms`, `measured=${measured.toFixed(1)}ms (${pct}% бюджета)`);
}

// ── main ──────────────────────────────────────────────────────────────
console.log('\n\u23f1  tests/perf/turn_budget_test.cjs \u2014 Session 15 regression guard\n');

maybeRunProfile();

const snap = loadSnapshot();
if (!snap) {
  console.log('  \u26a0 perf/last_run.json отсутствует или не парсится.');
  console.log('    Запусти `node perf/profile.mjs` вручную (нужен Playwright в /opt/node22).');
  console.log('    Тест не фейлится в этом случае \u2014 нечем проверять, окружение без браузера.\n');
  process.exit(0);
}

console.log(`  \u2022 Snapshot: ${snap.timestamp}, turns=${snap.turns}, boot=${snap.bootMs}ms`);
console.log(`  \u2022 Nations=${snap.boot?.nations}, regions=${snap.boot?.regions}, player=${snap.boot?.player}\n`);

// Пропускаем проверку если turns <10 — нерепрезентативно.
if (!snap.turns || snap.turns < 10) {
  console.error(`  \u2717 Нужно минимум 10 ходов, в last_run.json turns=${snap.turns}`);
  process.exit(1);
}

// ── 1. Общий per-turn бюджет ─────────────────────────────────────────
console.log('── Total per-turn ──');
checkMetric('total', 'p50', snap.overall?.p50, BUDGET.total.p50);
checkMetric('total', 'p95', snap.overall?.p95, BUDGET.total.p95);

// ── 2. Бюджет по шагам из engine/turn.js (console.time) ──────────────
console.log('\n── Steps (console.time) ──');
for (const [label, budget] of Object.entries(BUDGET)) {
  if (label === 'total') continue;
  const step = snap.stepReport?.[label];
  if (!step) {
    console.log(`  \u2022 ${label} \u2014 нет данных (возможно, шаг переименован или пропущен)`);
    continue;
  }
  checkMetric(label, 'p50', step.p50, budget.p50);
  checkMetric(label, 'p95', step.p95, budget.p95);
}

// ── 3. pageErrors должны быть пустыми ─────────────────────────────────
console.log('\n── Page errors ──');
const errs = Array.isArray(snap.pageErrors) ? snap.pageErrors : [];
assert(errs.length === 0, 'pageErrors пустой', errs.length ? `найдено ${errs.length}: ${errs[0]?.slice(0, 80)}` : '');

// ── 4. Boot не деградирует ────────────────────────────────────────────
console.log('\n── Boot ──');
// Session 12 вывел boot с 3033 до 2064. Бюджет — 4000ms (щедро, ×1.3 от 3033).
checkMetric('boot', 'ms', snap.bootMs, 4000);

// ── Итог ───────────────────────────────────────────────────────────────
console.log(`\n── Итог: ${passed}/${passed + failed} PASS ──`);

if (failed > 0) {
  console.error(`\n\u26a0 Perf-регрессия: ${failed} метрик вышли за бюджет.`);
  console.error('Первые:');
  failures.slice(0, 5).forEach(f => console.error(`  - ${f}`));
  console.error('\nВосстановление: git log perf/session-*.md \u2014 найти, когда метрика была в норме, и сравнить.');
  process.exit(1);
}

console.log('\n\u2705 Все метрики в пределах бюджета \u2014 прогресс Session 1..14 сохранён.\n');
process.exit(0);
