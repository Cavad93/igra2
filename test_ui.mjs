import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'fs';

const SHOTS = '/tmp/igra2_shots';
fs.mkdirSync(SHOTS, { recursive: true });
// очищаем старые
fs.readdirSync(SHOTS).forEach(f => fs.unlinkSync(`${SHOTS}/${f}`));

let shot = 0;
async function snap(page, label) {
  const file = `${SHOTS}/${String(++shot).padStart(2,'0')}_${label}.png`;
  await page.screenshot({ path: file, fullPage: false, timeout: 8000 }).catch(() => {});
  console.log(`  📸 ${label}`);
}

async function waitTurn(page, ms = 50000) {
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.includes('Следующий') || x.id === 'next-turn-btn');
    return b && !b.disabled && !b.textContent.includes('⏳');
  }, { timeout: ms });
}

// ─── Запуск браузера ──────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true, args: [
  '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--allow-file-access-from-files',
]});
const ctx  = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Перехватываем AI API запросы — возвращаем мок-ответы вместо реального вызова
await page.route('**/api.groq.com/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait","reasoning":"[mock]"}' } }] }),
}));
await page.route('**/api.anthropic.com/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ content: [{ text: '{"action":"wait","reasoning":"[mock]"}' }] }),
}));

const errors = [], warns = [];
page.on('console', m => {
  if (m.type() === 'error')   errors.push(m.text());
  if (m.type() === 'warning') warns.push(m.text().slice(0,120));
});
page.on('pageerror', e => errors.push('PAGE: ' + e.message));

// ─── 1. Загрузка страницы ─────────────────────────────────────────────────────
console.log('\n🌍 Загрузка...');
await page.goto('file:///home/user/igra2/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(2000);

// ─── 2. Мокаем API и закрываем модал ─────────────────────────────────────────
await page.evaluate(() => {
  if (typeof CONFIG !== 'undefined') {
    CONFIG.API_KEY      = 'sk-ant-mock000000000000000000000000000000000000000';
    CONFIG.GROQ_API_KEY = 'gsk_mock000000000000000000000000000000000000000000';
  }
  // Заглушаем AI HTTP вызовы
  window.getAIWarDecision   = async () => ({ action: 'defend', reasoning: '[mock]', tactic: 'defensive' });
  window.getGroqDecision    = async () => ({ action: 'wait',   reasoning: '[mock]' });
  window._callGroqViaWorker = async () => null;
  window.fetchGroq          = async () => ({ choices: [{ message: { content: '{"action":"wait"}' } }] });
});

// Ждём модал и закрываем его через UI (вводим Groq-ключ)
const modalSel = '#api-key-modal';
const isVisible = await page.isVisible(modalSel).catch(() => false);
if (isVisible) {
  console.log('  🔑 Закрываем модал ключей...');
  // Вводим в поле Groq мок-ключ
  await page.fill('#akm-groq-input', 'gsk_mocktestkey1234567890abcdef1234567890abcdef').catch(() => {});
  await page.waitForTimeout(200);
  // Кликаем кнопку сохранить
  await page.click('#akm-btn').catch(() => {});
  await page.waitForTimeout(1500);
  // Если всё ещё виден — скрываем принудительно
  const stillVisible = await page.isVisible(modalSel).catch(() => false);
  if (stillVisible) {
    await page.evaluate(() => {
      const m = document.getElementById('api-key-modal');
      if (m) m.style.display = 'none';
    });
  }
}

// ─── 3. Ждём готовности GAME_STATE ───────────────────────────────────────────
console.log('  ⏳ Ждём инициализации игры...');
await page.waitForFunction(
  () => typeof GAME_STATE !== 'undefined'
     && GAME_STATE.nations
     && Object.keys(GAME_STATE.nations).length > 5
     && GAME_STATE.turn >= 1,
  { timeout: 60000 }
).catch(() => console.log('⚠ GAME_STATE не готов'));

const info0 = await page.evaluate(() => {
  const n = GAME_STATE?.nations?.[GAME_STATE?.player_nation];
  return {
    turn: GAME_STATE?.turn, player: GAME_STATE?.player_nation,
    nations: Object.keys(GAME_STATE?.nations ?? {}).length,
    treasury: Math.round(n?.economy?.treasury ?? 0),
    income:   Math.round(n?.economy?.income_per_turn ?? 0),
  };
}).catch(() => ({}));
console.log('📊 Старт:', JSON.stringify(info0));
await snap(page, 'start');

// ─── 4. Панель Казны ─────────────────────────────────────────────────────────
console.log('\n💰 Казна...');
const hasTreasury = await page.evaluate(() => typeof showTreasuryOverlay === 'function');
console.log('  showTreasuryOverlay:', hasTreasury ? '✅' : '⚠ не найдена');

if (hasTreasury) {
  await page.evaluate(() => showTreasuryOverlay());
  await page.waitForTimeout(700);
  await snap(page, 'treasury');

  const hasLoans = await page.isVisible('.tp-loans-section').catch(() => false);
  console.log('  Займы:', hasLoans ? '✅' : '⚠ не найдены');

  if (hasLoans) {
    const loansText = await page.$eval('.tp-loans-section', el =>
      el.innerText.replace(/\s+/g,' ').slice(0,200)
    ).catch(() => '');
    console.log('  Текст займов:', loansText);
    await snap(page, 'loans_section');

    // Вводим сумму — смотрим превью
    await page.fill('#tp-loan-amount', '3000').catch(() => {});
    await page.evaluate(() => _tpUpdateLoanPreview && _tpUpdateLoanPreview());
    await page.waitForTimeout(300);
    const preview = await page.$eval('#tp-loan-preview', e => e.innerText).catch(() => '');
    console.log('  Превью займа:', preview || '(пусто)');
    await snap(page, 'loan_preview');

    // Берём заём если кнопка активна
    const canLoan = await page.$eval('.tp-loan-btn:not(.danger)', b => !b.disabled).catch(() => false);
    if (canLoan) {
      await page.click('.tp-loan-btn:not(.danger)');
      await page.waitForTimeout(500);
      const afterLoans = await page.$eval('.tp-loans-section', el =>
        el.innerText.replace(/\s+/g,' ').slice(0,200)
      ).catch(() => '');
      console.log('  После займа:', afterLoans);
      await snap(page, 'loan_taken');
    } else {
      console.log('  ℹ️ Займ недоступен (лимит или проверьте income)');
    }
  }

  // Скролим панель вниз чтобы показать всё
  await page.evaluate(() => {
    const panel = document.querySelector('.tp-panel');
    if (panel) panel.scrollTop = panel.scrollHeight;
  });
  await snap(page, 'treasury_bottom');

  await page.evaluate(() => hideTreasuryOverlay && hideTreasuryOverlay());
  await page.waitForTimeout(300);
}

// ─── 5. Пять ходов ───────────────────────────────────────────────────────────
for (let i = 1; i <= 5; i++) {
  console.log(`\n▶ Ход ${i}...`);

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes('Следующий') || b.id === 'next-turn-btn');
    if (btn && !btn.disabled) { btn.click(); return btn.textContent.trim(); }
    return null;
  });
  if (!clicked) { console.log('  ⚠ Кнопка не найдена'); break; }
  console.log(`  Нажали: "${clicked.slice(0,30)}"`);

  try {
    await waitTurn(page, 50000);
    const info = await page.evaluate(() => {
      const n = GAME_STATE?.nations?.[GAME_STATE?.player_nation];
      const allLoans = GAME_STATE?.loans ?? [];
      const myLoans  = allLoans.filter(l => l.nation_id === GAME_STATE?.player_nation && !l.defaulted && l.remaining > 0);
      const aiLoans  = allLoans.filter(l => l.nation_id !== GAME_STATE?.player_nation && !l.defaulted && l.remaining > 0);
      return {
        turn:     GAME_STATE?.turn,
        treasury: Math.round(n?.economy?.treasury ?? 0),
        income:   Math.round(n?.economy?.income_per_turn ?? 0),
        expense:  Math.round(n?.economy?.expense_per_turn ?? 0),
        myDebt:   Math.round(myLoans.reduce((s,l) => s+l.remaining, 0)),
        aiLoans:  aiLoans.length,
        aiDebt:   Math.round(aiLoans.reduce((s,l) => s+l.remaining, 0)),
      };
    });
    console.log(`  ✅ казна=${info.treasury} доход=${info.income} расход=${info.expense}`);
    if (info.myDebt)  console.log(`     Мой долг: ${info.myDebt} ₴`);
    if (info.aiLoans) console.log(`     AI займы: ${info.aiLoans} шт, ${info.aiDebt} ₴`);
    await snap(page, `turn${i}`);
  } catch(e) {
    console.log(`  ⏰ Ход ${i} завис:`, e.message.slice(0,80));
    await snap(page, `turn${i}_stuck`);

    // Показываем текст кнопки для диагностики
    const btnTxt = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.includes('⏳') || x.id === 'next-turn-btn');
      return b ? b.textContent.trim() : 'не найдена';
    });
    console.log(`  Статус кнопки: "${btnTxt}"`);
    break;
  }
}

