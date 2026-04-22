'use strict';
// tests/eco_stress_analyze.cjs — читает NDJSON от eco_stress_harness.cjs,
// прогоняет через инварианты и поведенческие детекторы, печатает markdown-отчёт.
//
// Запуск:
//   node tests/eco_stress_analyze.cjs perf/eco_run.ndjson
//   node tests/eco_stress_analyze.cjs perf/eco_run.ndjson --report=perf/eco_report.md
//
// Exit codes:
//   0 — всё чисто
//   1 — найдены жёсткие нарушения инвариантов (NaN, отриц. запасы, кап инфляции)
//   2 — найдены поведенческие аномалии (гиперинфляция, застрявшие цены, и т.п.)

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const { mean, stdDev, percentile, pctChange } =
  require(path.join(__dirname, 'shared', 'eco_metrics.cjs'));

// ──────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { input: null, report: null, topN: 5 };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--report=')) args.report = a.slice(9);
    else if (a.startsWith('--top=')) args.topN = parseInt(a.slice(6), 10) || 5;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a.startsWith('--')) { console.error(`[analyze] unknown flag: ${a}`); process.exit(2); }
    else if (!args.input) args.input = a;
    else { console.error(`[analyze] лишний позиционный аргумент: ${a}`); process.exit(2); }
  }
  if (!args.input) {
    console.error('[analyze] укажите путь к NDJSON: node tests/eco_stress_analyze.cjs perf/eco_run.ndjson');
    process.exit(2);
  }
  return args;
}

function printHelp() {
  console.log('Usage: node tests/eco_stress_analyze.cjs <input.ndjson> [--report=out.md] [--top=5]');
}

// ──────────────────────────────────────────────────────────────
// Инварианты и пороги
// ──────────────────────────────────────────────────────────────
const INFLATION_MAX  = 0.25;   // из engine/economy_ext.js:480
const SHORTAGE_CAP   = 8;      // из CONFIG.BALANCE.SHORTAGE_STREAK_CAP
const CHRONIC_SHORTAGE_WINDOW = 15;   // ходов с shortage_streak==CAP подряд → хронический
const HYPER_INFLATION_RATIO = 3.0;    // x3 за 20 ходов → гиперинфляция
const HYPER_INFLATION_WINDOW = 20;
const STUCK_PRICE_WINDOW = 50;        // цена не движется 50 ходов
const STUCK_PRICE_AMPLITUDE = 0.01;   // амплитуда < 1% от базы → застряла
const MONOPOLY_STAGNATION_WINDOW = 100;
const MARKET_VANISH_WINDOW = 10;      // supply==0 на 10 ходов подряд → рынок исчез
const EXPONENTIAL_STOCK_RATIO = 10;   // stock(t) / stock(t-50) > 10 → переполнение
const EXPONENTIAL_WINDOW = 50;
const SYSTEMIC_DEFICIT_NATIONS_PCT = 0.80;   // ≥80% наций одновременно в минусе
const SYSTEMIC_DEFICIT_WINDOW = 5;

// ──────────────────────────────────────────────────────────────
// Загрузка NDJSON
// ──────────────────────────────────────────────────────────────
// Стримовое чтение — иначе V8 ERR_STRING_TOO_LONG на файлах >512 MB.
async function loadNDJSON(filepath) {
  const snapshots = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filepath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { snapshots.push(JSON.parse(trimmed)); }
    catch (e) { throw new Error(`Битая строка #${lineNum}: ${e.message}`); }
  }
  return snapshots;
}

function loadMeta(filepath) {
  const metaPath = filepath + '.meta.json';
  if (!fs.existsSync(metaPath)) return null;
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
  catch { return null; }
}

// ──────────────────────────────────────────────────────────────
// Детекторы — жёсткие инварианты
// ──────────────────────────────────────────────────────────────
function isFinite(x) { return typeof x === 'number' && Number.isFinite(x); }

