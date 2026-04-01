import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'fs';

const SHOTS = '/tmp/igra2_shots_ext';
fs.mkdirSync(SHOTS, { recursive: true });
fs.readdirSync(SHOTS).forEach(f => fs.unlinkSync(`${SHOTS}/${f}`));

let shot = 0;
async function snap(page, label) {
  const file = `${SHOTS}/${String(++shot).padStart(2,'0')}_${label}.png`;
  await page.screenshot({ path: file, fullPage: false, timeout: 8000 }).catch(() => {});
  console.log(`  📸 ${label}`);
}

async function waitTurn(page, ms = 60000) {
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => (x.textContent.includes('Следующий') || x.id === 'next-turn-btn'));
    return b && !b.disabled && !b.textContent.includes('⏳');
  }, { timeout: ms });
}

async function clickNextTurn(page) {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
    if (btn && !btn.disabled) { btn.click(); return btn.textContent.trim(); }
    return null;
  });
  return clicked;
}

const browser = await chromium.launch({ headless: true, args: [
  '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--allow-file-access-from-files',
]});
const ctx  = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

await page.route('**/api.groq.com/**', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait","reasoning":"[mock]"}' } }] }),
}));
await page.route('**/api.anthropic.com/**', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ content: [{ text: '{"action":"wait","reasoning":"[mock]"}' }] }),
}));

const errors = [], warns = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', e => errors.push('PAGE: ' + e.message));

// ─── Load page ───────────────────────────────────────────────────────────────
console.log('\n🌍 Загрузка страницы...');
await page.goto('http://localhost:8181/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  if (typeof CONFIG !== 'undefined') {
    CONFIG.API_KEY      = 'sk-ant-mock000000000000000000000000000000000000000';
    CONFIG.GROQ_API_KEY = 'gsk_mock000000000000000000000000000000000000000000';
  }
  window.getAIWarDecision   = async () => ({ action: 'defend', reasoning: '[mock]', tactic: 'defensive' });
  window.getGroqDecision    = async () => ({ action: 'wait',   reasoning: '[mock]' });
  window._callGroqViaWorker = async () => null;
  window.fetchGroq          = async () => ({ choices: [{ message: { content: '{"action":"wait"}' } }] });
});

const modalSel = '#api-key-modal';
const isVisible = await page.isVisible(modalSel).catch(() => false);
if (isVisible) {
  await page.fill('#akm-groq-input', 'gsk_mocktestkey1234567890abcdef1234567890abcdef').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#akm-btn').catch(() => {});
  await page.waitForTimeout(1500);
  const stillVisible = await page.isVisible(modalSel).catch(() => false);
  if (stillVisible) {
    await page.evaluate(() => {
      const m = document.getElementById('api-key-modal');
      if (m) m.style.display = 'none';
    });
  }
}

await page.waitForFunction(
  () => typeof GAME_STATE !== 'undefined'
     && GAME_STATE.nations
     && Object.keys(GAME_STATE.nations).length > 5
     && GAME_STATE.turn >= 1,
  { timeout: 60000 }
).catch(() => console.log('⚠ GAME_STATE не готов'));

await snap(page, 'loaded');

const results = {
  nanInTreasury: [],
  relationsSize: 0,
  turnTimings: [],
  loanCycle: null,
  warTest: null,
  superOuTest: null,
  tenTurns: null,
};

// ─── TEST 1: NaN/Infinity in treasury for all nations ────────────────────────
console.log('\n🔢 Тест 1: NaN/Infinity в казне всех наций...');
const nanResult = await page.evaluate(() => {
  const bad = [];
  for (const [id, nation] of Object.entries(GAME_STATE.nations || {})) {
    const t = nation?.economy?.treasury;
    const inc = nation?.economy?.income_per_turn;
    const exp = nation?.economy?.expense_per_turn;
    if (!isFinite(t) || !isFinite(inc) || !isFinite(exp)) {
      bad.push({ id, treasury: t, income: inc, expense: exp });
      if (bad.length >= 20) break; // limit output
    }
  }
  return bad;
});
results.nanInTreasury = nanResult;
if (nanResult.length === 0) {
  console.log('  ✅ NaN/Infinity не обнаружены');
} else {
  console.log(`  ❌ Найдено ${nanResult.length} наций с NaN/Infinity:`);
  nanResult.slice(0,5).forEach(n => console.log(`    ${n.id}: treasury=${n.treasury} income=${n.income} expense=${n.expense}`));
}

