// engine/save.js — Сохранение / загрузка игры
// Вынесено из engine/turn.js (Этап 52)

import { CONFIG } from '../config.js';
import { idbSave } from './idb_storage.js';

// SaveWorker — сохранение в фоне, не блокирует главный поток.
//
// Session 7: на main-треде больше не делаем JSON.stringify + TextEncoder;
// payload уходит в воркер structured clone'ом через postMessage(payload).
// Нативный клон быстрее связки stringify+encode на 10-15 МБ state и не
// создаёт промежуточной строки в памяти. JSON.parse в воркере тоже
// отпадает — IDB хранит объект как есть.
let _saveWorker        = null;   // Worker instance
let _saveWorkerFailed  = false;  // не повторять попытку после первого сбоя
let _saveInFlight      = false;  // идёт ли сохранение прямо сейчас

function _getSaveWorker() {
  if (_saveWorker) return _saveWorker;
  if (_saveWorkerFailed) return null;
  try {
    _saveWorker = new Worker('engine/save_worker.js');
    _saveWorker.onmessage = ({ data }) => {
      _saveInFlight = false;
      if (!data.ok) {
        console.warn('[save] Воркер: ошибка сохранения:', data.error);
        if (typeof addEventLog === 'function') {
          addEventLog('⚠ Автосохранение не удалось: ' + data.error, 'warning');
        }
      } else {
        if (typeof window !== 'undefined' && typeof window.markSaved === 'function') {
          window.markSaved();
        }
      }
    };
    _saveWorker.onerror = (e) => {
      _saveInFlight = false;
      console.warn('[save] Ошибка воркера:', e.message);
    };
    return _saveWorker;
  } catch (e) {
    _saveWorkerFailed = true;
    console.warn('[save] Web Worker недоступен, используем обычное сохранение (нужен HTTP-сервер):', e.message);
    return null;
  }
}

function _buildSavePayload() {
  const senateData = {};
  for (const [nationId, mgr] of Object.entries(SENATE_MANAGERS)) {
    try { senateData[nationId] = mgr.toJSON(); } catch (_) {}
  }

  const { _turn_summary_history, _last_turn_snapshot, _pending_char_initiatives, ...base } = GAME_STATE;

  if (base.events_log?.length > 50) base.events_log = base.events_log.slice(0, 50);

  if (base.nations) {
    const nationsClean = Object.create(null);
    for (const [nId, n] of Object.entries(base.nations)) {
      if (n._ou || n._personalityMatrix) {
        const { _ou, _personalityMatrix, ...stripped } = n;
        nationsClean[nId] = stripped;
      } else {
        nationsClean[nId] = n;
      }
    }
    base.nations = nationsClean;
  }

  return { ...base, _senate: senateData };
}

// Session 26 (perf): trottle-автосохранение.
// Без { force: true } сохранение пропускается, если (GAME_STATE.turn-1)
// не кратно CONFIG.SAVE_INTERVAL_TURNS и это не первый ход.
// Вызовы turn.js — throttled; тесты (test_save_roundtrip) и manual UI-кнопка
// (если появится) должны передавать `{ force: true }`.
let _lastSavedTurn = 0;

function _shouldSaveThisTurn() {
  const turn     = GAME_STATE?.turn ?? 1;
  const interval = Math.max(1, CONFIG.SAVE_INTERVAL_TURNS ?? 1);
  // Всегда сохраняем на первом ходу (начальный snapshot) и на последнем
  // сохранённом + interval (чтобы lose на крэше был ограничен).
  if (turn === 1) return true;
  if (turn - _lastSavedTurn >= interval) return true;
  return false;
}

export function _forceNextSave() {
  // Сбрасывает последний-сохранённый курсор; следующий saveGame() без force
  // всё равно сработает. Используется, когда extern UI хочет триггернуть save.
  _lastSavedTurn = -Infinity;
}

export function _getLastSavedTurn() {
  return _lastSavedTurn;
}