function detectHardViolations(snapshots) {
  const violations = [];

  for (const s of snapshots) {
    // nation-level
    for (const [nId, n] of Object.entries(s.nations)) {
      if (!isFinite(n.treasury))   violations.push({ kind: 'nan_treasury',   turn: s.turn, nation: nId, value: n.treasury });
      if (!isFinite(n.pop))        violations.push({ kind: 'nan_population', turn: s.turn, nation: nId, value: n.pop });
      if (!isFinite(n.inflation))  violations.push({ kind: 'nan_inflation',  turn: s.turn, nation: nId, value: n.inflation });
      if (n.inflation < 0 || n.inflation > INFLATION_MAX + 1e-6) {
        violations.push({ kind: 'inflation_out_of_bounds', turn: s.turn, nation: nId, value: n.inflation });
      }
      for (const [good, qty] of Object.entries(n.stockpile || {})) {
        if (!isFinite(qty)) {
          violations.push({ kind: 'nan_stockpile', turn: s.turn, nation: nId, good, value: qty });
        } else if (qty < 0) {
          violations.push({ kind: 'negative_stockpile', turn: s.turn, nation: nId, good, value: qty });
        }
      }
    }
    // market-level
    for (const [good, row] of Object.entries(s.market || {})) {
      if (!isFinite(row.price))  violations.push({ kind: 'nan_price',  turn: s.turn, good, value: row.price });
      else if (row.price < 0)    violations.push({ kind: 'negative_price', turn: s.turn, good, value: row.price });
      if (!isFinite(row.supply)) violations.push({ kind: 'nan_supply', turn: s.turn, good, value: row.supply });
      if (!isFinite(row.demand)) violations.push({ kind: 'nan_demand', turn: s.turn, good, value: row.demand });
    }
  }

  return violations;
}

// ──────────────────────────────────────────────────────────────
// Детекторы — поведенческие паттерны
// ──────────────────────────────────────────────────────────────

// Хронический дефицит товара у нации: shortage_streak держится на CAP ≥ N ходов.
// Но shortage_streak — глобальный по товару, не per-nation. Так что детектируем глобально.
function detectChronicShortage(snapshots) {
  const alerts = [];
  const streakByGood = new Map();   // good → сколько ходов подряд streak == CAP

  for (const s of snapshots) {
    for (const [good, row] of Object.entries(s.market || {})) {
      if (row.shortage_streak >= SHORTAGE_CAP) {
        const cur = (streakByGood.get(good) || 0) + 1;
        streakByGood.set(good, cur);
        if (cur === CHRONIC_SHORTAGE_WINDOW) {
          alerts.push({ kind: 'chronic_shortage', turn: s.turn, good,
                        detail: `shortage_streak=${SHORTAGE_CAP} держится ${CHRONIC_SHORTAGE_WINDOW}+ ходов подряд` });
        }
      } else {
        streakByGood.set(good, 0);
      }
    }
  }
  return alerts;
}

// Гиперинфляция: price(t)/price(t-20) > 3.0 с монотонным ростом.
function detectHyperInflation(snapshots) {
  const alerts = [];
  const pricesByGood = new Map();   // good → Array<{t, price}>

  for (const s of snapshots) {
    for (const [good, row] of Object.entries(s.market || {})) {
      if (!pricesByGood.has(good)) pricesByGood.set(good, []);
      pricesByGood.get(good).push({ t: s.turn, price: row.price });
    }
  }

  for (const [good, series] of pricesByGood.entries()) {
    for (let i = HYPER_INFLATION_WINDOW; i < series.length; i++) {
      const now = series[i];
      const prev = series[i - HYPER_INFLATION_WINDOW];
      if (prev.price <= 0) continue;
      const ratio = now.price / prev.price;
      if (ratio > HYPER_INFLATION_RATIO) {
        // проверим монотонность роста — не больше 20% «обратных» шагов
        let reversions = 0;
        for (let j = i - HYPER_INFLATION_WINDOW + 1; j <= i; j++) {
          if (series[j].price < series[j - 1].price) reversions++;
        }
        if (reversions < HYPER_INFLATION_WINDOW * 0.2) {
          alerts.push({ kind: 'hyper_inflation', turn: now.t, good,
                        detail: `цена ${prev.price.toFixed(2)} → ${now.price.toFixed(2)} (×${ratio.toFixed(1)}) за ${HYPER_INFLATION_WINDOW} ходов` });
          break;   // по одному алерту на товар
        }
      }
    }
  }
  return alerts;
}

// Застрявшие цены: max-min < 1% от base за 50 ходов.
function detectStuckPrices(snapshots) {
  const alerts = [];
  const pricesByGood = new Map();

  for (const s of snapshots) {
    for (const [good, row] of Object.entries(s.market || {})) {
      if (!pricesByGood.has(good)) pricesByGood.set(good, []);
      pricesByGood.get(good).push(row.price);
    }
  }

  for (const [good, series] of pricesByGood.entries()) {
    if (series.length < STUCK_PRICE_WINDOW) continue;
    // смотрим только последнее окно
    const window = series.slice(-STUCK_PRICE_WINDOW);
    const base = window[0] || 1;
    const hi = Math.max(...window);
    const lo = Math.min(...window);
    if (base > 0 && (hi - lo) / base < STUCK_PRICE_AMPLITUDE) {
      alerts.push({ kind: 'stuck_price', turn: snapshots.at(-1).turn, good,
                    detail: `амплитуда ${((hi - lo) / base * 100).toFixed(2)}% за ${STUCK_PRICE_WINDOW} ходов` });
    }
  }
  return alerts;
}

