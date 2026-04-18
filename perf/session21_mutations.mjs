/**
 * perf/session21_mutations.mjs — Session 21 micro-bench.
 *
 * Измеряет количество MutationRecord (childList + characterData) при
 * типовых обновлениях в government-tab панели:
 *   • updateMpQuality / updateOrderQualityPreview — preview-хэндлеры,
 *     вызываемые на каждое изменение select'а.
 *   • onMpTypeChange / onOrderTypeChange — перезаполнение списков опций.
 *   • updateConstitutionValueOptions — перезаполнение value-select'а.
 *   • добавление реплики в dlg-history (player + char div).
 *
 * Сценарии:
 *   A (legacy):  innerHTML = `<tmpl>` — восстанавливаем в runtime.
 *   B (Session 21): DOM API (replaceChildren + DocumentFragment + _mkOption).
 *
 * Ожидание: B.mutations значительно ниже A.mutations по всем сценариям,
 * cумма − в 3-10× раз.
 *
 * Запуск: `node perf/session21_mutations.mjs`
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';

function row(label, before, after) {
  const delta = before > 0 ? (((after - before) / before) * 100).toFixed(1) : '0';
  const sign = delta >= 0 ? '+' : '';
  return `  ${label.padEnd(40)} legacy=${String(before).padStart(5)}  new=${String(after).padStart(5)}  delta=${sign}${delta}%`;
}

console.log(`\n⏱  perf/session21_mutations.mjs — innerHTML → DOM API (government_tab)\n`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--allow-file-access-from-files',
    '--ignore-certificate-errors',
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

await page.route('**/api.groq.com/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait"}' } }] }),
}));
await page.route('**/api.anthropic.com/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ content: [{ text: '{"action":"wait"}' }] }),
}));
await page.route('**/localhost:11434/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ response: '{"action":"wait"}' }),
}));

page.on('pageerror', e => console.error('[pageerror]', e.message));

