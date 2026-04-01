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
      .find(x => x.textContent.includes('Следующий') || x.id === 'next-turn-btn');
    return b && !b.disabled && !b.textContent.includes('⏳');
  }, { timeout: ms });
}

async function setupMocks(page) {
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
  if (m.type() === 'warning') warns.push(m.text().slice(0, 120));
});
page.on('pageerror', e => errors.push('PAGE: ' + e.message));

console.log('\n🔬 Расширенная диагностика Ancient Strategy\n');

// ─── Загрузка ────────────────────────────────────────────────────────────────
await page.goto('file:///home/user/igra2/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(2000);
await setupMocks(page);

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

await snap(page, 'init');

const results = {
  nanTreasury: null,
  relationsLeak: null,
  turnTimings: [],
  loanCycle: null,
  warTest: null,
  superOU: null,
  tenTurns: null,
};

// ─── 1. NaN/Infinity в казне всех наций ──────────────────────────────────────
console.log('═══ TEST 1: NaN/Infinity в казне ═══');
const nanCheck = await page.evaluate(() => {
  const nations = Object.entries(GAME_STATE.nations);
  const bad = [];
  for (const [id, n] of nations) {
    const t = n?.economy?.treasury;
    const inc = n?.economy?.income_per_turn;
    const exp = n?.economy?.expense_per_turn;
    if (!isFinite(t) || !isFinite(inc) || !isFinite(exp)) {
      bad.push({ id, treasury: t, income: inc, expense: exp });
    }
  }
  return { total: nations.length, bad };
});
if (nanCheck.bad.length === 0) {
  console.log(`✅ Казна OK: ${nanCheck.total} наций, NaN/Infinity нет`);
  results.nanTreasury = 'PASS';
} else {
  console.log(`❌ NaN/Infinity в казне ${nanCheck.bad.length} наций:`);
  nanCheck.bad.slice(0, 10).forEach(b => console.log(`   ${b.id}: treasury=${b.treasury} income=${b.income} expense=${b.expense}`));
  results.nanTreasury = `FAIL: ${nanCheck.bad.length} наций`;
}

// ─── 2. Утечка GAME_STATE.diplomacy.relations ─────────────────────────────────
// NOTE: Game uses lazy init for large maps (>200 nations), so relations starts empty.
// We check this AFTER turns are processed (Test 3+), see final check after Test 7.
console.log('\n═══ TEST 2: Утечка diplomacy.relations (ленивая инициализация) ═══');
const relCheck = await page.evaluate(() => {
  const rel = GAME_STATE?.diplomacy?.relations;
  if (!rel) return { exists: false, count: 0 };
  const count = typeof rel === 'object' ? Object.keys(rel).length : 0;
  return { exists: true, count };
});
if (!relCheck.exists) {
  console.log('  ⚠ diplomacy.relations не найден ещё (до первого хода — OK для lazy init)');
  results.relationsLeak = 'DEFERRED';
} else if (relCheck.count < 80000) {
  console.log(`  ✅ Relations до ходов: ${relCheck.count} записей (< 80000)`);
  results.relationsLeak = `DEFERRED (${relCheck.count} до ходов)`;
} else {
  console.log(`  ❌ УТЕЧКА уже до ходов: ${relCheck.count} записей!`);
  results.relationsLeak = `FAIL: ${relCheck.count}`;
}

// ─── 3. Профиль времени ходов ─────────────────────────────────────────────────
console.log('\n═══ TEST 3: Профиль времени ходов (лимит 3000ms) ═══');
const timings = [];
for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
    if (btn && !btn.disabled) { btn.click(); return btn.textContent.trim(); }
    return null;
  });
  if (!clicked) { console.log(`  ⚠ Ход ${i}: кнопка не найдена`); break; }
  try {
    await waitTurn(page, 60000);
    const elapsed = Date.now() - t0;
    timings.push(elapsed);
    const status = elapsed > 3000 ? '⚠ SLOW' : '✅';
    console.log(`  Ход ${i}: ${elapsed}ms ${status}`);
    results.turnTimings.push({ turn: i, ms: elapsed, ok: elapsed <= 3000 });
  } catch(e) {
    const elapsed = Date.now() - t0;
    console.log(`  ❌ Ход ${i} завис после ${elapsed}ms: ${e.message.slice(0, 60)}`);
    results.turnTimings.push({ turn: i, ms: elapsed, ok: false, error: e.message.slice(0, 60) });
    await snap(page, `turn${i}_stuck`);
    break;
  }
}