export async function saveGame(opts) {
  const force = !!(opts && opts.force);
  if (!force && !_shouldSaveThisTurn()) {
    // Сохранение пропущено по throttle-расписанию. Возвращаемся без работы.
    return { skipped: true };
  }
  _lastSavedTurn = GAME_STATE?.turn ?? _lastSavedTurn;

  const payload = _buildSavePayload();
  const worker  = _getSaveWorker();

  if (worker && !_saveInFlight) {
    _saveInFlight = true;
    setTimeout(() => {
      try {
        // Session 7: structured clone объекта — без JSON.stringify на main.
        worker.postMessage(payload);
      } catch (e) {
        _saveInFlight = false;
        console.warn('[save] Ошибка передачи данных воркеру:', e);
        idbSave(payload).catch(console.warn);
      }
    }, 0);
  } else {
    setTimeout(() => {
      idbSave(payload).then((res) => {
        if (res && res.ok && typeof window !== 'undefined' && typeof window.markSaved === 'function') {
          window.markSaved();
        } else if (res && !res.ok) {
          console.warn('[save] idbSave не смог сохранить:', res.error);
          if (typeof addEventLog === 'function') {
            addEventLog('⚠ Автосохранение не удалось: ' + (res.error || 'неизвестная ошибка'), 'warning');
          }
        }
      }).catch(e => {
        console.warn('[save] Ошибка сохранения:', e);
        if (typeof addEventLog === 'function') {
          addEventLog('⚠ Автосохранение не удалось: ' + e.message, 'warning');
        }
      });
    }, 0);
  }
}

/**
 * Прочитать метаданные сохранения для UI главного меню (turn, дата, нация).
 * НЕ меняет GAME_STATE. Возвращает null если сохранения нет.
 *
 * @returns {Promise<null|{turn:number, year:number, month:number, era:'BC'|'AD',
 *                        nation_id:string, nation_name:string, saved_at:number|null}>}
 */
export async function getSaveMetadata() {
  try {
    await GameStorage.migrate(CONFIG.SAVE_KEY);
    const state = await GameStorage.load();
    if (!state || typeof state !== 'object' || !state.turn) return null;

    const turn = state.turn | 0;
    const startYear = CONFIG.START_YEAR ?? -301;
    const tpy = CONFIG.TURNS_PER_YEAR ?? 12;
    const offsetMonths = Math.max(0, turn - 1);
    const yearsPassed  = Math.floor(offsetMonths / tpy);
    const month        = (offsetMonths % tpy) + 1;           // 1..12
    const year         = startYear + yearsPassed;
    const era          = year < 0 ? 'BC' : 'AD';

    const nationId = state.player_nation || '';
    const nationName = state.nations?.[nationId]?.name ?? nationId;

    return {
      turn,
      year,
      month,
      era,
      nation_id:   nationId,
      nation_name: nationName,
      saved_at:    state._saved_at ?? null,
    };
  } catch (e) {
    console.warn('[getSaveMetadata]', e);
    return null;
  }
}

/**
 * Проверить, есть ли сохранение в хранилище. НЕ меняет GAME_STATE.
 * Используется главным меню для включения/отключения кнопки «Продолжить».
 */
export async function hasSavedGame() {
  try {
    await GameStorage.migrate(CONFIG.SAVE_KEY);
    const state = await GameStorage.load();
    return !!(state && typeof state === 'object' && state.turn);
  } catch (e) {
    console.warn('[hasSavedGame]', e);
    return false;
  }
}

/**
 * Удалить только игровое сохранение. API-ключи (localStorage: _akd, _akgd, _aks)
 * НЕ трогаются — это критическое требование.
 */
export async function deleteAllSaves() {
  try {
    await GameStorage.clear();
    // Дополнительно убираем legacy-запись из localStorage (старые версии игры)
    try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (_) {}
    try { localStorage.removeItem('ancient_strategy_save_fallback'); } catch (_) {}
    return true;
  } catch (e) {
    console.warn('[deleteAllSaves]', e);
    return false;
  }
}

export async function loadGame() {
  try {
    await GameStorage.migrate(CONFIG.SAVE_KEY);

    const loadedState = await GameStorage.load();
    if (!loadedState) return false;

    if (loadedState._senate) {
      for (const [nationId, data] of Object.entries(loadedState._senate)) {
        try {
          SENATE_MANAGERS[nationId] = SenateManager.fromJSON(data);
        } catch (e) {
          console.warn(`Не удалось восстановить сенат ${nationId}:`, e);
        }
      }
      delete loadedState._senate;
    }

    Object.assign(GAME_STATE, loadedState);
    _migrateCharacterIds();
    _sanitizeInstitutions();
    _migrateSenateConfig();
    _migrateCharacterSenateFields();

    for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
      const initial = INITIAL_GAME_STATE.nations?.[nationId];
      if (initial && !nation.color && initial.color) nation.color = initial.color;
      if (initial && !nation.flag_emoji && initial.flag_emoji) nation.flag_emoji = initial.flag_emoji;
    }

    if (typeof REGION_BIOMES !== 'undefined') {
      for (const [rid, biomeId] of Object.entries(REGION_BIOMES)) {
        const r = GAME_STATE.regions[rid];
        if (r && !r.biome) r.biome = biomeId;
      }
    }

    addEventLog('Игра загружена из сохранения.', 'info');
    return true;
  } catch (e) {
    console.warn('Не удалось загрузить игру:', e);
  }
  return false;
}