// ─── 6. Открываем казну снова — смотрим на долги после ходов ─────────────────
if (hasTreasury) {
  await page.evaluate(() => showTreasuryOverlay());
  await page.waitForTimeout(600);
  await snap(page, 'treasury_after_turns');
  await page.evaluate(() => hideTreasuryOverlay && hideTreasuryOverlay());
}

// ─── 7. Итоги ────────────────────────────────────────────────────────────────
await snap(page, 'final');

const relevant_errors = errors.filter(e =>
  !e.includes('407') && !e.includes('ERR_NAME') && !e.includes('favicon') && !e.includes('Leaflet')
  && !e.includes('api.groq.com') && !e.includes('api.anthropic.com') && !e.includes('CORS')
  && !e.includes('ERR_FAILED')
);

console.log('\n═══════════════════════════');
if (relevant_errors.length === 0) {
  console.log('✅ Критических JS ошибок нет');
} else {
  console.log(`❌ JS ошибки (${relevant_errors.length}):`);
  [...new Set(relevant_errors)].slice(0,12).forEach(e => console.log('  ', e.slice(0,150)));
}

const ignoredWarns = warns.filter(w =>
  !w.includes('file://') && !w.includes('Worker') && !w.includes('Leaflet')
);
if (ignoredWarns.length) {
  console.log(`\n⚠ Предупреждения (${ignoredWarns.length}):`);
  [...new Set(ignoredWarns)].slice(0,8).forEach(w => console.log('  ', w));
}

await browser.close();
console.log(`\n📁 Скриншоты: ${SHOTS}/`);
fs.readdirSync(SHOTS).forEach(f => console.log(`  ${f}`));
