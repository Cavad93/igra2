// Тесты Шага 26 (arma.md) — Значки-алерты на вкладках панели
// Запуск: node tests/test_arma_stage26.mjs
//
// Чеклист из arma.md Шаг 26:
//   [1] Каждая .lnav-btn имеет дочерний <span class="lnav-badge" id="badge-{tab}">
//       со style="display:none" по умолчанию.
//   [2] CSS .lnav-btn { position: relative; ... }
//   [3] CSS .lnav-badge { position:absolute; top:2px; right:2px;
//       min-width:14px; height:14px; background:#e53935; border-radius:7px;
//       font-size:9px; color:#fff; font-family:sans-serif; display:flex;
//       align-items:center; justify-content:center; font-weight:bold; line-height:1 }
//   [4] В ui/panels.js объявлена function updateAlertBadges(state), экспорт в window.
//   [5] Поведение:
//       - treasury < 0  → badge-economy   показан с '!'
//       - идёт голосование → badge-laws показан с '!'
//       - N армий без приказа → badge-army = N
//       - N входящих дипломатических предложений → badge-diplomacy = N
//       - при нуле алертов — все бейджи скрыты.
//   [6] renderLeftPanelTab(tab) скрывает бейдж открываемой вкладки.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const panelsSrc = readFileSync(resolve(__dirname, '..', 'ui', 'panels.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ───────────────────────────────────────────────────────
section('HTML — <span class="lnav-badge"> внутри каждой .lnav-btn');
// ───────────────────────────────────────────────────────

const tabs = ['overview', 'army', 'economy', 'diplomacy', 'laws'];
for (const t of tabs) {
  const re = new RegExp(
    `<button class="lnav-btn[^"]*"\\s+data-tab="${t}"[\\s\\S]*?<span\\s+class="lnav-badge"\\s+id="badge-${t}"[^>]*style="display:\\s*none"[^>]*>[\\s\\S]*?<\\/span>[\\s\\S]*?<\\/button>`
  );
  check(re.test(indexHtml),
    `[1-${t}] .lnav-btn[data-tab="${t}"] содержит <span class="lnav-badge" id="badge-${t}" style="display:none">`);
}

// ───────────────────────────────────────────────────────
section('CSS — .lnav-btn position:relative + .lnav-badge');
// ───────────────────────────────────────────────────────

// [2] .lnav-btn position:relative
const lnavBtnCssMatch = indexHtml.match(/\.lnav-btn\s*\{[^}]+\}/);
check(!!lnavBtnCssMatch, '[pre] CSS блок .lnav-btn найден');
const lnavBtnCss = lnavBtnCssMatch ? lnavBtnCssMatch[0] : '';
check(/position:\s*relative/.test(lnavBtnCss),
  '[2] .lnav-btn { position: relative }');