// ─── TEST 2: Diplomacy relations leak ────────────────────────────────────────
console.log('\n📊 Тест 2: Утечка GAME_STATE.diplomacy.relations...');
const relSize = await page.evaluate(() => {
  const rels = GAME_STATE?.diplomacy?.relations;
  if (!rels) return { count: 0, sample: [] };
  const keys = Object.keys(rels);
  const sample = keys.slice(0, 3).map(k => ({ k, v: rels[k] }));
  return { count: keys.length, sample };
});
results.relationsSize = relSize.count;
const limit = 80000;
if (relSize.count < limit) {
  console.log(`  ✅ relations размер: ${relSize.count} < ${limit}`);
} else {
  console.log(`  ❌ relations УТЕЧКА: ${relSize.count} >= ${limit}`);
}
if (relSize.sample.length) {
  console.log(`  Пример ключей:`, relSize.sample.map(s => s.k).join(', '));
}

// ─── TEST 3: Turn timing profiling ───────────────────────────────────────────
console.log('\n⏱ Тест 3: Профиль времени ходов (лимит 3000ms)...');
const TURN_LIMIT_MS = 3000;
let turnsFailed = 0;
for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  const clicked = await clickNextTurn(page);
  if (!clicked) { console.log(`  ⚠ Ход ${i}: кнопка не найдена`); break; }
  try {
    await waitTurn(page, 60000);
    const elapsed = Date.now() - t0;
    results.turnTimings.push({ turn: i, ms: elapsed });
    const ok = elapsed < TURN_LIMIT_MS;
    console.log(`  Ход ${i}: ${elapsed}ms ${ok ? '✅' : '❌ МЕДЛЕННО'}`);
    if (!ok) turnsFailed++;
  } catch(e) {
    const elapsed = Date.now() - t0;
    results.turnTimings.push({ turn: i, ms: elapsed, stuck: true });
    console.log(`  Ход ${i}: ⏰ ЗАВИС (${elapsed}ms): ${e.message.slice(0,60)}`);
    turnsFailed++;
    break;
  }
}

// ─── TEST 4: Loan cycle: takeLoan → turn → payment deducted ──────────────────
console.log('\n💳 Тест 4: Полный цикл займа...');
const loanTest = await page.evaluate(() => {
  try {
    const player = GAME_STATE.player_nation;
    const nation = GAME_STATE.nations[player];
    const beforeTreasury = nation.economy.treasury;
    const beforeLoans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0).length;

    // takeLoan function
    if (typeof takeLoan !== 'function') return { error: 'takeLoan not found' };

    const amount = 5000;
    const months = 12;
    takeLoan(player, amount, months);

    const afterLoans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
    const myLoan = afterLoans.find(l => l.principal >= amount - 100 && l.principal <= amount + 100);

    return {
      beforeTreasury,
      afterTreasury: nation.economy.treasury,
      beforeLoanCount: beforeLoans,
      afterLoanCount: afterLoans.length,
      loanCreated: !!myLoan,
      loanData: myLoan ? { principal: myLoan.principal, monthly: myLoan.monthly_payment, remaining: myLoan.remaining } : null,
    };
  } catch(e) {
    return { error: e.message };
  }
});
results.loanCycle = loanTest;
if (loanTest.error) {
  console.log(`  ❌ Ошибка: ${loanTest.error}`);
} else {
  console.log(`  Казна до: ${loanTest.beforeTreasury} → после: ${loanTest.afterTreasury}`);
  console.log(`  Займов до: ${loanTest.beforeLoanCount} → после: ${loanTest.afterLoanCount}`);
  console.log(`  Заём создан: ${loanTest.loanCreated ? '✅' : '❌'}`);
  if (loanTest.loanData) {
    console.log(`  Заём: principal=${loanTest.loanData.principal} monthly=${loanTest.loanData.monthly} remaining=${loanTest.loanData.remaining}`);
  }
}