// ─── 4. Полный цикл займа ─────────────────────────────────────────────────────
console.log('\n═══ TEST 4: Цикл займа takeLoan() → ход → платёж ═══');
const loanTest = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[player];
  const beforeTreasury = nation?.economy?.treasury ?? 0;
  const beforeLoans = (GAME_STATE.loans ?? []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
  return { beforeTreasury, beforeLoanCount: beforeLoans.length };
});
console.log(`  До займа: казна=${Math.round(loanTest.beforeTreasury)}, займов=${loanTest.beforeLoanCount}`);

// Берём заём через UI
const hasTreasury = await page.evaluate(() => typeof showTreasuryOverlay === 'function');
if (hasTreasury) {
  await page.evaluate(() => showTreasuryOverlay());
  await page.waitForTimeout(500);
  await page.fill('#tp-loan-amount', '5000').catch(() => {});
  await page.evaluate(() => _tpUpdateLoanPreview && _tpUpdateLoanPreview());
  await page.waitForTimeout(200);

  const canLoan = await page.$eval('.tp-loan-btn:not(.danger)', b => !b.disabled).catch(() => false);
  if (canLoan) {
    await page.click('.tp-loan-btn:not(.danger)');
    await page.waitForTimeout(300);
    const afterLoan = await page.evaluate(() => {
      const player = GAME_STATE.player_nation;
      const nation = GAME_STATE.nations[player];
      const loans = (GAME_STATE.loans ?? []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
      return {
        treasury: nation?.economy?.treasury ?? 0,
        loanCount: loans.length,
        totalDebt: loans.reduce((s, l) => s + l.remaining, 0),
        monthlyPayment: loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0),
      };
    });
    console.log(`  После займа: казна=${Math.round(afterLoan.treasury)}, займов=${afterLoan.loanCount}, долг=${Math.round(afterLoan.totalDebt)}, платёж/мес=${Math.round(afterLoan.monthlyPayment)}`);
    await page.evaluate(() => hideTreasuryOverlay && hideTreasuryOverlay());
    await page.waitForTimeout(200);

    // Делаем ход и проверяем списание
    const debtBefore = afterLoan.totalDebt;
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
    if (clicked) {
      try {
        await waitTurn(page, 60000);
        const afterTurn = await page.evaluate(() => {
          const player = GAME_STATE.player_nation;
          const loans = (GAME_STATE.loans ?? []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
          return {
            totalDebt: loans.reduce((s, l) => s + l.remaining, 0),
            loanCount: loans.length,
          };
        });
        const debtReduced = afterTurn.totalDebt < debtBefore;
        if (debtReduced) {
          console.log(`  ✅ Платёж списан: долг ${Math.round(debtBefore)} → ${Math.round(afterTurn.totalDebt)}`);
          results.loanCycle = 'PASS';
        } else {
          console.log(`  ❌ Долг НЕ уменьшился: ${Math.round(debtBefore)} → ${Math.round(afterTurn.totalDebt)}`);
          results.loanCycle = 'FAIL: долг не уменьшился';
        }
      } catch(e) {
        console.log(`  ❌ Ход завис: ${e.message.slice(0, 60)}`);
        results.loanCycle = 'FAIL: ход завис';
      }
    } else {
      console.log('  ⚠ Не удалось нажать кнопку хода');
      results.loanCycle = 'SKIP';
    }
  } else {
    console.log('  ⚠ Займ недоступен (лимит достигнут)');
    results.loanCycle = 'SKIP: лимит займа';
    await page.evaluate(() => hideTreasuryOverlay && hideTreasuryOverlay());
  }
} else {
  console.log('  ⚠ showTreasuryOverlay недоступна');
  results.loanCycle = 'SKIP';
}

// ─── 5. Война: declareWar() → 2 хода → армия у врага ─────────────────────────
console.log('\n═══ TEST 5: Война declareWar() → армия у врага ═══');
const warSetup = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const nations = Object.keys(GAME_STATE.nations);
  // Ищем нейтральную нацию рядом
  const candidates = nations.filter(id => {
    if (id === player) return false;
    const diplo = GAME_STATE.diplomacy?.relations?.[`${player}_${id}`] ??
                  GAME_STATE.diplomacy?.relations?.[`${id}_${player}`];
    return !diplo || diplo.status !== 'war';
  });
  if (candidates.length === 0) return { ok: false, reason: 'нет кандидатов' };

  const target = candidates[0];
  const targetNation = GAME_STATE.nations[target];
  const armyBefore = (targetNation?.military?.infantry ?? 0) + (GAME_STATE.armies ?? []).filter(a => a.nation === target && a.state !== 'disbanded').reduce((s,a) => s + (a.units?.infantry ?? 0), 0);

  // Объявляем войну
  let warDeclared = false;
  if (typeof declareWar === 'function') {
    try { declareWar(player, target); warDeclared = true; } catch(e) { return { ok: false, reason: e.message }; }
  } else {
    // Прямая установка
    if (!GAME_STATE.diplomacy) GAME_STATE.diplomacy = {};
    if (!GAME_STATE.diplomacy.wars) GAME_STATE.diplomacy.wars = [];
    GAME_STATE.diplomacy.wars.push({ attacker: player, defender: target, turn_started: GAME_STATE.turn });
    warDeclared = true;
  }

  return { ok: warDeclared, target, armyBefore };
});

