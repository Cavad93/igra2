/* ───────────────────────────────────────────────────────────
   boot.js — единственная точка входа приложения (этап 65).
   Все модули импортируются отсюда; все экспорты регистрируются
   на window для обратной совместимости с data-action и
   кросс-модульными вызовами.
   ─────────────────────────────────────────────────────────── */

// ── УТИЛИТА: распаковать экспорты модулей в window ──
function _reg(/* ...modules */) {
  for (var i = 0; i < arguments.length; i++) {
    var m = arguments[i];
    var keys = Object.keys(m);
    for (var j = 0; j < keys.length; j++) {
      if (keys[j] !== 'default') window[keys[j]] = m[keys[j]];
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  1. CONFIG
// ═══════════════════════════════════════════════════════════
import * as _config from '../config.js';

// ═══════════════════════════════════════════════════════════
//  2. DATA
// ═══════════════════════════════════════════════════════════
import * as _goods from '../data/goods.js';
import * as _chainsData from '../data/chains_data.js';
import * as _dataBuild from '../data/buildings.js';
import * as _lawsLabor from '../data/laws_labor.js';
import * as _socialCls from '../data/social_classes.js';
import * as _dataMap from '../data/map.js';
import * as _nations from '../data/nations.js';
import * as _regionsData from '../data/regions_data.js';
import * as _biomes from '../data/biomes.js';
import * as _regionAreas from '../data/region_areas.js';
import * as _chars from '../data/characters.js';
import * as _tradMil from '../data/traditions/traditions_military.js';
import * as _tradEco from '../data/traditions/traditions_economic.js';
import * as _tradSoc from '../data/traditions/traditions_social.js';
import * as _tradRel from '../data/traditions/traditions_religious.js';
import * as _tradNav from '../data/traditions/traditions_naval.js';
import * as _tradArt from '../data/traditions/traditions_arts.js';
import * as _tradDip from '../data/traditions/traditions_diplomatic.js';
import * as _tradSur from '../data/traditions/traditions_survival.js';
import * as _tradExt from '../data/traditions/traditions_extra.js';
import * as _tradIdx from '../data/traditions/traditions_index.js';
import * as _cultures from '../data/cultures.js';
import * as _portFilt from '../data/portrait_filters.js';
import * as _cultGrps from '../data/culture_groups.js';
import * as _religions from '../data/religions.js';
import * as _dogmas from '../data/dogmas.js';
import * as _relRegions from '../data/religion_regions.js';

// ═══════════════════════════════════════════════════════════
//  3. UI — базовые модули (icons, log, toast, pulse)
// ═══════════════════════════════════════════════════════════
import * as _icons from './icons.js';
import * as _log from './log.js';
import * as _toast from './toast.js';
import * as _pulse from './pulse.js';
import * as _panelResize from './panel_resize.js';

// ═══════════════════════════════════════════════════════════
//  4. ENGINE
// ═══════════════════════════════════════════════════════════
import * as _pops from '../engine/pops.js';
import * as _landCap from '../engine/land_capacity.js';
import * as _diplomacy from '../engine/diplomacy.js';
import * as _treatyVal from '../engine/treaty_validator.js';
import * as _treatyEff from '../engine/treaty_effects.js';
import * as _warScore from '../engine/war_score.js';
import * as _diploRange from '../engine/diplomacy_range.js';
import * as _memory from '../engine/memory.js';
import * as _buildings from '../engine/buildings.js';
import * as _fortress from '../engine/fortress.js';
import * as _market from '../engine/market.js';
import * as _provinces from '../engine/provinces.js';
import * as _economy from '../engine/economy.js';
import * as _economyExt from '../engine/economy_ext.js';
import * as _loans from '../engine/loans.js';
import * as _demography from '../engine/demography.js';
import * as _ageDem from '../engine/age_demographics.js';
import * as _government from '../engine/government.js';
import * as _dialogue from '../engine/dialogue.js';
import * as _constitutional from '../engine/constitutional.js';
import * as _conspiracy from '../engine/conspiracy.js';
import * as _senate from '../engine/senate.js';
import * as _battle from '../engine/battle.js';
import * as _armies from '../engine/armies.js';
import * as _combat from '../engine/combat.js';
import * as _siege from '../engine/siege.js';
import * as _victory from '../engine/victory.js';
import * as _charsAi from '../engine/characters_ai.js';
import * as _orders from '../engine/orders.js';
import * as _culture from '../engine/culture.js';
import * as _religion from '../engine/religion.js';
import * as _storage from '../engine/storage.js';
import * as _superOu from '../engine/super_ou.js';
import * as _achieve from '../engine/achievements.js';
import * as _date from '../engine/date.js';
import * as _charsLife from '../engine/characters_lifecycle.js';
import * as _espionage from '../engine/espionage.js';
import * as _aiScoring from '../engine/ai_scoring.js';
import * as _aiFallback from '../engine/ai_fallback.js';
import * as _aiWorker from '../engine/ai_worker.js';
import * as _events from '../engine/events.js';
import * as _save from '../engine/save.js';
import * as _turn from '../engine/turn.js';
import * as _init from '../engine/init.js';
import * as _tactBattle from '../engine/tactical_battle.js';
import * as _noise from '../engine/noise.js';

// ═══════════════════════════════════════════════════════════
//  5. UI — карта и панели
// ═══════════════════════════════════════════════════════════
import * as _map from './map.js';
import * as _mapArmies from './map_armies.js';
import * as _mapEvents from './map_events.js';
import * as _mapFeed from './map_event_feed.js';
import * as _mapAiInd from './map_ai_indicators.js';
import * as _turnSumCard from './turn_summary_card.js';
import * as _regCompare from './region_compare.js';
import * as _regBuild from './region_build_tab.js';
import * as _diploTab from './diplomacy_tab.js';
import * as _diploGraph from './diplo_graph.js';
import * as _portSvg from './portrait_svg.js';
import * as _portrait from './portrait.js';
import * as _splashMos from './splash_mosaic.js';
import * as _clepsydra from './clepsydra.js';
import * as _turnProg from './turn_progress.js';
import * as _statusBar from './status_bar.js';
import * as _topBar from './top_bar.js';
import * as _splash from './splash.js';
import * as _panels from './panels.js';
import * as _aqueduct from './aqueduct.js';
import * as _govTab from './government_tab.js';
import * as _popTab from './population_tab.js';
import * as _ecoTab from './economy_tab.js';
import * as _ecoReact from './economy_react.jsx';
import * as _treasury from './treasury-panel.js';
import * as _siegePanel from './siege_panel.js';
import * as _battleResult from './battle_result.js';
import * as _peacePanel from './peace_panel.js';
import * as _apikey from './apikey.js';
import * as _input from './input.js';
import * as _tactMap from './tactical_map.js';
import * as _battlePix from './battle_map_pixi.js';
import * as _ambient from './ambient.js';
import * as _reactions from './reactions.js';
import * as _diptych from './diptych.js';

// ═══════════════════════════════════════════════════════════
//  6. AI
// ═══════════════════════════════════════════════════════════
import * as _chronicle from '../ai/chronicle.js';
import * as _aiPrompts from '../ai/prompts.js';
import * as _aiParser from '../ai/parser.js';
import * as _claude from '../ai/claude.js';
import * as _diploAi from '../ai/diplomacy_ai.js';
import * as _utilAi from '../ai/utility_ai.js';
import * as _cmdAi from '../ai/commander_ai.js';
import * as _treatyInt from '../ai/treaty_interpreter.js';
import * as _anomaly from '../ai/anomaly_handler.js';
import * as _stratLlm from '../ai/strategic_llm.js';

// ═══════════════════════════════════════════════════════════
//  7. OTHER
// ═══════════════════════════════════════════════════════════
import * as _rng from '../js/rng.js';


// ═══════════════════════════════════════════════════════════
//  РЕГИСТРАЦИЯ ЭКСПОРТОВ НА WINDOW
// ═══════════════════════════════════════════════════════════
_reg(
  _config,
  _goods, _chainsData, _dataBuild, _lawsLabor, _socialCls, _dataMap,
  _nations, _regionsData, _biomes, _regionAreas, _chars,
  _tradMil, _tradEco, _tradSoc, _tradRel, _tradNav, _tradArt,
  _tradDip, _tradSur, _tradExt, _tradIdx,
  _cultures, _portFilt, _cultGrps, _religions, _dogmas, _relRegions,
  _icons, _log, _toast, _pulse, _panelResize,
  _pops, _landCap, _diplomacy, _treatyVal, _treatyEff, _warScore,
  _diploRange, _memory, _buildings, _fortress, _market, _provinces,
  _economy, _economyExt, _loans, _demography, _ageDem, _government,
  _dialogue, _constitutional, _conspiracy, _senate, _battle, _armies,
  _combat, _siege, _victory, _charsAi, _orders, _culture, _religion,
  _storage, _superOu, _achieve, _date, _charsLife, _espionage,
  _aiScoring, _aiFallback, _aiWorker, _events, _save, _turn, _init,
  _tactBattle, _noise,
  _map, _mapArmies, _mapEvents, _mapFeed, _mapAiInd,
  _turnSumCard, _regCompare, _regBuild, _diploTab, _diploGraph,
  _portSvg, _portrait, _splashMos, _clepsydra, _turnProg,
  _statusBar, _topBar, _splash, _panels, _aqueduct, _govTab,
  _popTab, _ecoTab, _ecoReact, _treasury, _siegePanel,
  _battleResult, _peacePanel, _apikey, _input, _tactMap, _battlePix,
  _ambient, _reactions, _diptych,
  _chronicle, _aiPrompts, _aiParser, _claude, _diploAi, _utilAi,
  _cmdAi, _treatyInt, _anomaly, _stratLlm,
  _rng
);


// ═══════════════════════════════════════════════════════════
//  GAME_STATE
// ═══════════════════════════════════════════════════════════
if (!window.GAME_STATE) {
  window.GAME_STATE = JSON.parse(JSON.stringify(window.INITIAL_GAME_STATE));
}


// ═══════════════════════════════════════════════════════════
//  ICON WRAPS + MUTATION OBSERVER
//  (перенесено из inline <script> в <head>)
// ═══════════════════════════════════════════════════════════
function initIconWraps(root) {
  if (typeof window.icon !== 'function') return;
  var scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('.icon-wrap[data-icon]').forEach(function (el) {
    var name = el.dataset.icon;
    var svg = window.icon(name);
    if (svg) {
      el.innerHTML = svg;
      el.removeAttribute('data-icon');
    }
  });
}

(function _bootObserver() {
  window._iconReady = (typeof window.icon === 'function');
  initIconWraps(document);
  var mo = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].type !== 'childList') continue;
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches('.icon-wrap[data-icon]')) {
          var name = node.dataset.icon;
          var svg = (typeof window.icon === 'function') ? window.icon(name) : '';
          if (svg) { node.innerHTML = svg; node.removeAttribute('data-icon'); }
        }
        if (node.querySelectorAll) initIconWraps(node);
      }
    }
  });
  mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();