// Turn to verify payment deducted
console.log('  Проверяем списание платежа через 1 ход...');
const loansBefore = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const loans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
  return loans.map(l => ({ id: l.id, remaining: l.remaining }));
});

const clicked4 = await clickNextTurn(page);
if (clicked4) {
  try {
    await waitTurn(page, 60000);
    const loansAfter = await page.evaluate(() => {
      const player = GAME_STATE.player_nation;
      const loans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
      return loans.map(l => ({ id: l.id, remaining: l.remaining }));
    });

    // Check if remaining decreased for our loans
    let paymentOk = false;
    for (const before of loansBefore) {
      const after = loansAfter.find(l => l.id === before.id);
      if (after && after.remaining < before.remaining) {
        paymentOk = true;
        console.log(`  ✅ Платёж списан: ${before.remaining} → ${after.remaining}`);
        break;
      }
    }
    if (!paymentOk && loansBefore.length > 0) {
      console.log(`  ❌ Платёж НЕ списан (займы до: ${JSON.stringify(loansBefore)}, после: ${JSON.stringify(loansAfter)})`);
    } else if (loansBefore.length === 0) {
      console.log(`  ℹ️ Нет займов для проверки`);
    }
    results.loanCycle.paymentOk = paymentOk;
  } catch(e) {
    console.log(`  ⏰ Ход завис: ${e.message.slice(0,60)}`);
  }
}

// ─── TEST 5: War: declareWar → 2 turns → enemy has army ─────────────────────
console.log('\n⚔️ Тест 5: Война — declareWar → 2 хода → враг получил армию...');
const warTest = await page.evaluate(() => {
  try {
    if (typeof declareWar !== 'function') return { error: 'declareWar not found' };

    const player = GAME_STATE.player_nation;
    // Find a non-player nation to attack
    const target = Object.keys(GAME_STATE.nations).find(n => {
      if (n === player) return false;
      const diplo = GAME_STATE.diplomacy?.relations?.[`${player}_${n}`] || GAME_STATE.diplomacy?.relations?.[`${n}_${player}`];
      const at_war = GAME_STATE.wars?.some(w =>
        (w.attacker === player && w.defender === n) ||
        (w.attacker === n && w.defender === player)
      );
      return !at_war;
    });
    if (!target) return { error: 'no target found' };

    const beforeWars = (GAME_STATE.wars || []).length;
    declareWar(player, target);
    const afterWars = (GAME_STATE.wars || []).length;
    const warCreated = afterWars > beforeWars;

    return { target, beforeWars, afterWars, warCreated };
  } catch(e) {
    return { error: e.message };
  }
});
results.warTest = warTest;

if (warTest.error) {
  console.log(`  ❌ Ошибка: ${warTest.error}`);
} else {
  console.log(`  Цель: ${warTest.target}`);
  console.log(`  Война объявлена: ${warTest.warCreated ? '✅' : '❌'} (войн: ${warTest.beforeWars} → ${warTest.afterWars})`);
}