if (!warSetup.ok) {
  console.log(`  ⚠ Пропускаем: ${warSetup.reason}`);
  results.warTest = 'SKIP';
} else {
  console.log(`  Война объявлена против ${warSetup.target}, армия до: ${warSetup.armyBefore}`);

  // 2 хода
  let warHangs = false;
  for (let i = 1; i <= 2; i++) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
    if (!clicked) { warHangs = true; break; }
    try {
      await waitTurn(page, 60000);
      console.log(`  Ход ${i} после войны пройден`);
    } catch(e) {
      console.log(`  ❌ Ход ${i} завис: ${e.message.slice(0, 60)}`);
      warHangs = true;
      await snap(page, `war_turn${i}_stuck`);
      break;
    }
  }

  if (!warHangs) {
    const armyAfter = await page.evaluate((target) => {
      const n = GAME_STATE.nations[target];
      // Check field armies in GAME_STATE.armies (created via createArmy())
      const fieldArmies = (GAME_STATE.armies ?? []).filter(a => a.nation === target && a.state !== 'disbanded');
      const infantry = n?.military?.infantry ?? 0;
      return { fieldArmies: fieldArmies.length, infantry, totalForce: fieldArmies.reduce((s,a) => s + (a.units?.infantry ?? 0), 0) + infantry };
    }, warSetup.target);

    console.log(`  Армия врага: полевых армий=${armyAfter.fieldArmies}, пехота=${armyAfter.infantry}, всего=${armyAfter.totalForce}`);
    if (armyAfter.totalForce > 0) {
      console.log('  ✅ Войска у врага есть');
      results.warTest = 'PASS';
    } else {
      console.log('  ⚠ Войска = 0 (нация слишком слабая или механика мобилизации не сработала)');
      results.warTest = 'WARN: войска=0';
    }
    await snap(page, 'after_war');
  } else {
    results.warTest = 'FAIL: ходы зависли';
  }
}

// ─── 6. SuperOU: 5 категорий остаются массивами ───────────────────────────────
console.log('\n═══ TEST 6: SuperOU — категории остаются массивами ═══');
const ouCheck = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const ou = GAME_STATE._ou ?? GAME_STATE.nations?.[player]?._ou;
  if (!ou) return { exists: false };
  // Actual categories in super_ou.js: economy, military, diplomacy, politics, goals
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  const results = {};
  for (const cat of cats) {
    const val = ou[cat];
    results[cat] = { exists: val !== undefined, isArray: Array.isArray(val), type: typeof val, len: Array.isArray(val) ? val.length : null };
  }
  return { exists: true, results };
});

if (!ouCheck.exists) {
  console.log('  ⚠ _ou не найден в GAME_STATE');
  results.superOU = 'N/A';
} else {
  let allOk = true;
  // Actual categories in super_ou.js: economy, military, diplomacy, politics, goals
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  for (const cat of cats) {
    const r = ouCheck.results[cat];
    if (!r) {
      console.log(`  ⚠ _ou.${cat}: не проверялся`);
    } else if (!r.exists) {
      console.log(`  ⚠ _ou.${cat}: отсутствует`);
      allOk = false;
    } else if (!r.isArray) {
      console.log(`  ❌ _ou.${cat}: не массив! type=${r.type}`);
      allOk = false;
    } else {
      console.log(`  ✅ _ou.${cat}: массив[${r.len}]`);
    }
  }
  results.superOU = allOk ? 'PASS' : 'FAIL';
}

// ─── 7. 10 ходов подряд ───────────────────────────────────────────────────────
console.log('\n═══ TEST 7: 10 ходов подряд без зависаний ═══');

// Проверяем сколько ходов уже прошло
const currentTurn = await page.evaluate(() => GAME_STATE?.turn ?? 0);
console.log(`  Текущий ход: ${currentTurn}`);

let successTurns = 0;
let failTurns = 0;
const tenTurnTimings = [];