// Исчезновение рынка: supply == 0 в течение N ходов подряд.
function detectMarketVanish(snapshots) {
  const alerts = [];
  const streak = new Map();

  for (const s of snapshots) {
    for (const [good, row] of Object.entries(s.market || {})) {
      if ((row.supply || 0) === 0) {
        const cur = (streak.get(good) || 0) + 1;
        streak.set(good, cur);
        if (cur === MARKET_VANISH_WINDOW) {
          alerts.push({ kind: 'market_vanish', turn: s.turn, good,
                        detail: `supply=0 подряд ${MARKET_VANISH_WINDOW}+ ходов` });
        }
      } else {
        streak.set(good, 0);
      }
    }
  }
  return alerts;
}

// Стагнация монополии: monopolies[good] == тот же игрок N ходов подряд.
function detectMonopolyStagnation(snapshots) {
  const alerts = [];
  if (snapshots.length < MONOPOLY_STAGNATION_WINDOW) return alerts;

  const firstMono = snapshots[0].economy_ext?.monopolies || {};
  const lastMono  = snapshots.at(-1).economy_ext?.monopolies || {};

  for (const good of Object.keys(firstMono)) {
    let stable = true;
    for (const s of snapshots) {
      if ((s.economy_ext?.monopolies || {})[good] !== firstMono[good]) { stable = false; break; }
    }
    if (stable && lastMono[good] === firstMono[good]) {
      alerts.push({ kind: 'monopoly_stagnation', turn: snapshots.at(-1).turn, good,
                    detail: `${firstMono[good]} держит монополию на ${good} все ${snapshots.length} ходов` });
    }
  }
  return alerts;
}

// Экспоненциальные запасы (переполнение у нации по товару).
function detectExponentialStock(snapshots) {
  const alerts = [];
  if (snapshots.length < EXPONENTIAL_WINDOW + 1) return alerts;

  // Сэмплируем только последние ходы + 50 назад.
  const lastIdx = snapshots.length - 1;
  const prevIdx = lastIdx - EXPONENTIAL_WINDOW;
  const last = snapshots[lastIdx];
  const prev = snapshots[prevIdx];

  for (const [nId, n] of Object.entries(last.nations)) {
    const nPrev = prev.nations[nId];
    if (!nPrev) continue;
    for (const [good, qty] of Object.entries(n.stockpile || {})) {
      const qtyPrev = (nPrev.stockpile || {})[good] || 0;
      if (qtyPrev > 100 && qty / qtyPrev > EXPONENTIAL_STOCK_RATIO) {
        alerts.push({ kind: 'exponential_stock', turn: last.turn, nation: nId, good,
                      detail: `${qtyPrev.toFixed(0)} → ${qty.toFixed(0)} (×${(qty / qtyPrev).toFixed(1)}) за ${EXPONENTIAL_WINDOW} ходов` });
      }
    }
  }
  return alerts;
}