if (warTest.warCreated) {
  // 2 turns
  for (let i = 0; i < 2; i++) {
    const c = await clickNextTurn(page);
    if (!c) { console.log('  ⚠ Кнопка не найдена'); break; }
    try {
      await waitTurn(page, 60000);
      console.log(`  Ход ${i+1} после войны ✅`);
    } catch(e) {
      console.log(`  Ход ${i+1} после войны завис: ${e.message.slice(0,60)}`);
      break;
    }
  }

  const armyCheck = await page.evaluate((target) => {
    const nation = GAME_STATE.nations[target];
    const armies = GAME_STATE.armies?.filter(a => a.nation_id === target) || [];
    const hasArmy = armies.length > 0 || (nation?.military?.army_size > 0);
    return {
      armyCount: armies.length,
      armySize: nation?.military?.army_size,
      hasArmy,
    };
  }, warTest.target);

  console.log(`  Армии врага: ${armyCheck.armyCount} юнитов, размер армии: ${armyCheck.armySize}`);
  console.log(`  У врага есть армия: ${armyCheck.hasArmy ? '✅' : '❌'}`);
  results.warTest.armyCheck = armyCheck;
}

await snap(page, 'after_war');

// ─── TEST 6: SuperOU — all 5 categories remain arrays ────────────────────────
console.log('\n🏛 Тест 6: SuperOU — 5 категорий остаются массивами...');
const ouTest = await page.evaluate(() => {
  try {
    const player = GAME_STATE.player_nation;
    const nation = GAME_STATE.nations[player];
    const ou = nation?._ou;
    if (!ou) return { error: '_ou not found on player nation' };

    const categories = ['economy', 'military', 'diplomacy', 'internal', 'technology'];
    const results = {};
    for (const cat of categories) {
      const val = ou[cat];
      results[cat] = {
        isArray: Array.isArray(val),
        type: typeof val,
        length: Array.isArray(val) ? val.length : null,
        value: !Array.isArray(val) ? String(val).slice(0, 50) : undefined,
      };
    }
    return results;
  } catch(e) {
    return { error: e.message };
  }
});
results.superOuTest = ouTest;

if (ouTest.error) {
  console.log(`  ❌ Ошибка: ${ouTest.error}`);
} else {
  let ouOk = true;
  for (const [cat, info] of Object.entries(ouTest)) {
    if (info.isArray) {
      console.log(`  ✅ _ou.${cat}: Array[${info.length}]`);
    } else {
      console.log(`  ❌ _ou.${cat}: ${info.type} = ${info.value}`);
      ouOk = false;
    }
  }
  results.superOuTest.allArrays = ouOk;
}

// ─── TEST 7: 10 turns without freezing ───────────────────────────────────────
console.log('\n🔄 Тест 7: 10 ходов подряд без зависаний...');
let currentTurn = await page.evaluate(() => GAME_STATE.turn);
console.log(`  Текущий ход: ${currentTurn}`);

let successTurns = 0;
let failedTurn = null;

for (let i = 0; i < 10; i++) {
  const t0 = Date.now();
  const c = await clickNextTurn(page);
  if (!c) { console.log(`  ⚠ Ход ${i+1}: кнопка не найдена`); failedTurn = i+1; break; }
  try {
    await waitTurn(page, 60000);
    const elapsed = Date.now() - t0;
    const turnNum = await page.evaluate(() => GAME_STATE.turn);
    console.log(`  Ход ${i+1}: ✅ (${elapsed}ms, game turn ${turnNum})`);
    successTurns++;
  } catch(e) {
    const elapsed = Date.now() - t0;
    console.log(`  Ход ${i+1}: ⏰ ЗАВИС (${elapsed}ms)`);
    failedTurn = i+1;

    // Диагностика кнопки
    const btnTxt = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.includes('⏳') || x.id === 'next-turn-btn');
      return b ? b.textContent.trim().slice(0,50) : 'не найдена';
    });
    console.log(`  Статус кнопки: "${btnTxt}"`);
    break;
  }
}

results.tenTurns = { success: successTurns, failed: failedTurn };
if (successTurns === 10) {
  console.log(`  ✅ Все 10 ходов прошли успешно`);
} else {
  console.log(`  ❌ Прошло ${successTurns}/10 ходов, сбой на ходу ${failedTurn}`);
}

await snap(page, 'after_10_turns');