await page.goto(`file://${REPO}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  if (typeof CONFIG !== 'undefined') {
    CONFIG.API_KEY = 'sk-ant-mock000000000000000000000000000000000000000';
    CONFIG.GROQ_API_KEY = 'gsk_mock000000000000000000000000000000000000000000';
  }
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
});
await page.waitForFunction(() =>
  typeof GAME_STATE !== 'undefined' && GAME_STATE.nations
  && Object.keys(GAME_STATE.nations).length > 5 && GAME_STATE.turn >= 1,
  null, { timeout: 60000 },
);
await page.waitForTimeout(500);

// Полный прогон сценариев с двумя реализациями.
const result = await page.evaluate(() => {
  const SCENARIOS = 30;

  // Страхуемся от мусора в DOM — создаём изолированные контейнеры.
  const stage = document.createElement('div');
  stage.id = '__s21_stage';
  stage.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:600px;height:400px;';
  document.body.appendChild(stage);

  // Подготовка: <select>, <div preview>, <div status>, <div history>.
  stage.innerHTML = `
    <select id="__s21_sel"></select>
    <div id="__s21_preview"></div>
    <div id="__s21_status"></div>
    <div id="__s21_history"></div>
  `;
  const sel     = document.getElementById('__s21_sel');
  const preview = document.getElementById('__s21_preview');
  const status  = document.getElementById('__s21_status');
  const history = document.getElementById('__s21_history');

  // ── Набор «опций» (имитация nation list, region list) ──
  const nations = Object.entries(GAME_STATE.nations ?? {}).slice(0, 30);

  function observe(target, fn) {
    let count = 0;
    const mo = new MutationObserver(records => {
      for (const r of records) {
        // childList: adds+removes считаем каждый как one mutation unit.
        count += (r.addedNodes?.length ?? 0) + (r.removedNodes?.length ?? 0);
        if (r.type === 'characterData') count += 1;
        if (r.type === 'attributes') count += 1;
      }
    });
    mo.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
    const t0 = performance.now();
    fn();
    const ms = performance.now() - t0;
    // Принудительно flush: MO пакетирует, вынесем sync через takeRecords().
    const pending = mo.takeRecords();
    for (const r of pending) {
      count += (r.addedNodes?.length ?? 0) + (r.removedNodes?.length ?? 0);
      if (r.type === 'characterData') count += 1;
      if (r.type === 'attributes') count += 1;
    }
    mo.disconnect();
    return { count, ms: +ms.toFixed(3) };
  }

  // ──── A (legacy via innerHTML=) ────
  function legacyFillOptions(targetSel, items, placeholder) {
    const optsHtml = items.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    targetSel.innerHTML = `<option value="">${placeholder}</option>${optsHtml}`;
  }
  function legacyUpdatePreview(el, quality, color) {
    el.innerHTML = `Ожидаемое качество: <b style="color:${color}">${quality}/100</b> · Навык: 67/100 · Лояльность: 55/100`;
  }
  function legacyStatusThinking(el) {
    el.innerHTML = '<span class="dlg-thinking">⏳ Персонаж обдумывает ответ…</span>';
  }
  function legacyDlgMsg(parent, label, text) {
    const div = document.createElement('div');
    div.className = 'dlg-msg';
    div.innerHTML = `<span class="dlg-msg-label">${label}</span><span class="dlg-msg-text">${text}</span>`;
    parent.appendChild(div);
  }

  // ──── B (Session 21 style via DOM API) ────
  function mkOption(v, l) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = String(l);
    return o;
  }
  function newFillOptions(targetSel, items, placeholder) {
    const frag = document.createDocumentFragment();
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    frag.appendChild(ph);
    for (const [v, l] of items) frag.appendChild(mkOption(v, l));
    targetSel.replaceChildren(frag);
  }
  function ensurePreview(el) {
    if (el._s21) return el._s21;
    const head = document.createTextNode('');
    const bold = document.createElement('b');
    const tail = document.createTextNode('');
    el.replaceChildren(head, bold, tail);
    const s = { head, bold, tail };
    el._s21 = s;
    return s;
  }
  function newUpdatePreview(el, quality, color) {
    const s = ensurePreview(el);
    const headText = 'Ожидаемое качество: ';
    const qText    = `${quality}/100`;
    const tailText = ' · Навык: 67/100 · Лояльность: 55/100';
    if (s.head.data !== headText)       s.head.data = headText;
    if (s.bold.textContent !== qText)   s.bold.textContent = qText;
    if (s.bold.style.color !== color)   s.bold.style.color = color;
    if (s.tail.data !== tailText)       s.tail.data = tailText;
  }
  function newStatusThinking(el) {
    const sp = document.createElement('span');
    sp.className = 'dlg-thinking';
    sp.textContent = '⏳ Персонаж обдумывает ответ…';
    el.replaceChildren(sp);
  }
  function newDlgMsg(parent, label, text) {
    const div = document.createElement('div');
    div.className = 'dlg-msg';
    const l = document.createElement('span');
    l.className = 'dlg-msg-label';
    l.textContent = label;
    const t = document.createElement('span');
    t.className = 'dlg-msg-text';
    t.textContent = text;
    div.append(l, t);
    parent.appendChild(div);
  }

  const scenarios = {};

  // ── Scenario 1: fillOptions 30 опций × SCENARIOS вызовов ──
  sel.replaceChildren();
  scenarios.fillOptions_legacy = observe(sel, () => {
    for (let i = 0; i < SCENARIOS; i++) legacyFillOptions(sel, nations, '— не указана —');
  });
  sel.replaceChildren();
  scenarios.fillOptions_new = observe(sel, () => {
    for (let i = 0; i < SCENARIOS; i++) newFillOptions(sel, nations, '— не указана —');
  });

  // ── Scenario 2: updatePreview × SCENARIOS ──
  preview.replaceChildren();
  scenarios.preview_legacy = observe(preview, () => {
    for (let i = 0; i < SCENARIOS; i++) legacyUpdatePreview(preview, 60 + (i % 40), '#4CAF50');
  });
  preview.replaceChildren();
  scenarios.preview_new = observe(preview, () => {
    for (let i = 0; i < SCENARIOS; i++) newUpdatePreview(preview, 60 + (i % 40), '#4CAF50');
  });

  // ── Scenario 3: status thinking × SCENARIOS ──
  status.replaceChildren();
  scenarios.status_legacy = observe(status, () => {
    for (let i = 0; i < SCENARIOS; i++) legacyStatusThinking(status);
  });
  status.replaceChildren();
  scenarios.status_new = observe(status, () => {
    for (let i = 0; i < SCENARIOS; i++) newStatusThinking(status);
  });

  // ── Scenario 4: добавление 2 реплик × SCENARIOS (like dlgSend loop) ──
  history.replaceChildren();
  scenarios.dlgMsg_legacy = observe(history, () => {
    for (let i = 0; i < SCENARIOS; i++) {
      legacyDlgMsg(history, '👑 Вы', `Реплика #${i}`);
      legacyDlgMsg(history, 'Сенатор', `Ответ #${i}`);
    }
  });
  history.replaceChildren();
  scenarios.dlgMsg_new = observe(history, () => {
    for (let i = 0; i < SCENARIOS; i++) {
      newDlgMsg(history, '👑 Вы', `Реплика #${i}`);
      newDlgMsg(history, 'Сенатор', `Ответ #${i}`);
    }
  });

  stage.remove();

  return {
    SCENARIOS,
    fillOptions: { legacy: scenarios.fillOptions_legacy, new: scenarios.fillOptions_new },
    preview:     { legacy: scenarios.preview_legacy,     new: scenarios.preview_new },
    status:      { legacy: scenarios.status_legacy,      new: scenarios.status_new },
    dlgMsg:      { legacy: scenarios.dlgMsg_legacy,      new: scenarios.dlgMsg_new },
  };
});

