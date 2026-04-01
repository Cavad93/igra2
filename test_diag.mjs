/**
 * Расширенная диагностика Ancient Strategy
 * Тесты: NaN/Infinity, diplomacy leak, timing, loans, war, SuperOU, 10 turns
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'fs';

const SHOTS = '/tmp/igra2_shots_diag';
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
  if (m.type() === 'warning') warns.push(m.text().slice(0,120));
});
page.on('pageerror', e => errors.push('PAGE: ' + e.message));

console.log('\n🌍 Загрузка игры...');
await page.goto('file:///home/user/igra2/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
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
  const m = document.getElementById('api-key-modal');
  if (m) m.style.display = 'none';
});

const modalSel = '#api-key-modal';
const isVisible = await page.isVisible(modalSel).catch(() => false);
if (isVisible) {
  await page.fill('#akm-groq-input', 'gsk_mocktestkey1234567890abcdef1234567890abcdef').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#akm-btn').catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const m = document.getElementById('api-key-modal');
    if (m) m.style.display = 'none';
  });
}

console.log('  ⏳ Ждём инициализации...');
await page.waitForFunction(
  () => typeof GAME_STATE !== 'undefined'
     && GAME_STATE.nations
     && Object.keys(GAME_STATE.nations).length > 5
     && GAME_STATE.turn >= 1,
  { timeout: 60000 }
).catch(() => console.log('⚠ GAME_STATE не готов'));

await snap(page, 'start');

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 1: NaN/Infinity в казне всех наций
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 1: NaN/Infinity в казне ───');
const nanCheck = await page.evaluate(() => {
  const bad = [];
  for (const [id, n] of Object.entries(GAME_STATE.nations || {})) {
    const t = n?.economy?.treasury;
    const inc = n?.economy?.income_per_turn;
    const exp = n?.economy?.expense_per_turn;
    if (!Number.isFinite(t) && t !== undefined) bad.push({ id, field: 'treasury', val: t });
    if (!Number.isFinite(inc) && inc !== undefined) bad.push({ id, field: 'income', val: inc });
    if (!Number.isFinite(exp) && exp !== undefined) bad.push({ id, field: 'expense', val: exp });
  }
  return { total: Object.keys(GAME_STATE.nations || {}).length, bad };
});
if (nanCheck.bad.length === 0) {
  console.log(`  ✅ Все ${nanCheck.total} наций: казна/доход/расход конечны`);
} else {
  console.log(`  ❌ NaN/Infinity найдено в ${nanCheck.bad.length} записях:`);
  nanCheck.bad.slice(0, 10).forEach(b => console.log(`     ${b.id}.${b.field} = ${b.val}`));
}

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 2: Утечка diplomacy.relations
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 2: Размер diplomacy.relations ───');
const relCheck = await page.evaluate(() => {
  const count = Object.keys(GAME_STATE?.diplomacy?.relations || {}).length;
  return { count, limit: 80000 };
});
if (relCheck.count < relCheck.limit) {
  console.log(`  ✅ relations: ${relCheck.count} < ${relCheck.limit}`);
} else {
  console.log(`  ❌ Утечка! relations: ${relCheck.count} >= ${relCheck.limit}`);
}

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 3: Займ → ход → платёж списан
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 3: Цикл займа takeLoan() → ход → платёж ───');
const loanBefore = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const loans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
  const n = GAME_STATE.nations[player];
  return {
    loanCount: loans.length,
    treasury: Math.round(n?.economy?.treasury ?? 0),
    player,
  };
});
console.log(`  До займа: казна=${loanBefore.treasury}, займов=${loanBefore.loanCount}`);

const loanResult = await page.evaluate(() => {
  try {
    if (typeof takeLoan === 'function') {
      const result = takeLoan(GAME_STATE.player_nation, 5000, 12);
      return { ok: true, result };
    }
    return { ok: false, error: 'takeLoan не найдена' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});
if (!loanResult.ok) {
  console.log(`  ⚠ ${loanResult.error}`);
} else {
  console.log(`  ✅ takeLoan() вызван`);
}

const loanAfterTake = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const loans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
  const n = GAME_STATE.nations[player];
  return {
    loanCount: loans.length,
    treasury: Math.round(n?.economy?.treasury ?? 0),
    totalDebt: Math.round(loans.reduce((s,l) => s + l.remaining, 0)),
    monthlyPayment: Math.round(loans.reduce((s,l) => s + (l.monthly_payment || 0), 0)),
  };
});
console.log(`  После займа: казна=${loanAfterTake.treasury}, займов=${loanAfterTake.loanCount}, долг=${loanAfterTake.totalDebt}, платёж/ход=${loanAfterTake.monthlyPayment}`);

// Делаем ход и проверяем погашение
const debtBefore = loanAfterTake.totalDebt;

const clickedLoan = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
  if (btn && !btn.disabled) { btn.click(); return true; }
  return false;
});
if (clickedLoan) {
  try {
    await waitTurn(page, 60000);
    const loanAfterTurn = await page.evaluate(() => {
      const player = GAME_STATE.player_nation;
      const loans = (GAME_STATE.loans || []).filter(l => l.nation_id === player && !l.defaulted && l.remaining > 0);
      return {
        loanCount: loans.length,
        totalDebt: Math.round(loans.reduce((s,l) => s + l.remaining, 0)),
      };
    });
    if (loanAfterTurn.totalDebt < debtBefore) {
      console.log(`  ✅ Долг уменьшился: ${debtBefore} → ${loanAfterTurn.totalDebt}`);
    } else if (loanAfterTurn.totalDebt === debtBefore) {
      console.log(`  ❌ Долг не изменился после хода: ${debtBefore} → ${loanAfterTurn.totalDebt}`);
    } else {
      console.log(`  ❌ Долг вырос: ${debtBefore} → ${loanAfterTurn.totalDebt}`);
    }
  } catch(e) {
    console.log(`  ⏰ Ход завис: ${e.message.slice(0,80)}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 4: Война declareWar() → 2 хода → армия у врага
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 4: Война declareWar() → армия врага ───');
const warSetup = await page.evaluate(() => {
  try {
    const player = GAME_STATE.player_nation;
    // Найти соседнюю/мирную нацию (не в войне)
    const allNations = Object.keys(GAME_STATE.nations);
    let target = null;
    for (const id of allNations) {
      if (id === player) continue;
      const rel = GAME_STATE.diplomacy?.relations;
      const key1 = `${player}_${id}`;
      const key2 = `${id}_${player}`;
      const r = rel?.[key1] || rel?.[key2];
      if (!r?.war && !r?.at_war && !r?.alliance) { target = id; break; }
    }
    if (!target) return { ok: false, error: 'нет подходящей нации для войны' };

    const targetNation = GAME_STATE.nations[target];
    const armyBefore = (targetNation?.armies || []).length;

    if (typeof declareWar === 'function') {
      declareWar(player, target);
    } else if (typeof DiplomacyEngine !== 'undefined' && DiplomacyEngine?.declareWar) {
      DiplomacyEngine.declareWar(player, target);
    } else {
      return { ok: false, error: 'declareWar не найдена' };
    }

    // Проверить что война объявлена
    const key1 = `${player}_${target}`;
    const key2 = `${target}_${player}`;
    const relAfter = GAME_STATE.diplomacy?.relations;
    // declareWar sets rel.war (not rel.at_war) in GAME_STATE.diplomacy.relations
    const r1 = relAfter?.[key1]?.war;
    const r2 = relAfter?.[key2]?.war;

    return { ok: true, target, armyBefore, atWar: r1 || r2 };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

if (!warSetup.ok) {
  console.log(`  ⚠ ${warSetup.error}`);
} else {
  console.log(`  ✅ Война объявлена против ${warSetup.target}, at_war=${warSetup.atWar}`);
  if (!warSetup.atWar) {
    console.log(`  ❌ Флаг at_war не установлен в diplomacy.relations`);
  }

  // 2 хода
  let armyAfter = warSetup.armyBefore;
  for (let i = 0; i < 2; i++) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
    if (!clicked) { console.log(`  ⚠ Кнопка не найдена на ходу ${i+1}`); break; }
    try {
      await waitTurn(page, 60000);
      armyAfter = await page.evaluate((tgt) => {
        return (GAME_STATE.nations[tgt]?.armies || []).length;
      }, warSetup.target);
      console.log(`  Ход ${i+1}: армий у ${warSetup.target} = ${armyAfter}`);
    } catch(e) {
      console.log(`  ⏰ Ход ${i+1} завис: ${e.message.slice(0,80)}`);
      break;
    }
  }

  if (armyAfter > warSetup.armyBefore) {
    console.log(`  ✅ Армия врага появилась: ${warSetup.armyBefore} → ${armyAfter}`);
  } else {
    console.log(`  ⚠ Армия не изменилась: ${warSetup.armyBefore} → ${armyAfter} (возможно нет провинций рядом)`);
  }
}
await snap(page, 'after_war');

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 5: SuperOU — все 5 категорий остаются массивами
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 5: SuperOU категории ───');
const ouCheck = await page.evaluate(() => {
  const player = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[player];
  if (!nation._ou) return { hasOu: false };

  const categories = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  const results = {};
  for (const cat of categories) {
    const val = nation._ou[cat];
    results[cat] = {
      isArray: Array.isArray(val),
      type: typeof val,
      length: Array.isArray(val) ? val.length : null,
      value: Array.isArray(val) ? val.slice(0,3) : val,
    };
  }
  return { hasOu: true, results };
});

if (!ouCheck.hasOu) {
  console.log('  ⚠ _ou не инициализирован для игрока');
} else {
  let allOk = true;
  for (const [cat, info] of Object.entries(ouCheck.results)) {
    if (info.isArray) {
      console.log(`  ✅ _ou.${cat}: Array[${info.length}]`);
    } else {
      console.log(`  ❌ _ou.${cat}: ${info.type} = ${JSON.stringify(info.value)}`);
      allOk = false;
    }
  }
  if (allOk) console.log('  ✅ Все 5 категорий SuperOU — массивы');
}

// Проверить несколько AI наций
const ouNationsCheck = await page.evaluate(() => {
  const categories = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  let initialized = 0, notInit = 0, badCat = [];
  for (const [id, nation] of Object.entries(GAME_STATE.nations || {})) {
    if (!nation._ou) { notInit++; continue; }
    initialized++;
    for (const cat of categories) {
      if (!Array.isArray(nation._ou[cat])) {
        badCat.push({ id, cat, type: typeof nation._ou[cat] });
      }
    }
  }
  return { initialized, notInit, badCat: badCat.slice(0, 10) };
});
console.log(`  Нации с _ou: ${ouNationsCheck.initialized}, без: ${ouNationsCheck.notInit}`);
if (ouNationsCheck.badCat.length > 0) {
  console.log(`  ❌ Нарушения структуры _ou:`);
  ouNationsCheck.badCat.forEach(b => console.log(`     ${b.id}._ou.${b.cat}: ${b.type}`));
} else if (ouNationsCheck.initialized > 0) {
  console.log(`  ✅ Все инициализированные нации: структура _ou корректна`);
}

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 6: Профиль времени ходов
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 6: 10 ходов подряд + профиль времени ───');
const turnResults = [];
let totalTurns = 0;

for (let i = 0; i < 10; i++) {
  const t0 = Date.now();

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  if (!clicked) {
    console.log(`  ⚠ Ход ${i+1}: кнопка недоступна`);
    break;
  }

  try {
    await waitTurn(page, 60000);
    const elapsed = Date.now() - t0;
    const info = await page.evaluate(() => {
      const n = GAME_STATE.nations[GAME_STATE.player_nation];
      const relCount = Object.keys(GAME_STATE?.diplomacy?.relations || {}).length;
      return {
        turn: GAME_STATE.turn,
        treasury: Math.round(n?.economy?.treasury ?? 0),
        relCount,
      };
    });
    const status = elapsed > 3000 ? '⚠ SLOW' : '✅';
    console.log(`  Ход ${i+1}: ${elapsed}ms ${status} | казна=${info.treasury} | relations=${info.relCount}`);
    turnResults.push({ turn: i+1, elapsed, ...info });
    totalTurns++;
  } catch(e) {
    const elapsed = Date.now() - t0;
    console.log(`  ❌ Ход ${i+1} завис после ${elapsed}ms: ${e.message.slice(0,80)}`);
    await snap(page, `stuck_turn${i+1}`);
    break;
  }
}
await snap(page, 'after_10_turns');

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 7: Повторный NaN check + relations leak после 10 ходов
// ══════════════════════════════════════════════════════════════════
console.log('\n─── ТЕСТ 7: Проверка после 10 ходов ───');
const finalCheck = await page.evaluate(() => {
  const bad = [];
  for (const [id, n] of Object.entries(GAME_STATE.nations || {})) {
    const t = n?.economy?.treasury;
    if (!Number.isFinite(t) && t !== undefined) bad.push({ id, val: t });
  }
  const relCount = Object.keys(GAME_STATE?.diplomacy?.relations || {}).length;
  return { bad: bad.slice(0,10), relCount, totalNations: Object.keys(GAME_STATE.nations || {}).length };
});

if (finalCheck.bad.length === 0) {
  console.log(`  ✅ NaN/Infinity: ни одного из ${finalCheck.totalNations} наций`);
} else {
  console.log(`  ❌ NaN/Infinity в казне: ${finalCheck.bad.length} наций`);
  finalCheck.bad.forEach(b => console.log(`     ${b.id}: ${b.val}`));
}

if (finalCheck.relCount < 80000) {
  console.log(`  ✅ relations: ${finalCheck.relCount} < 80000`);
} else {
  console.log(`  ❌ Утечка relations: ${finalCheck.relCount}`);
}

// ══════════════════════════════════════════════════════════════════
// ИТОГИ
// ══════════════════════════════════════════════════════════════════
const slowTurns = turnResults.filter(t => t.elapsed > 3000);
const relevant_errors = errors.filter(e =>
  !e.includes('407') && !e.includes('ERR_NAME') && !e.includes('favicon') && !e.includes('Leaflet')
  && !e.includes('api.groq.com') && !e.includes('api.anthropic.com') && !e.includes('CORS')
  && !e.includes('ERR_FAILED')
);

console.log('\n═══════════════════════════════════════');
console.log('ИТОГИ ДИАГНОСТИКИ');
console.log('═══════════════════════════════════════');
console.log(`Ходов завершено: ${totalTurns}/10`);
console.log(`Медленных ходов (>3s): ${slowTurns.length}`);
if (slowTurns.length > 0) slowTurns.forEach(t => console.log(`  Ход ${t.turn}: ${t.elapsed}ms`));
console.log(`NaN в казне: ${nanCheck.bad.length === 0 ? '✅ нет' : '❌ ' + nanCheck.bad.length}`);
console.log(`Relations leak: ${finalCheck.relCount < 80000 ? '✅ ' + finalCheck.relCount : '❌ ' + finalCheck.relCount}`);
console.log(`JS ошибки: ${relevant_errors.length === 0 ? '✅ нет' : '❌ ' + relevant_errors.length}`);
if (relevant_errors.length > 0) {
  [...new Set(relevant_errors)].slice(0,10).forEach(e => console.log(`  ${e.slice(0,150)}`));
}

await browser.close();
console.log(`\n📁 Скриншоты: ${SHOTS}/`);
fs.readdirSync(SHOTS).forEach(f => console.log(`  ${f}`));