// ─── Check diplomacy relations after all turns ───────────────────────────────
console.log('\n📊 Проверка утечки relations после всех ходов...');
const relSizeFinal = await page.evaluate(() => {
  const rels = GAME_STATE?.diplomacy?.relations;
  if (!rels) return 0;
  return Object.keys(rels).length;
});
console.log(`  Relations после ${successTurns} ходов: ${relSizeFinal} (было: ${relSize.count})`);
if (relSizeFinal >= limit) {
  console.log(`  ❌ УТЕЧКА: ${relSizeFinal} >= ${limit}`);
} else {
  console.log(`  ✅ Норма`);
}
results.relationsAfter = relSizeFinal;

// ─── Final NaN check ─────────────────────────────────────────────────────────
console.log('\n🔢 Финальная проверка NaN после всех ходов...');
const nanFinal = await page.evaluate(() => {
  const bad = [];
  for (const [id, nation] of Object.entries(GAME_STATE.nations || {})) {
    const t = nation?.economy?.treasury;
    const inc = nation?.economy?.income_per_turn;
    if (!isFinite(t) || !isFinite(inc)) {
      bad.push({ id, treasury: t, income: inc });
      if (bad.length >= 10) break;
    }
  }
  return bad;
});
if (nanFinal.length === 0) {
  console.log('  ✅ NaN/Infinity не обнаружены');
} else {
  console.log(`  ❌ Найдено ${nanFinal.length} наций с NaN/Infinity после ходов`);
  nanFinal.slice(0,5).forEach(n => console.log(`    ${n.id}: treasury=${n.treasury} income=${n.income}`));
}

// ─── JS Errors summary ───────────────────────────────────────────────────────
const relevant_errors = errors.filter(e =>
  !e.includes('407') && !e.includes('ERR_NAME') && !e.includes('favicon') && !e.includes('Leaflet')
  && !e.includes('api.groq.com') && !e.includes('api.anthropic.com') && !e.includes('CORS')
  && !e.includes('ERR_FAILED') && !e.includes('net::ERR')
);

console.log('\n═══════════════════════════════════════');
console.log('📋 ИТОГИ РАСШИРЕННОЙ ДИАГНОСТИКИ');
console.log('═══════════════════════════════════════');
console.log(`NaN в казне:           ${results.nanInTreasury.length === 0 ? '✅ 0' : '❌ ' + results.nanInTreasury.length}`);
console.log(`Relations утечка:      ${results.relationsSize < limit ? '✅ ' + results.relationsSize : '❌ ' + results.relationsSize}`);
console.log(`Профиль ходов:         ${results.turnTimings.map(t => `${t.ms}ms`).join(', ') || 'н/д'}`);
console.log(`Заём создан:           ${results.loanCycle?.loanCreated ? '✅' : '❌ ' + (results.loanCycle?.error || 'нет')}`);
console.log(`Платёж списан:         ${results.loanCycle?.paymentOk ? '✅' : '❌'}`);
console.log(`Война объявлена:       ${results.warTest?.warCreated ? '✅' : '❌ ' + (results.warTest?.error || 'нет')}`);
console.log(`Армия у врага:         ${results.warTest?.armyCheck?.hasArmy ? '✅' : '⚠ нет данных'}`);
console.log(`SuperOU массивы:       ${results.superOuTest?.allArrays ? '✅' : '❌'}`);
console.log(`10 ходов без зависаний: ${results.tenTurns?.success === 10 ? '✅' : '❌ ' + results.tenTurns?.success + '/10'}`);
console.log(`NaN финал:             ${nanFinal.length === 0 ? '✅ 0' : '❌ ' + nanFinal.length}`);
console.log(`JS ошибки:             ${relevant_errors.length === 0 ? '✅ 0' : '❌ ' + relevant_errors.length}`);

if (relevant_errors.length > 0) {
  console.log('\nJS ошибки:');
  [...new Set(relevant_errors)].slice(0,15).forEach(e => console.log(`  ${e.slice(0,180)}`));
}

await browser.close();
console.log(`\n📁 Скриншоты: ${SHOTS}/`);
fs.readdirSync(SHOTS).forEach(f => console.log(`  ${f}`));