function rowCountMs(label, legacy, now) {
  const dC = legacy.count > 0 ? (((now.count - legacy.count) / legacy.count) * 100).toFixed(1) : '0';
  const dM = legacy.ms    > 0 ? (((now.ms    - legacy.ms)    / legacy.ms)    * 100).toFixed(1) : '0';
  return `  ${label.padEnd(40)} legacy: ${String(legacy.count).padStart(5)}mut ${String(legacy.ms.toFixed(2)).padStart(7)}ms   →   new: ${String(now.count).padStart(5)}mut ${String(now.ms.toFixed(2)).padStart(7)}ms   (mut ${dC}%, time ${dM}%)`;
}

console.log(`  SCENARIOS (iterations per bench): ${result.SCENARIOS}\n`);
console.log(rowCountMs(`fillOptions (sel, 31 опция)`,         result.fillOptions.legacy, result.fillOptions.new));
console.log(rowCountMs(`updatePreview (preview, b+текст)`,    result.preview.legacy,     result.preview.new));
console.log(rowCountMs(`status thinking (одиночный span)`,    result.status.legacy,      result.status.new));
console.log(rowCountMs(`dlg msg (2 реплики × label+text)`,    result.dlgMsg.legacy,      result.dlgMsg.new));

const totalA  = result.fillOptions.legacy.count + result.preview.legacy.count + result.status.legacy.count + result.dlgMsg.legacy.count;
const totalB  = result.fillOptions.new.count    + result.preview.new.count    + result.status.new.count    + result.dlgMsg.new.count;
const msA     = result.fillOptions.legacy.ms    + result.preview.legacy.ms    + result.status.legacy.ms    + result.dlgMsg.legacy.ms;
const msB     = result.fillOptions.new.ms       + result.preview.new.ms       + result.status.new.ms       + result.dlgMsg.new.ms;
const dCount  = totalA > 0 ? (((totalB - totalA) / totalA) * 100).toFixed(1) : '0';
const dTime   = msA    > 0 ? (((msB    - msA)    / msA)    * 100).toFixed(1) : '0';
console.log(`\n  TOTAL across 4 scenarios:`);
console.log(`    mutations:  legacy=${totalA}  new=${totalB}   (${dCount}%, ratio ${(totalA / Math.max(1, totalB)).toFixed(2)}×)`);
console.log(`    wall time:  legacy=${msA.toFixed(2)}ms  new=${msB.toFixed(2)}ms   (${dTime}%, ratio ${(msA / Math.max(0.01, msB)).toFixed(2)}×)\n`);

await browser.close();

console.log(`JSON:`);
console.log(JSON.stringify(result, null, 2));
