/* ───────────────────────────────────────────────────────────
   boot.js — «монтажный лист» инициализации игры (arma.md шаг 61).
   Последовательность: показать сплэш → загрузить данные → инициализировать
   движок и карту → скрыть сплэш → первая отрисовка.
   Подключается ПОСЛЕДНИМ в цепочке <script> в index.html.
   Рефакторинг Части II, этап 42.
   ─────────────────────────────────────────────────────────── */
(function boot() {
  'use strict';

  // ──────────────────────────────────────────
  // ДЕЛЕГИРОВАНИЕ СОБЫТИЙ (uisuper этап 56)
  // ──────────────────────────────────────────

  // Хелперы для специальных inline-действий, не имеющих глобальной функции
  window.reloadPage = function() { location.reload(); };
  window.closeEventChoiceOverlay = function() {
    var el = document.getElementById('event-choice-overlay');
    if (el) el.style.display = 'none';
  };

  // data-action="fn" [data-arg="val" | data-arg="a|b"]
  // data-guard=".selector"  — skip if click came from that selector
  // data-stop-prop          — call e.stopPropagation()
  // data-action2="fn2"     — chain a second no-arg function
  // data-pass-event         — pass event as first arg before data-arg
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');

    // data-stop-prop без data-action (только stopPropagation)
    // Применяем только если нет вложенного data-action, иначе data-action обработает
    if (!el) {
      var stopEl = e.target.closest('[data-stop-prop]');
      if (stopEl) { e.stopPropagation(); }
      return;
    }

    var guard = el.dataset.guard;
    if (guard && e.target.closest(guard)) return;

    if (el.dataset.stopProp !== undefined) e.stopPropagation();

    var fn = window[el.dataset.action];
    if (typeof fn === 'function') {
      var raw = el.dataset.arg;
      if (raw !== undefined) {
        var args = raw.split('|').map(function(s) {
          if (s === 'true') return true;
          if (s === 'false') return false;
          return s;
        });
        if (el.dataset.passEvent !== undefined) args.unshift(e);
        fn.apply(null, args);
      } else {
        el.dataset.passEvent !== undefined ? fn(e) : fn();
      }
    }

    var fn2 = el.dataset.action2 ? window[el.dataset.action2] : null;
    if (typeof fn2 === 'function') fn2();
  });

  // data-action-self="fn" — срабатывает только при клике по самому элементу
  document.addEventListener('click', function(e) {
    var el = e.target;
    if (el.dataset && el.dataset.actionSelf && e.target === el) {
      var fn = window[el.dataset.actionSelf];
      if (typeof fn === 'function') fn();
    }
  });

  // data-keydown="fn"
  document.addEventListener('keydown', function(e) {
    var el = e.target.closest('[data-keydown]');
    if (!el) return;
    var fn = window[el.dataset.keydown];
    if (typeof fn === 'function') fn(e);
  });

  // ──────────────────────────────────────────
  // СТАРТ ИГРЫ
  // ──────────────────────────────────────────

  // Инициализируем ввод
  initInput();

  // SplashMosaic вынесен в ui/splash_mosaic.js (uisuper.md этап 37).
  // Инициализируем сразу (DOM уже готов — скрипт в конце body)
  try { SplashMosaic.init(); } catch (e) { console.error('[SplashMosaic] init error:', e); }

  // Clepsydra вынесен в ui/clepsydra.js (uisuper.md этап 38).

  // D3: показать экран загрузки
  var _splash = document.getElementById('splash-screen');
  function _splashProgress(pct, text) {
    var bar = document.getElementById('splash-bar-fill');
    var lbl = document.getElementById('splash-status');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = text;
    // uisuper Этап 8 fix: мозаика больше не привязана к реальному
    // прогрессу загрузки — она анимируется по таймеру ≈20с через
    // SplashMosaic.startAutoAnimate(), чтобы эффект сборки был
    // заметен даже при быстрой инициализации игры.
  }
  function _splashHide() {
    if (!_splash) return;
    // Шаг 58 — плавная анимация splashFade через ui/splash.js
    if (typeof hideSplashWithAnimation === 'function') {
      hideSplashWithAnimation();
      return;
    }
    _splash.style.opacity = '0';
    setTimeout(function () { _splash.style.display = 'none'; }, 500);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Шаг 61 (arma.md) — Итоговая интеграция: монтажный лист инициализации
  // ═══════════════════════════════════════════════════════════════════
  // Порядок строгий (см. arma.md Шаг 61: «Зависимости инициализации»):
  //  1. initSplash(null)                 — fallback-фон сразу, без нации
  //  2. initGame()                       — загружает save, нации, карту,
  //                                        вызывает renderAll()
  //                                        (renderMap → applySeasonVisual
  //                                         → renderAllArmies → renderBuildMarkers)
  //  3. initAllSenates / renderNationLegend / initAPIKey
  //  4. applyNationTheme(player_nation)  — Шаг 56 (текстура + рамка)
  //  5. initSplash(player_nation)        — Шаг 58 (культурная фреска)
  //  6. updateNationHeader(player_nation) — Шаг 60 (иконка + имя)
  //  7. setMapMode('political')          — Шаг 29 (стартовый режим)
  //  8. showSplashStartButton / _splashHide
  // Туман войны (Шаг 48) применяется автоматически внутри refreshRegionStyles
  // на основе getIntelLevel для player_nation.
  // Горячие клавиши (Шаг 28) регистрируются через document.addEventListener
  // ниже в этом файле — вызов независим от initGame.
  // ═══════════════════════════════════════════════════════════════════

  // Шаг 58 — инициализируем splash с fallback-фоном
  // (фреска уточнится после initGame, когда станет известна нация игрока).
  try {
    if (typeof initSplash === 'function') initSplash(null);
  } catch (e) { console.error('[initSplash] error:', e); }

  _splashProgress(10, 'Инициализация...');
  initGame().then(function () {
    _splashProgress(60, 'Загрузка карты...');
    initAllSenates();
    _splashProgress(80, 'Подготовка наций...');
    renderNationLegend();
    _splashProgress(95, 'Готово');
    initAPIKey();
    // Шаг 56 — применить культурную тему панелей для нации игрока
    try {
      if (typeof applyNationTheme === 'function' && GAME_STATE && GAME_STATE.player_nation) {
        applyNationTheme(GAME_STATE.player_nation);
      }
    } catch (e) { console.error('[applyNationTheme] error:', e); }
    // Шаг 58 — обновить фреску splash под культуру нации игрока
    try {
      if (typeof initSplash === 'function' && GAME_STATE && GAME_STATE.player_nation) {
        initSplash(GAME_STATE.player_nation);
      }
    } catch (e) { console.error('[initSplash] error:', e); }
    // Шаг 60 — заголовок нации в топ-баре (иконка + имя)
    try {
      if (typeof updateNationHeader === 'function' && GAME_STATE && GAME_STATE.player_nation) {
        var pn = GAME_STATE.nations && GAME_STATE.nations[GAME_STATE.player_nation];
        updateNationHeader(GAME_STATE.player_nation, pn && pn.name);
      }
    } catch (e) { console.error('[updateNationHeader] error:', e); }
    // Шаг 29 / Шаг 61 — стартовый режим карты: политический
    // uisuper Этап 20 — WindRose.setActive вызывается внутри setMapMode
    try {
      if (typeof setMapMode === 'function') {
        setMapMode('political');
      }
    } catch (e) { console.error('[setMapMode] error:', e); }
    // uisuper Этап 20 — keyboard navigation для лепестков розы ветров
    try {
      if (typeof initWindRoseKeyboard === 'function') {
        initWindRoseKeyboard();
      }
    } catch (e) { console.error('[initWindRoseKeyboard] error:', e); }
    // Шаг 58 — показать кнопку «Начать игру» вместо авто-скрытия.
    // uisuper Этап 8 fix: ждём, пока мозаика полностью соберётся
    // (≈20с с момента старта splash), и только потом показываем
    // кнопку. Если инициализация затянулась дольше мозаики — кнопка
    // появится сразу.
    var _revealStartBtn = function () {
      try {
        if (typeof showSplashStartButton === 'function') {
          showSplashStartButton();
        } else {
          setTimeout(_splashHide, 300);
        }
      } catch (e) {
        setTimeout(_splashHide, 300);
      }
    };
    var _waitMosaic = function () {
      try {
        if (SplashMosaic && typeof SplashMosaic.isComplete === 'function'
            && !SplashMosaic.isComplete()) {
          setTimeout(_waitMosaic, 200);
          return;
        }
      } catch (_) { /* ignore и сразу показываем кнопку */ }
      _revealStartBtn();
    };
    _waitMosaic();
  }).catch(function (e) {
    console.error('[initGame] Критическая ошибка:', e);
    _splashProgress(100, 'Ошибка инициализации');
  });

  // ──────────────────────────────────────────
  // ЛЕГЕНДА НАЦИЙ
  // ──────────────────────────────────────────

  function renderNationLegend() {
    var legend = document.getElementById('nation-legend');
    if (!legend) return;

    var mainNations = ['syracuse', 'rome', 'carthage', 'egypt', 'macedon'];
    legend.innerHTML = mainNations.map(function (nId) {
      var nation = GAME_STATE.nations[nId];
      if (!nation) return '';
      return '<div class="nation-legend-item">' +
        '<div class="nation-color-dot" style="background:' + nation.color + '"></div>' +
        '<span>' + (nation.flag_emoji || '') + ' ' + nation.name + '</span>' +
        '</div>';
    }).join('');
  }

  // ──────────────────────────────────────────
  // КНОПКА ГЕНЕРАЦИИ ПЕРСОНАЖЕЙ
  // ──────────────────────────────────────────

  window.handleGenerateChars = async function handleGenerateChars() {
    var btn = document.getElementById('generate-chars-btn');
    if (!btn) return;

    if (!CONFIG.GROQ_API_KEY && !CONFIG.API_KEY) {
      showAPIKeyPrompt();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="icon-wrap">' + (window.icon ? window.icon('end_turn') : '') + '</span> Генерирую...';
    if (typeof setAIStatus === 'function') setAIStatus('busy');

    try {
      await generateCharactersForNation(GAME_STATE.player_nation, 7);
      btn.textContent = '✅ Советники явились';
      if (typeof setAIStatus === 'function') setAIStatus('ready');
    } catch (err) {
      console.error('Ошибка генерации персонажей:', err);
      addEventLog('Ошибка генерации персонажей: ' + err.message, 'warning');
      btn.disabled = false;
      btn.innerHTML = '<span class="icon-wrap">' + (window.icon ? window.icon('ai') : '') + '</span> Созвать советников (AI)';
      if (typeof setAIStatus === 'function') setAIStatus('error');
    }
  };

  // ──────────────────────────────────────────
  // ГЛОБАЛЬНАЯ ФУНКЦИЯ ЗАКРЫТИЯ ОВЕРЛЕЕВ по Escape
  // ──────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      // Шаг 22: закрыть модал настроек первым, если он открыт
      var sm = document.getElementById('settings-modal');
      if (sm && sm.classList.contains('open')) {
        closeSettingsModal();
        return;
      }
      closeCharacterDetail();
      var votingOverlay = document.getElementById('voting-overlay');
      if (votingOverlay && votingOverlay.style.display !== 'none') {
        votingOverlay.style.display = 'none';
      }
      closeRegionInfo();
    }
  });

  // Шаг 22 — Модал настроек → вынесен в ui/top_bar.js (этап 41)
  // Шаг 28 — Горячие клавиши → вынесены в ui/top_bar.js (этап 41)
  // ШАГ 30: Контекстное меню → вынесено в ui/top_bar.js (этап 41)
  // Контекстное меню + экспорты → вынесены в ui/top_bar.js (этап 41)
  // Шаг 31 — Индикатор прогресса хода → вынесен в ui/turn_progress.js (этап 39)
  // Шаг 33 — Строка статуса (#status-bar) → вынесена в ui/status_bar.js (этап 40)
  // Шаг 34 — Поиск по игре → вынесен в ui/top_bar.js (этап 41)
  // (initSearch IIFE удалён — код теперь в ui/top_bar.js)

})();