Object.assign(window, { initIconWraps: initIconWraps });


// ═══════════════════════════════════════════════════════════
//  ДЕЛЕГИРОВАНИЕ СОБЫТИЙ (uisuper этап 56)
// ═══════════════════════════════════════════════════════════

// data-action="fn" [data-arg="val" | data-arg="a|b"]
// data-guard=".selector"  — skip if click came from that selector
// data-stop-prop          — call e.stopPropagation()
// data-action2="fn2"      — chain a second no-arg function
// data-pass-event         — pass event as first arg before data-arg
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-action]');
  if (!el) {
    var stopEl = e.target.closest('[data-stop-prop]');
    if (stopEl) e.stopPropagation();
    return;
  }
  var guard = el.dataset.guard;
  if (guard && e.target.closest(guard)) return;
  if (el.dataset.stopProp !== undefined) e.stopPropagation();

  var fn = window[el.dataset.action];
  if (typeof fn === 'function') {
    var raw = el.dataset.arg;
    if (raw !== undefined) {
      var args = raw.split('|').map(function (s) {
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

// data-action-self="fn" — только при клике по самому элементу
document.addEventListener('click', function (e) {
  var el = e.target;
  if (el.dataset && el.dataset.actionSelf && e.target === el) {
    var fn = window[el.dataset.actionSelf];
    if (typeof fn === 'function') fn();
  }
});

// data-keydown="fn"
document.addEventListener('keydown', function (e) {
  var el = e.target.closest('[data-keydown]');
  if (!el) return;
  var fn = window[el.dataset.keydown];
  if (typeof fn === 'function') fn(e);
});


// ═══════════════════════════════════════════════════════════
//  ХЕЛПЕРЫ
// ═══════════════════════════════════════════════════════════

function reloadPage() { location.reload(); }

function closeEventChoiceOverlay() {
  var el = document.getElementById('event-choice-overlay');
  if (el) el.style.display = 'none';
}

function renderNationLegend() {
  var legend = document.getElementById('nation-legend');
  if (!legend) return;
  var mainNations = ['syracuse', 'rome', 'carthage', 'egypt', 'macedon'];
  legend.innerHTML = mainNations.map(function (nId) {
    var nation = window.GAME_STATE.nations[nId];
    if (!nation) return '';
    return '<div class="nation-legend-item">' +
      '<div class="nation-color-dot" style="background:' + nation.color + '"></div>' +
      '<span>' + (nation.flag_emoji || '') + ' ' + nation.name + '</span>' +
      '</div>';
  }).join('');
}

async function handleGenerateChars() {
  var btn = document.getElementById('generate-chars-btn');
  if (!btn) return;
  if (!CONFIG.GROQ_API_KEY && !CONFIG.API_KEY) {
    showAPIKeyPrompt();
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<span class="icon-wrap">' + (window.icon ? window.icon('end_turn') : '') + '</span> Генерирую...';
  if (typeof window.setAIStatus === 'function') window.setAIStatus('busy');
  try {
    await generateCharactersForNation(window.GAME_STATE.player_nation, 7);
    btn.textContent = '\u2705 Советники явились';
    if (typeof window.setAIStatus === 'function') window.setAIStatus('ready');
  } catch (err) {
    console.error('Ошибка генерации персонажей:', err);
    addEventLog('Ошибка генерации персонажей: ' + err.message, 'warning');
    btn.disabled = false;
    btn.innerHTML = '<span class="icon-wrap">' + (window.icon ? window.icon('ai') : '') + '</span> Созвать советников (AI)';
    if (typeof window.setAIStatus === 'function') window.setAIStatus('error');
  }
}

Object.assign(window, {
  reloadPage: reloadPage,
  closeEventChoiceOverlay: closeEventChoiceOverlay,
  renderNationLegend: renderNationLegend,
  handleGenerateChars: handleGenerateChars
});


// ═══════════════════════════════════════════════════════════
//  ESCAPE — закрытие оверлеев
// ═══════════════════════════════════════════════════════════
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var sm = document.getElementById('settings-modal');
    if (sm && sm.classList.contains('open')) {
      closeSettingsModal();
      return;
    }
    if (typeof window.closeCharacterDetail === 'function') window.closeCharacterDetail();
    var votingOverlay = document.getElementById('voting-overlay');
    if (votingOverlay && votingOverlay.style.display !== 'none') {
      votingOverlay.style.display = 'none';
    }
    if (typeof window.closeRegionInfo === 'function') window.closeRegionInfo();
  }
});


// ═══════════════════════════════════════════════════════════
//  СТАРТ ИГРЫ
// ═══════════════════════════════════════════════════════════

// Инициализируем ввод
if (typeof window.initInput === 'function') window.initInput();

// SplashMosaic
try { if (window.SplashMosaic) window.SplashMosaic.init(); }
catch (e) { console.error('[SplashMosaic] init error:', e); }

// Splash fallback-фон
try {
  if (typeof window.initSplash === 'function') window.initSplash(null);
} catch (e) { console.error('[initSplash] error:', e); }

// Прогресс-бар
var _splash = document.getElementById('splash-screen');
function _splashProgress(pct, text) {
  var bar = document.getElementById('splash-bar-fill');
  var lbl = document.getElementById('splash-status');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = text;
}
function _splashHide() {
  if (!_splash) return;
  if (typeof window.hideSplashWithAnimation === 'function') {
    window.hideSplashWithAnimation();
    return;
  }
  _splash.style.opacity = '0';
  setTimeout(function () { _splash.style.display = 'none'; }, 500);
}

_splashProgress(10, 'Инициализация...');

window.initGame().then(function () {
  _splashProgress(60, 'Загрузка карты...');
  if (typeof window.initAllSenates === 'function') window.initAllSenates();
  _splashProgress(80, 'Подготовка наций...');
  renderNationLegend();
  _splashProgress(95, 'Готово');
  if (typeof window.initAPIKey === 'function') window.initAPIKey();

  try {
    if (typeof window.applyNationTheme === 'function' && window.GAME_STATE && window.GAME_STATE.player_nation) {
      window.applyNationTheme(window.GAME_STATE.player_nation);
    }
  } catch (e) { console.error('[applyNationTheme] error:', e); }

  try {
    if (typeof window.initSplash === 'function' && window.GAME_STATE && window.GAME_STATE.player_nation) {
      window.initSplash(window.GAME_STATE.player_nation);
    }
  } catch (e) { console.error('[initSplash] error:', e); }

  try {
    if (typeof window.updateNationHeader === 'function' && window.GAME_STATE && window.GAME_STATE.player_nation) {
      var pn = window.GAME_STATE.nations && window.GAME_STATE.nations[window.GAME_STATE.player_nation];
      window.updateNationHeader(window.GAME_STATE.player_nation, pn && pn.name);
    }
  } catch (e) { console.error('[updateNationHeader] error:', e); }

  try {
    if (typeof window.setMapMode === 'function') window.setMapMode('political');
  } catch (e) { console.error('[setMapMode] error:', e); }

  try {
    if (typeof window.initWindRoseKeyboard === 'function') window.initWindRoseKeyboard();
  } catch (e) { console.error('[initWindRoseKeyboard] error:', e); }

  var _revealStartBtn = function () {
    try {
      if (typeof window.showSplashStartButton === 'function') {
        window.showSplashStartButton();
      } else {
        setTimeout(_splashHide, 300);
      }
    } catch (e) {
      setTimeout(_splashHide, 300);
    }
  };
  var _waitMosaic = function () {
    try {
      if (window.SplashMosaic && typeof window.SplashMosaic.isComplete === 'function'
          && !window.SplashMosaic.isComplete()) {
        setTimeout(_waitMosaic, 200);
        return;
      }
    } catch (_) { /* сразу показываем кнопку */ }
    _revealStartBtn();
  };
  _waitMosaic();
}).catch(function (e) {
  console.error('[initGame] Критическая ошибка:', e);
  _splashProgress(100, 'Ошибка инициализации');
});