for (let i = 1; i <= 10; i++) {
  const t0 = Date.now();
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  if (!clicked) {
    console.log(`  Ход ${i}: ⚠ кнопка не найдена`);
    failTurns++;
    break;
  }
  try {
    await waitTurn(page, 60000);
    const elapsed = Date.now() - t0;
    tenTurnTimings.push(elapsed);
    successTurns++;
    const slow = elapsed > 3000 ? ' ⚠SLOW' : '';
    process.stdout.write(`  Ход ${i}: ${elapsed}ms${slow}\n`);

    // Проверяем NaN после каждого хода
    const nanAfter = await page.evaluate(() => {
      const player = GAME_STATE.player_nation;
      const n = GAME_STATE.nations[player];
      const t = n?.economy?.treasury;
      return { treasury: t, isNaN: !isFinite(t) };
    });
    if (nanAfter.isNaN) {
      console.log(`  ❌ NaN в казне на ходу ${i}!`);
      failTurns++;
    }

    // Проверяем relations leak
    const relCount = await page.evaluate(() => {
      const rel = GAME_STATE?.diplomacy?.relations;
      return rel ? Object.keys(rel).length : 0;
    });
    if (relCount >= 80000) {
      console.log(`  ❌ УТЕЧКА relations: ${relCount} на ходу ${i}!`);
      failTurns++;
    }
  } catch(e) {
    const elapsed = Date.now() - t0;
    console.log(`  Ход ${i}: ❌ завис ${elapsed}ms — ${e.message.slice(0, 60)}`);
    failTurns++;
    await snap(page, `hang_turn${i}`);
    break;
  }
}

console.log(`  Итого: ${successTurns}/10 ходов успешно, ${failTurns} ошибок`);
if (tenTurnTimings.length > 0) {
  const avg = Math.round(tenTurnTimings.reduce((a, b) => a + b, 0) / tenTurnTimings.length);
  const max = Math.max(...tenTurnTimings);
  console.log(`  Среднее: ${avg}ms, Макс: ${max}ms`);
}
results.tenTurns = failTurns === 0 ? `PASS (${successTurns}/10)` : `FAIL (${successTurns}/10, ${failTurns} ошибок)`;

// Final check for relations leak (after turns have been processed)
const relFinal = await page.evaluate(() => {
  const rel = GAME_STATE?.diplomacy?.relations;
  if (!rel) return { count: 0 };
  return { count: Object.keys(rel).length };
});
if (results.relationsLeak.startsWith('DEFERRED') || results.relationsLeak === 'N/A') {
  if (relFinal.count < 80000) {
    console.log(`  ✅ Relations после ходов: ${relFinal.count} записей (< 80000)`);
    results.relationsLeak = `PASS (${relFinal.count} после ${successTurns} ходов)`;
  } else {
    console.log(`  ❌ УТЕЧКА после ходов: ${relFinal.count} записей!`);
    results.relationsLeak = `FAIL: ${relFinal.count}`;
  }
}

// ─── Финал ───────────────────────────────────────────────────────────────────
await snap(page, 'final');

const relevant_errors = errors.filter(e =>
  !e.includes('407') && !e.includes('ERR_NAME') && !e.includes('favicon') && !e.includes('Leaflet')
  && !e.includes('api.groq.com') && !e.includes('api.anthropic.com') && !e.includes('CORS')
  && !e.includes('ERR_FAILED')
);

console.log('\n═══════════════════════════════════════');
console.log('📋 ИТОГИ РАСШИРЕННОЙ ДИАГНОСТИКИ');
console.log('═══════════════════════════════════════');
console.log(`1. NaN/Infinity в казне:      ${results.nanTreasury}`);
console.log(`2. Утечка relations:          ${results.relationsLeak}`);
console.log(`3. Профиль ходов:             ${results.turnTimings.map(t => `${t.ms}ms`).join(', ') || 'N/A'}`);
console.log(`4. Цикл займа:               ${results.loanCycle}`);
console.log(`5. Война → армия:             ${results.warTest}`);
console.log(`6. SuperOU массивы:           ${results.superOU}`);
console.log(`7. 10 ходов подряд:           ${results.tenTurns}`);
console.log('═══════════════════════════════════════');

if (relevant_errors.length === 0) {
  console.log('✅ JS ошибок нет');
} else {
  console.log(`❌ JS ошибки (${relevant_errors.length}):`);
  [...new Set(relevant_errors)].slice(0, 15).forEach(e => console.log('  ', e.slice(0, 150)));
}

await browser.close();
console.log(`\n📁 Скриншоты: ${SHOTS}/`);
