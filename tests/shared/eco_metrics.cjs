'use strict';
// Общие утилиты для eco_stress_harness.cjs и eco_stress_analyze.cjs
//   - mulberry32(seed)        — seedable PRNG для детерминированного Math.random
//   - stripESM(text)          — regex-strip ESM-синтаксиса для vm.runInContext
//   - captureSnapshot(GS, t)  — снапшот экономики за один ход
//   - nationActive(n)         — порт _isStubNation из engine/economy.js
//   - stats: mean, stdDev, percentile, pctChange

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Стрипим ESM-синтаксис для исполнения под vm.runInContext (не-module режим).
// Ключевая тонкость: в vm.runInContext *только* `var` и `function` попадают
// в глобальный scope контекста. `const`/`let`/`class` создают локальные биндинги
// внутри скрипта и недоступны снаружи.
// Поэтому:
//   `import ...`                  → удаляем (зависимости уже в контексте)
//   `export function F(...)`      → `function F(...)`       (ок — попадает в ctx)
//   `export async function F(...)`→ `async function F(...)` (ок)
//   `export const X = ...`        → `var X = ...`           (const→var, доступно извне)
//   `export let X = ...`          → `var X = ...`
//   `export var X = ...`          → `var X = ...`
//   `export class C {...}`        → `var C = class {...}`   (class→var-присваивание)
//   `export { a, b }`             → удаляем (re-export, здесь не нужен)
//   `export default ...`          → пропускаем префикс
function stripESM(src) {
  let out = src;

  // многострочные `import { A, B, \n C } from '...'`
  out = out.replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?\s*$/gm, '');
  // однострочные `import { A } from '...'`
  out = out.replace(/^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?\s*$/gm, '');
  // `import X from '...'` и `import * as X from '...'`
  out = out.replace(/^\s*import\s+[\w*\s,{}]+\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  // side-effect `import '...'`
  out = out.replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  // `export { a, b, c }` (re-export)
  out = out.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  // `export default ...` — убираем префикс, оставляя выражение
  out = out.replace(/^\s*export\s+default\s+/gm, '');
  // `export class Foo` → `var Foo = class Foo`
  out = out.replace(/^(\s*)export\s+class\s+([A-Za-z_$][\w$]*)/gm, '$1var $2 = class $2');
  // `export function` / `export async function` — снимаем префикс, function сам попадает в globals
  out = out.replace(/^(\s*)export\s+(async\s+)?function\s/gm, '$1$2function ');
  // `export const` / `export let` / `export var` → `var` (чтобы попало в ctx глобалы)
  out = out.replace(/^(\s*)export\s+(const|let|var)\s/gm, '$1var ');
  return out;
}

// Порт _isStubNation из engine/economy.js:161. Повторяем здесь чтобы анализатор
// мог работать без загрузки engine.
// Нация считается stub'ом если у неё нет регионов И нет населения.
function nationActive(n) {
  if (!n) return false;
  const hasRegions = Array.isArray(n.regions) && n.regions.length > 0;
  const pop = n.population?.total ?? 0;
  return hasRegions || pop > 0;
}

// Снапшот одного хода — что пишем в NDJSON. Компактный, без служебных полей.
// Для 500 ходов × ~50 активных наций × ~35 товаров выходит ~40 MB — приемлемо.
function captureSnapshot(GS, turn) {
  const nations = {};
  for (const [id, n] of Object.entries(GS.nations || {})) {
    if (!nationActive(n)) continue;
    const eco = n.economy || {};
    nations[id] = {
      treasury: eco.treasury ?? 0,
      income:   eco.income_per_turn ?? 0,
      expense:  eco.expenses_per_turn ?? 0,
      inflation: (GS.economy_ext?.inflation?.[id]) ?? 0,
      pop: n.population?.total ?? 0,
      happiness: n.population?.happiness ?? 0,
      stockpile: { ...(eco.stockpile || {}) },
      production_last_tick: { ...(eco._production_last_tick || {}) },
      income_breakdown:  { ...(eco._income_breakdown  || {}) },
      expense_breakdown: { ...(eco._expense_breakdown || {}) },
    };
  }

  // Рынок: мировые цены + спрос/предложение. GAME_STATE.market — { [good]: {price, supply, demand, ...} }.
  const market = {};
  const m = GS.market || {};
  for (const [good, row] of Object.entries(m)) {
    if (!row || typeof row !== 'object') continue;
    market[good] = {
      price:  row.price ?? row.current_price ?? 0,
      supply: row.supply ?? row.last_supply ?? 0,
      demand: row.demand ?? row.last_demand ?? 0,
      shortage_streak: row.shortage_streak ?? 0,
    };
  }

  const ext = GS.economy_ext || {};

  // Этап 3 economic3.md — суммарная казна и последние 3 audit-записи.
  // Позволяют анализатору ловить drift без парсинга всего snapshot'а.
  let totalMoney = 0;
  for (const n of Object.values(GS.nations || {})) {
    totalMoney += (n?.economy?.treasury) || 0;
  }
  const auditLog = Array.isArray(GS._money_audit) ? GS._money_audit : [];
  const recentAudit = auditLog.slice(-3);
  const materialAuditLog = Array.isArray(GS._material_audit) ? GS._material_audit : [];
  const recentMaterialAudit = materialAuditLog.slice(-3);

  return {
    turn,
    nations,
    market,
    economy_ext: {
      monopolies: { ...(ext.monopolies || {}) },
      economic_cycle: ext.economic_cycle ? { ...ext.economic_cycle } : null,
    },
    total_money: Math.round(totalMoney),
    money_audit_recent: recentAudit,
    material_audit_recent: recentMaterialAudit,
  };
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function pctChange(from, to) {
  if (from === 0) return to === 0 ? 0 : Infinity;
  return (to - from) / Math.abs(from);
}

module.exports = {
  mulberry32,
  stripESM,
  captureSnapshot,
  nationActive,
  mean,
  stdDev,
  percentile,
  pctChange,
};
