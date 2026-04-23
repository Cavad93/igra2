/* splash.js — Главное меню (main menu) игры.
 *
 * Отвечает за:
 *   • Показ меню с кнопками «Продолжить / Новая игра / Удалить сохранения»
 *   • Форма ввода API-ключей (Anthropic + Groq) — прямо на главной странице
 *   • Автоматическое определение наличия сохранения
 *   • Скрытие splash-экрана после запуска игры
 *   • Фон: историческая фреска с культурным тинтом
 *
 * Путь пользователя:
 *   1. Загрузка страницы → boot.js готовит данные, показывает меню
 *   2. Пользователь: вводит ключи (опц.) + жмёт «Продолжить» или «Новая игра»
 *   3. initGame(...) отрабатывает, затем hideSplashWithAnimation()
 *
 * Критическое требование: «Удалить сохранения» НЕ удаляет API-ключи —
 * это разные хранилища (IndexedDB для саве vs. localStorage для ключей).
 */

const FALLBACK_BG_ID = 'splash_pompeii';
const BG_DIR         = 'assets/backgrounds/';

function resolveSplashBgId(nationId) {
  if (typeof window.getCultureGroup === 'function') {
    try {
      const group = window.getCultureGroup(nationId);
      if (group && group.splash_bg) return group.splash_bg;
    } catch (_) { /* ignore */ }
  }
  return FALLBACK_BG_ID;
}

export function initSplash(nationId) {
  const bgId   = resolveSplashBgId(nationId);
  const bgPath = BG_DIR + bgId + '.jpg';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty(
      '--splash-bg', "url('" + bgPath + "')"
    );
  }
}

// ──────────────────────────────────────────────────────────────
// Главное меню
// ──────────────────────────────────────────────────────────────

let _menuBound = false;
let _gameStarting = false;   // защита от двойного клика

/**
 * Показать меню (после завершения загрузки данных). Скрывает прогрессбар,
 * проверяет наличие сохранения, привязывает обработчики.
 */
export async function showSplashMenu() {
  if (typeof document === 'undefined') return;

  // Скрываем секцию загрузки целиком (прогрессбар + текст статуса)
  const loading = document.querySelector('.splash__loading');
  if (loading) loading.style.display = 'none';

  const wrap   = document.getElementById('splash-bar-wrap');
  const status = document.getElementById('splash-status');
  const menu   = document.getElementById('splash-menu');
  if (wrap)   wrap.style.display = 'none';
  if (status) status.style.display = 'none';
  if (menu)   menu.style.display = '';

  // Обновляем состояние кнопок в зависимости от наличия сохранения.
  await _refreshSaveState();

  // Обновляем статус ключей (если модуль уже загружен).
  if (typeof window._updateSplashKeyStatus === 'function') {
    try { window._updateSplashKeyStatus(); } catch (_) {}
  }

  _bindMenuHandlers();
}

const MONTHS_RU = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/**
 * Обновить enabled/disabled состояние «Продолжить» и «Удалить».
 * Для «Продолжить» вытягивает метаданные через getSaveMetadata()
 * и рендерит «нация · ход N · месяц год BC/AD».
 */
async function _refreshSaveState() {
  const contBtn = document.getElementById('splash-btn-continue');
  const delBtn  = document.getElementById('splash-btn-delete');
  const meta    = document.getElementById('splash-save-meta');

  let savedMeta = null;
  try {
    if (typeof window.getSaveMetadata === 'function') {
      savedMeta = await window.getSaveMetadata();
    } else if (typeof window.hasSavedGame === 'function') {
      const has = await window.hasSavedGame();
      if (has) savedMeta = { turn: 1 };
    }
  } catch (_) { savedMeta = null; }

  const has = !!savedMeta;

  if (contBtn) {
    contBtn.disabled = !has;
    contBtn.title = has ? 'Продолжить последнюю игру' : 'Нет сохранений';
  }
  if (delBtn) delBtn.disabled = !has;

  if (meta) {
    if (has) {
      const nation = savedMeta.nation_name ?? 'нация';
      const monthName = MONTHS_RU[savedMeta.month] ?? '';
      const yearAbs = Math.abs(savedMeta.year ?? 0);
      const era = savedMeta.era ?? 'BC';
      const dateStr = (monthName && yearAbs)
        ? `${monthName} ${yearAbs} ${era}`
        : `ход ${savedMeta.turn ?? '?'}`;
      meta.textContent = `${nation} · ход ${savedMeta.turn} · ${dateStr}`;
    } else {
      meta.textContent = 'Нет сохранений';
    }
  }
}

function _bindMenuHandlers() {
  if (_menuBound) return;
  _menuBound = true;

  const contBtn  = document.getElementById('splash-btn-continue');
  const newBtn   = document.getElementById('splash-btn-new');
  const delBtn   = document.getElementById('splash-btn-delete');
  const saveKeys = document.getElementById('splash-keys-save');

  if (contBtn)  contBtn.addEventListener('click', () => _startGame('continue'));
  if (newBtn)   newBtn.addEventListener('click',  () => _startGame('new'));
  if (delBtn)   delBtn.addEventListener('click',  () => _handleDeleteSaves());
  if (saveKeys) saveKeys.addEventListener('click', () => _handleSaveKeys());

  // Enter в инпутах → сохранить ключи
  for (const id of ['splash-anthropic-key', 'splash-groq-key']) {
    const inp = document.getElementById(id);
    if (inp) inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _handleSaveKeys();
    });
  }
}