// Этап 3 economic3.md — Money conservation drift.
// Если GAME_STATE._money_audit накопил > 10 записей drift'а за прогон, это значит:
// где-то в движке монеты появляются/исчезают без учёта в breakdown'ах, что приводит
// к unbounded growth (seleukid +909 трлн за 500 ходов, главный корень).
// Дополнительно смотрим total_money: экспоненциальный рост (×10+ за 100 ходов) — алерт.
function detectMoneyLeak(snapshots) {
  const alerts = [];
  if (!snapshots.length) return alerts;

  // Собираем все уникальные audit-события по turn.
  const auditByTurn = new Map();
  for (const s of snapshots) {
    if (!Array.isArray(s.money_audit_recent)) continue;
    for (const a of s.money_audit_recent) {
      if (a && a.turn) auditByTurn.set(a.turn, a);
    }
  }
  const audits = [...auditByTurn.values()].sort((a, b) => a.turn - b.turn);

  if (audits.length > 10) {
    // Считаем насколько большой накопленный drift.
    const totalDrift = audits.reduce((s, a) => s + (a.delta || 0), 0);
    const maxSingle = audits.reduce((m, a) => Math.max(m, Math.abs(a.delta || 0)), 0);
    alerts.push({
      kind: 'money_leak',
      turn: audits[audits.length - 1].turn,
      detail: `${audits.length} drift-событий, сумма ${totalDrift.toLocaleString('ru-RU')}, max один ${maxSingle.toLocaleString('ru-RU')}`,
    });

    // Этап 10 (диагностика): агрегируем top_offenders — какие нации утекают сильнее.
    // Суммируем |drift| по каждой нации через все audit-события. Топ-10 → отдельный алерт.
    const perNationDrift = new Map();
    for (const a of audits) {
      if (!Array.isArray(a.top_offenders)) continue;
      for (const off of a.top_offenders) {
        if (!off || !off.nation) continue;
        perNationDrift.set(off.nation, (perNationDrift.get(off.nation) || 0) + (off.drift || 0));
      }
    }
    if (perNationDrift.size > 0) {
      const top = [...perNationDrift.entries()]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 10);
      const summary = top.map(([n, d]) => `${n}:${d >= 0 ? '+' : ''}${Math.round(d).toLocaleString('ru-RU')}`).join(', ');
      alerts.push({
        kind: 'money_leak',
        turn: audits[audits.length - 1].turn,
        detail: `top-10 наций по drift: ${summary}`,
      });
    }
  }

  // Total-money экспоненциальный рост: сравниваем total_money(последний) / total_money(начало).
  if (snapshots.length >= 20) {
    const first = snapshots[0].total_money || 0;
    const last  = snapshots[snapshots.length - 1].total_money || 0;
    if (first > 0 && last / first > 10) {
      alerts.push({
        kind: 'money_leak',
        turn: snapshots[snapshots.length - 1].turn,
        detail: `total_money вырос ×${(last / first).toFixed(1)} за ${snapshots.length} ходов (${first.toLocaleString('ru-RU')} → ${last.toLocaleString('ru-RU')})`,
      });
    }
  }

  return alerts;
}

// Этап 11.1 economic4.md — Material balance drift.
// Если GAME_STATE._material_audit накопил > 10 записей за прогон, значит
// Δstockpile[good] ≠ production + trade_in − consumption − spoilage ± event,
// то есть часть товарных изменений не отслеживается (capital inputs, army).
// Показываем top-10 товаров по суммарному drift'у, как в money_leak.
function detectMaterialLeak(snapshots) {
  const alerts = [];
  if (!snapshots.length) return alerts;

  const auditByTurn = new Map();
  for (const s of snapshots) {
    if (!Array.isArray(s.material_audit_recent)) continue;
    for (const a of s.material_audit_recent) {
      if (a && a.turn) auditByTurn.set(a.turn, a);
    }
  }
  const audits = [...auditByTurn.values()].sort((a, b) => a.turn - b.turn);

  if (audits.length > 10) {
    const totalEvents = audits.reduce((s, a) => s + (a.drift_count || 0), 0);
    const perGood = new Map();
    for (const a of audits) {
      if (!Array.isArray(a.top_goods)) continue;
      for (const tg of a.top_goods) {
        if (!tg || !tg.good) continue;
        perGood.set(tg.good, (perGood.get(tg.good) || 0) + (tg.total_drift || 0));
      }
    }
    const topGoods = [...perGood.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);

    alerts.push({
      kind: 'material_leak',
      turn: audits[audits.length - 1].turn,
      detail: `${audits.length} ходов с drift'ом, суммарно ${totalEvents} нация×товар пар`,
    });
    if (topGoods.length) {
      const summary = topGoods.map(([g, s]) =>
        `${g}:${s >= 0 ? '+' : ''}${Math.round(s).toLocaleString('ru-RU')}`
      ).join(', ');
      alerts.push({
        kind: 'material_leak',
        turn: audits[audits.length - 1].turn,
        detail: `top-10 товаров по drift: ${summary}`,
      });
    }
  }

  return alerts;
}