// [3] .lnav-badge
const badgeCssMatch = indexHtml.match(/\.lnav-badge\s*\{[^}]+\}/);
check(!!badgeCssMatch, '[pre] CSS блок .lnav-badge найден');
const bc = badgeCssMatch ? badgeCssMatch[0] : '';
check(/position:\s*absolute/.test(bc),                      '[3a] .lnav-badge position:absolute');
check(/top:\s*2px/.test(bc),                                '[3b] .lnav-badge top:2px');
check(/right:\s*2px/.test(bc),                              '[3c] .lnav-badge right:2px');
check(/min-width:\s*14px/.test(bc),                         '[3d] .lnav-badge min-width:14px');
check(/height:\s*14px/.test(bc),                            '[3e] .lnav-badge height:14px');
check(/background:\s*#e53935/i.test(bc),                    '[3f] .lnav-badge background:#e53935');
check(/border-radius:\s*7px/.test(bc),                      '[3g] .lnav-badge border-radius:7px');
check(/font-size:\s*9px/.test(bc),                          '[3h] .lnav-badge font-size:9px');
check(/color:\s*#fff/i.test(bc),                            '[3i] .lnav-badge color:#fff');
check(/font-family:\s*sans-serif/.test(bc),                 '[3j] .lnav-badge font-family:sans-serif');
check(/display:\s*flex/.test(bc),                           '[3k] .lnav-badge display:flex');
check(/align-items:\s*center/.test(bc),                     '[3l] .lnav-badge align-items:center');
check(/justify-content:\s*center/.test(bc),                 '[3m] .lnav-badge justify-content:center');
check(/font-weight:\s*bold/.test(bc),                       '[3n] .lnav-badge font-weight:bold');
check(/line-height:\s*1/.test(bc),                          '[3o] .lnav-badge line-height:1');

// ───────────────────────────────────────────────────────
section('JS — updateAlertBadges объявлена и экспортирована');
// ───────────────────────────────────────────────────────

check(/function\s+updateAlertBadges\s*\(\s*state\s*\)/.test(panelsSrc),
  '[4a] function updateAlertBadges(state) объявлена в ui/panels.js');
check(/window\.updateAlertBadges\s*=\s*updateAlertBadges/.test(panelsSrc),
  '[4b] window.updateAlertBadges = updateAlertBadges');

// renderLeftPanelTab должен скрывать бейдж открытой вкладки
check(/renderLeftPanelTab[\s\S]*?_hideAlertBadge\s*\(\s*tabName\s*\)/.test(panelsSrc),
  '[6] renderLeftPanelTab(tabName) вызывает _hideAlertBadge(tabName)');

// renderLeftPanel должен вызывать updateAlertBadges
check(/renderLeftPanel\s*\([\s\S]*?updateAlertBadges\s*\(/.test(panelsSrc),
  '[4c] renderLeftPanel() вызывает updateAlertBadges(GAME_STATE)');

// ───────────────────────────────────────────────────────
section('Поведение — имитация DOM и вызов updateAlertBadges');
// ───────────────────────────────────────────────────────

// Мини-DOM для бейджей
function makeBadge(id) {
  return {
    _id: id,
    textContent: '',
    style: { display: '' },
  };
}

const badges = {
  overview:  makeBadge('badge-overview'),
  army:      makeBadge('badge-army'),
  economy:   makeBadge('badge-economy'),
  diplomacy: makeBadge('badge-diplomacy'),
  laws:      makeBadge('badge-laws'),
};
// Выставим изначально hidden
for (const k of Object.keys(badges)) badges[k].style.display = 'none';

const byId = {
  'badge-overview':  badges.overview,
  'badge-army':      badges.army,
  'badge-economy':   badges.economy,
  'badge-diplomacy': badges.diplomacy,
  'badge-laws':      badges.laws,
};

const fakeDoc = { getElementById(id) { return byId[id] ?? null; } };
const fakeWindow = {};

// Извлекаем функции
const reSetBadge  = /function\s+_setAlertBadge\s*\([\s\S]*?^\}/m;
const reArmies    = /function\s+_countArmiesWithoutOrders\s*\([\s\S]*?^\}/m;
const reProposals = /function\s+_countIncomingProposals\s*\([\s\S]*?^\}/m;
const reLaws      = /function\s+_isLawVotingActive\s*\([\s\S]*?^\}/m;
const reUpdate    = /function\s+updateAlertBadges\s*\([\s\S]*?^\}/m;
const reHide      = /function\s+_hideAlertBadge\s*\([\s\S]*?^\}/m;

const m1 = panelsSrc.match(reSetBadge);
const m2 = panelsSrc.match(reArmies);
const m3 = panelsSrc.match(reProposals);
const m4 = panelsSrc.match(reLaws);
const m5 = panelsSrc.match(reUpdate);
const m6 = panelsSrc.match(reHide);

check(!!m1 && !!m2 && !!m3 && !!m4 && !!m5 && !!m6,
  '[B0] все вспомогательные функции извлечены из panels.js');

if (m1 && m2 && m3 && m4 && m5 && m6) {
  const factory = new Function(
    'document', 'window',
    `
    ${m1[0]}
    ${m2[0]}
    ${m3[0]}
    ${m4[0]}
    ${m5[0]}
    ${m6[0]}
    return { updateAlertBadges, _hideAlertBadge, _setAlertBadge,
             _countArmiesWithoutOrders, _countIncomingProposals, _isLawVotingActive };
    `
  );
  const api = factory(fakeDoc, fakeWindow);

  // Тест 1: дефицит казны → economy '!'
  const state1 = {
    player_nation: 'P',
    nations: {
      P: {
        economy: { treasury: -10 },
      },
    },
    armies: [],
    orders: [],
    diplomatic_proposals: [],
  };
  api.updateAlertBadges(state1);
  check(badges.economy.style.display !== 'none' && badges.economy.textContent === '!',
    '[5a] treasury < 0 → badge-economy показан с "!"');
  check(badges.army.style.display === 'none',
    '[5a-guard] нет армий → badge-army скрыт');
  check(badges.diplomacy.style.display === 'none',
    '[5a-guard] нет предложений → badge-diplomacy скрыт');
  check(badges.laws.style.display === 'none',
    '[5a-guard] нет голосования → badge-laws скрыт');

  // Тест 2: входящее предложение → diplomacy '1'
  const state2 = {
    player_nation: 'P',
    nations: {
      P: {
        economy: { treasury: 100 },
      },
    },
    armies: [],
    orders: [],
    diplomatic_proposals: [
      { to: 'P', status: 'pending' },
    ],
  };
  api.updateAlertBadges(state2);
  check(badges.diplomacy.style.display !== 'none' && badges.diplomacy.textContent === '1',
    '[5b] одно входящее предложение → badge-diplomacy = "1"');
  check(badges.economy.style.display === 'none',
    '[5b-guard] treasury > 0 → badge-economy скрыт');

  // Тест 3: две армии без приказа → army '2'
  const state3 = {
    player_nation: 'P',
    nations: {
      P: { economy: { treasury: 100 } },
    },
    armies: [
      { id: 'a1', nation: 'P', state: 'idle' },
      { id: 'a2', nation: 'P', state: 'idle' },
      { id: 'a3', nation: 'P', state: 'idle' },  // этот занят приказом
      { id: 'a9', nation: 'OTHER', state: 'idle' }, // чужая армия
    ],
    orders: [
      { army_id: 'a3', status: 'active' },
    ],
    diplomatic_proposals: [],
  };
  api.updateAlertBadges(state3);
  check(badges.army.style.display !== 'none' && badges.army.textContent === '2',
    '[5c] 2 своих армии без активного приказа → badge-army = "2"');

  // Тест 4: идёт голосование → laws '!'
  const state4 = {
    player_nation: 'P',
    nations: {
      P: {
        economy: { treasury: 100 },
        pending_law_vote: { law: { id: 1 } },
      },
    },
    armies: [],
    orders: [],
    diplomatic_proposals: [],
  };
  api.updateAlertBadges(state4);
  check(badges.laws.style.display !== 'none' && badges.laws.textContent === '!',
    '[5d] идёт голосование → badge-laws показан с "!"');

  // Тест 5: все ресурсы в порядке → все бейджи скрыты
  const state5 = {
    player_nation: 'P',
    nations: {
      P: { economy: { treasury: 500 } },
    },
    armies: [],
    orders: [],
    diplomatic_proposals: [],
  };
  api.updateAlertBadges(state5);
  check(badges.economy.style.display   === 'none', '[5e-1] нет алертов → badge-economy   скрыт');
  check(badges.army.style.display      === 'none', '[5e-2] нет алертов → badge-army      скрыт');
  check(badges.diplomacy.style.display === 'none', '[5e-3] нет алертов → badge-diplomacy скрыт');
  check(badges.laws.style.display      === 'none', '[5e-4] нет алертов → badge-laws      скрыт');

  // Тест 6: _hideAlertBadge('economy') скрывает бейдж экономики
  api.updateAlertBadges(state1); // снова дефицит → бейдж показан
  check(badges.economy.style.display !== 'none',
    '[6-pre] badge-economy снова показан после updateAlertBadges(state1)');
  api._hideAlertBadge('economy');
  check(badges.economy.style.display === 'none' && badges.economy.textContent === '',
    '[6] _hideAlertBadge("economy") скрывает бейдж экономики');

  // Тест 7: большие числа ограничены '99+'
  const armiesMany = Array.from({length: 120}, (_, i) => ({
    id: 'x' + i, nation: 'P', state: 'idle'
  }));
  const state7 = {
    player_nation: 'P',
    nations: { P: { economy: { treasury: 10 } } },
    armies: armiesMany,
    orders: [],
    diplomatic_proposals: [],
  };
  api.updateAlertBadges(state7);
  check(badges.army.textContent === '99+',
    '[5f] 120 армий без приказа → badge-army = "99+"');

  // Тест 8: армии в состоянии 'disbanded' не считаются
  const state8 = {
    player_nation: 'P',
    nations: { P: { economy: { treasury: 100 } } },
    armies: [
      { id: 'd1', nation: 'P', state: 'disbanded' },
      { id: 'd2', nation: 'P', state: 'disbanded' },
    ],
    orders: [],
    diplomatic_proposals: [],
  };
  api.updateAlertBadges(state8);
  check(badges.army.style.display === 'none',
    '[5g] disbanded-армии не считаются (badge-army скрыт)');

  // Тест 9: nation.incoming_proposals тоже учитывается
  const state9 = {
    player_nation: 'P',
    nations: {
      P: {
        economy: { treasury: 100 },
        incoming_proposals: [
          { status: 'pending' },
          { status: 'pending' },
        ],
      },
    },
    armies: [],
    orders: [],
    diplomatic_proposals: [
      { to: 'P', status: 'pending' },
    ],
  };
  api.updateAlertBadges(state9);
  check(badges.diplomacy.textContent === '3',
    '[5h] diplomatic_proposals + nation.incoming_proposals суммируются');
}

console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