// ── Действия меню ──────────────────────────────────────────────

async function _startGame(mode) {
  if (_gameStarting) return;
  _gameStarting = true;

  // Дизэйблим кнопки и меняем текст «Продолжить»/«Новая игра» на индикатор.
  _setMenuBusy(mode === 'continue' ? 'Загрузка...' : 'Создание новой игры...');

  try {
    const fn = mode === 'continue'
      ? window.continueGame
      : window.startNewGame;
    if (typeof fn !== 'function') {
      throw new Error('функция запуска не найдена: ' + mode);
    }
    await fn();

    // После инициализации — послестартовые шаги (теже что были в старом boot.js)
    _postStartRenderAndHide();
  } catch (e) {
    console.error('[splash._startGame]', e);
    _setMenuBusy(null);
    _gameStarting = false;
    if (typeof window.addEventLog === 'function') {
      window.addEventLog('Ошибка запуска игры: ' + e.message, 'danger');
    } else {
      alert('Ошибка запуска игры: ' + e.message);
    }
  }
}

function _postStartRenderAndHide() {
  // Послестартовые хуки (культурная тема, initSplash bg, map-mode — legacy).
  try {
    if (typeof window.initAllSenates === 'function') window.initAllSenates();
  } catch (e) { console.error('[initAllSenates]', e); }

  try {
    if (typeof window.applyNationTheme === 'function'
        && window.GAME_STATE?.player_nation) {
      window.applyNationTheme(window.GAME_STATE.player_nation);
    }
  } catch (e) { console.error('[applyNationTheme]', e); }

  try {
    if (typeof window.updateNationHeader === 'function'
        && window.GAME_STATE?.player_nation) {
      const pn = window.GAME_STATE.nations?.[window.GAME_STATE.player_nation];
      window.updateNationHeader(window.GAME_STATE.player_nation, pn?.name);
    }
  } catch (e) { console.error('[updateNationHeader]', e); }

  try {
    if (typeof window.setMapMode === 'function') window.setMapMode('political');
  } catch (e) { console.error('[setMapMode]', e); }

  try {
    if (typeof window.initWindRoseKeyboard === 'function') {
      window.initWindRoseKeyboard();
    }
  } catch (e) { console.error('[initWindRoseKeyboard]', e); }

  // Прячем splash-экран с анимацией.
  hideSplashWithAnimation();
}

async function _handleDeleteSaves() {
  const ok = confirm(
    'Удалить все сохранения?\n\n'
    + 'API-ключи останутся сохранёнными — это разные хранилища. '
    + 'Следующий старт будет с новой игры.'
  );
  if (!ok) return;

  try {
    if (typeof window.deleteAllSaves === 'function') {
      await window.deleteAllSaves();
    }
    await _refreshSaveState();
    if (typeof window.showToast === 'function') {
      window.showToast('🗑 Сохранения удалены. Ключи сохранены.', 'info');
    }
  } catch (e) {
    console.error('[splash._handleDeleteSaves]', e);
    alert('Не удалось удалить сохранения: ' + e.message);
  }
}

async function _handleSaveKeys() {
  try {
    if (typeof window.saveSplashAPIKeys === 'function') {
      await window.saveSplashAPIKeys();
    }
  } catch (e) {
    console.error('[splash._handleSaveKeys]', e);
  }
}

function _setMenuBusy(label) {
  const buttons = ['splash-btn-continue', 'splash-btn-new', 'splash-btn-delete']
    .map(id => document.getElementById(id));
  for (const b of buttons) {
    if (b) b.disabled = !!label;
  }
  if (label) {
    const status = document.getElementById('splash-status');
    if (status) {
      status.style.display = '';
      status.textContent = label;
    }
  } else {
    const status = document.getElementById('splash-status');
    if (status) status.style.display = 'none';
  }
}

// ──────────────────────────────────────────────────────────────
// Legacy-API: showSplashStartButton / hideSplashWithAnimation
// ──────────────────────────────────────────────────────────────

/** Backwards-compat — старый путь boot.js, теперь показывает главное меню. */
export function showSplashStartButton() {
  showSplashMenu();
}

export function hideSplashWithAnimation() {
  if (typeof document === 'undefined') return;
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  if (splash.classList.contains('splash--hiding')) return;
  splash.classList.add('splash--hiding');
  const onEnd = () => {
    splash.removeEventListener('animationend', onEnd);
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  };
  splash.addEventListener('animationend', onEnd, { once: true });
  setTimeout(() => {
    if (splash.parentNode) {
      splash.style.display = 'none';
      try { splash.parentNode.removeChild(splash); } catch (_) {}
    }
  }, 1000);
}