// Системный дефицит казны: ≥ 80% активных наций одновременно с отрицательной казной.
function detectSystemicDeficit(snapshots) {
  const alerts = [];
  let streak = 0;

  for (const s of snapshots) {
    const ids = Object.keys(s.nations);
    if (!ids.length) continue;
    const deficits = ids.filter(id => s.nations[id].treasury < 0).length;
    const pct = deficits / ids.length;
    if (pct >= SYSTEMIC_DEFICIT_NATIONS_PCT) {
      streak++;
      if (streak === SYSTEMIC_DEFICIT_WINDOW) {
        alerts.push({ kind: 'systemic_deficit', turn: s.turn,
                      detail: `${(pct * 100).toFixed(0)}% наций в минусе подряд ${SYSTEMIC_DEFICIT_WINDOW}+ ходов` });
      }
    } else {
      streak = 0;
    }
  }
  return alerts;
}

// ──────────────────────────────────────────────────────────────
// Агрегированная статистика
// ──────────────────────────────────────────────────────────────
function topTreasuryDelta(snapshots, topN, direction) {
  // direction: +1 для топ роста, -1 для топ падения
  if (snapshots.length < 2) return [];
  const first = snapshots[0];
  const last  = snapshots.at(-1);
  const deltas = [];
  for (const nId of Object.keys(first.nations)) {
    const a = first.nations[nId]?.treasury ?? 0;
    const b = last.nations[nId]?.treasury  ?? 0;
    deltas.push({ nation: nId, from: a, to: b, delta: b - a });
  }
  deltas.sort((x, y) => direction * (y.delta - x.delta));
  return deltas.slice(0, topN);
}

function goodPriceDispersion(snapshots) {
  const seriesByGood = new Map();
  for (const s of snapshots) {
    for (const [good, row] of Object.entries(s.market || {})) {
      if (!seriesByGood.has(good)) seriesByGood.set(good, []);
      seriesByGood.get(good).push(row.price);
    }
  }
  const rows = [];
  for (const [good, series] of seriesByGood.entries()) {
    const m = mean(series);
    const sd = stdDev(series);
    const cv = m > 0 ? sd / m : 0;
    rows.push({ good, mean: m, std: sd, cv_pct: cv * 100,
                p10: percentile(series, 0.10), p50: percentile(series, 0.50), p90: percentile(series, 0.90) });
  }
  rows.sort((a, b) => b.cv_pct - a.cv_pct);
  return rows;
}