function _migrateCharacterIds() {
  const INST_CHARS = {
    INST_strategos:       ['CHAR_0001','CHAR_0002','CHAR_0003','CHAR_0004','CHAR_0005'],
    INST_senate:          ['ROME_SEN_001','ROME_SEN_002','ROME_SEN_003','ROME_SEN_004','ROME_SEN_005','ROME_SEN_006','ROME_SEN_007','ROME_SEN_008','ROME_SEN_009'],
    INST_council_hundred: ['CARTH_OLI_001','CARTH_OLI_002','CARTH_OLI_003','CARTH_OLI_004','CARTH_OLI_005','CARTH_OLI_006'],
    INST_royal_court_eg:  ['EGY_CRT_001','EGY_CRT_002','EGY_CRT_003','EGY_CRT_004','EGY_CRT_005'],
    INST_hetairoi:        ['MAC_HTR_001','MAC_HTR_002','MAC_HTR_003','MAC_HTR_004','MAC_HTR_005'],
    INST_elder_council:   ['NUM_ELD_001','NUM_ELD_002','NUM_ELD_003','NUM_ELD_004'],
  };

  for (const nation of Object.values(GAME_STATE.nations)) {
    for (const inst of (nation.government?.institutions ?? [])) {
      if ((!inst.character_ids || inst.character_ids.length === 0) && INST_CHARS[inst.id]) {
        inst.character_ids = INST_CHARS[inst.id];
      }
    }
    if (!nation.government?.ruler?.character_ids?.length) {
      const rulerIds = { numidia: ['NUM_ELD_001','NUM_ELD_002','NUM_ELD_003','NUM_ELD_004'] };
      const nationKey = Object.keys(GAME_STATE.nations).find(k => GAME_STATE.nations[k] === nation);
      if (nationKey && rulerIds[nationKey]) {
        nation.government.ruler.character_ids = rulerIds[nationKey];
      }
    }
  }
}

function _sanitizeInstitutions() {
  for (const nation of Object.values(GAME_STATE.nations)) {
    const insts = nation.government?.institutions;
    if (Array.isArray(insts)) {
      nation.government.institutions = insts.filter(i => i?.id && i?.name);
    }
  }
}

function _migrateSenateConfig() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    if (!nation.senate_config) {
      const initial = INITIAL_GAME_STATE.nations?.[nationId];
      if (initial?.senate_config) {
        nation.senate_config = JSON.parse(JSON.stringify(initial.senate_config));
      }
    }
    const arch = nation.senate_config?.state_architecture;
    if (arch && (arch.senate_capacity ?? 0) < 100) arch.senate_capacity = 100;
  }
}

function _migrateCharacterSenateFields() {
  const INITIAL_SETS = {
    syracuse: typeof INITIAL_CHARACTERS_SYRACUSE !== 'undefined' ? INITIAL_CHARACTERS_SYRACUSE : [],
    rome:     typeof INITIAL_SENATORS_ROME        !== 'undefined' ? INITIAL_SENATORS_ROME        : [],
    carthage: typeof INITIAL_COUNCIL_CARTHAGE     !== 'undefined' ? INITIAL_COUNCIL_CARTHAGE     : [],
    ptolemaic_kingdom: typeof INITIAL_COURT_EGYPT !== 'undefined' ? INITIAL_COURT_EGYPT          : [],
    macedon:  typeof INITIAL_HETAIROI_MACEDON     !== 'undefined' ? INITIAL_HETAIROI_MACEDON     : [],
    numidia:  typeof INITIAL_ELDERS_NUMIDIA       !== 'undefined' ? INITIAL_ELDERS_NUMIDIA       : [],
  };

  for (const [nationId, initials] of Object.entries(INITIAL_SETS)) {
    const nation = GAME_STATE.nations[nationId];
    if (!nation?.characters?.length || !initials.length) continue;

    for (const saved of nation.characters) {
      const template = initials.find(c => c.id === saved.id);
      if (!template) continue;
      if (template.senate_faction_id && !saved.senate_faction_id) {
        saved.senate_faction_id = template.senate_faction_id;
      }
    }
  }
}

export function warmupSaveWorker() {
  _getSaveWorker();
}


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