// ──────────────────────────────────────────────────────────────
// Markdown-отчёт
// ──────────────────────────────────────────────────────────────
function fmtNum(x, digits = 0) {
  if (!isFinite(x)) return String(x);
  return x.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function buildReport(snapshots, meta, hard, soft, topN) {
  const lines = [];
  lines.push('# Eco Stress Report');
  lines.push('');
  if (meta) {
    lines.push(`- **Seed:** ${meta.seed}`);
    lines.push(`- **Turns:** ${meta.turns}`);
    lines.push(`- **Mode:** ${meta.mode}`);
    lines.push(`- **Nations:** ${meta.nations_count}`);
    lines.push(`- **Wall-time:** ${meta.elapsed_ms} ms (сборка ${meta.build_ms} ms, симуляция ${meta.sim_ms} ms)`);
    lines.push(`- **Timestamp:** ${meta.timestamp}`);
    lines.push('');
  } else {
    lines.push(`- **Snapshots:** ${snapshots.length}`);
    lines.push('');
  }

  // ── Раздел 1: жёсткие инварианты ─────────────────────────────
  lines.push('## Жёсткие инварианты');
  lines.push('');
  if (hard.length === 0) {
    lines.push('✅ Нарушений не найдено.');
  } else {
    const byKind = groupBy(hard, v => v.kind);
    lines.push(`❌ Найдено **${hard.length}** нарушений по ${Object.keys(byKind).length} типам:`);
    lines.push('');
    lines.push('| Тип | Кол-во | Первое | Последнее |');
    lines.push('|-----|-------:|-------:|----------:|');
    for (const [kind, arr] of Object.entries(byKind)) {
      lines.push(`| \`${kind}\` | ${arr.length} | ход ${arr[0].turn} | ход ${arr.at(-1).turn} |`);
    }
    lines.push('');
    lines.push('### Примеры (первые 10)');
    lines.push('');
    for (const v of hard.slice(0, 10)) {
      const bits = [`ход ${v.turn}`, `тип \`${v.kind}\``];
      if (v.nation) bits.push(`нация \`${v.nation}\``);
      if (v.good)   bits.push(`товар \`${v.good}\``);
      if (v.value !== undefined) bits.push(`value=${v.value}`);
      lines.push(`- ${bits.join(', ')}`);
    }
  }
  lines.push('');

  // ── Раздел 2: поведенческие аномалии ────────────────────────
  lines.push('## Поведенческие аномалии');
  lines.push('');
  if (soft.length === 0) {
    lines.push('✅ Подозрительных паттернов не найдено.');
  } else {
    const byKind = groupBy(soft, v => v.kind);
    lines.push(`⚠ Найдено **${soft.length}** паттернов по ${Object.keys(byKind).length} типам:`);
    lines.push('');
    lines.push('| Тип | Кол-во |');
    lines.push('|-----|-------:|');
    for (const [kind, arr] of Object.entries(byKind)) {
      lines.push(`| \`${kind}\` | ${arr.length} |`);
    }
    lines.push('');
    lines.push('### Подробности');
    lines.push('');
    for (const v of soft) {
      const bits = [`ход **${v.turn}**`, `\`${v.kind}\``];
      if (v.nation) bits.push(`нация \`${v.nation}\``);
      if (v.good)   bits.push(`товар \`${v.good}\``);
      if (v.detail) bits.push(v.detail);
      lines.push(`- ${bits.join(' · ')}`);
    }
  }
  lines.push('');

  // ── Раздел 3: динамика казны ─────────────────────────────────
  lines.push('## Динамика казны (начало → конец прогонa)');
  lines.push('');
  const topGrow = topTreasuryDelta(snapshots, topN, +1);
  const topFall = topTreasuryDelta(snapshots, topN, -1);
  lines.push(`### Топ-${topN} рост`);
  lines.push('');
  lines.push('| Нация | От | До | Δ |');
  lines.push('|-------|----:|----:|---:|');
  for (const r of topGrow) {
    lines.push(`| \`${r.nation}\` | ${fmtNum(r.from)} | ${fmtNum(r.to)} | ${r.delta >= 0 ? '+' : ''}${fmtNum(r.delta)} |`);
  }
  lines.push('');
  lines.push(`### Топ-${topN} падение`);
  lines.push('');
  lines.push('| Нация | От | До | Δ |');
  lines.push('|-------|----:|----:|---:|');
  for (const r of topFall) {
    lines.push(`| \`${r.nation}\` | ${fmtNum(r.from)} | ${fmtNum(r.to)} | ${fmtNum(r.delta)} |`);
  }
  lines.push('');

  // ── Раздел 4: дисперсия цен ──────────────────────────────────
  lines.push('## Дисперсия цен (CV = σ/μ)');
  lines.push('');
  lines.push('| Товар | Среднее | σ | CV% | p10 | p50 | p90 |');
  lines.push('|-------|--------:|---:|----:|----:|----:|----:|');
  for (const r of goodPriceDispersion(snapshots)) {
    lines.push(`| \`${r.good}\` | ${r.mean.toFixed(2)} | ${r.std.toFixed(2)} | ${r.cv_pct.toFixed(1)}% | ${r.p10.toFixed(2)} | ${r.p50.toFixed(2)} | ${r.p90.toFixed(2)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

function groupBy(arr, fn) {
  const out = {};
  for (const x of arr) {
    const k = fn(x);
    if (!out[k]) out[k] = [];
    out[k].push(x);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  const absIn = path.resolve(args.input);

  console.log(`[analyze] читаем ${args.input}...`);
  const snapshots = await loadNDJSON(absIn);
  const meta      = loadMeta(absIn);
  console.log(`[analyze] снапшотов: ${snapshots.length}`);

  console.log(`[analyze] прогоняем инварианты...`);
  const hard = detectHardViolations(snapshots);

  console.log(`[analyze] прогоняем поведенческие детекторы...`);
  const soft = [
    ...detectChronicShortage(snapshots),
    ...detectHyperInflation(snapshots),
    ...detectStuckPrices(snapshots),
    ...detectMarketVanish(snapshots),
    ...detectMonopolyStagnation(snapshots),
    ...detectExponentialStock(snapshots),
    ...detectSystemicDeficit(snapshots),
    ...detectMoneyLeak(snapshots),
    ...detectMaterialLeak(snapshots),
  ];

  const report = buildReport(snapshots, meta, hard, soft, args.topN);

  if (args.report) {
    const absOut = path.resolve(args.report);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, report);
    console.log(`[analyze] отчёт записан в ${args.report}`);
  } else {
    console.log('\n' + report);
  }

  console.log(`[analyze] итог: ${hard.length} жёстких нарушений, ${soft.length} паттернов`);
  if (hard.length > 0) process.exit(1);
  if (soft.length > 0) process.exit(2);
  process.exit(0);
}

main().catch(e => { console.error('[analyze] fatal:', e); process.exit(3); });
