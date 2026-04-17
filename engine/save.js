// engine/save.js — Сохранение / загрузка игры
// Вынесено из engine/turn.js (Этап 52)

import { CONFIG } from '../config.js';

// SaveWorker — сохранение в фоне, не блокирует главный поток.
// JSON.stringify + transfer ArrayBuffer быстрее, чем IndexedDB structured clone на главном потоке.
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

export async function saveGame() {
  const payload = _buildSavePayload();
  const worker  = _getSaveWorker();

  if (worker && !_saveInFlight) {
    _saveInFlight = true;
    setTimeout(() => {
      try {
        const buffer = new TextEncoder().encode(JSON.stringify(payload)).buffer;
        worker.postMessage(buffer, [buffer]);
      } catch (e) {
        _saveInFlight = false;
        console.warn('[save] Ошибка передачи данных воркеру:', e);
        GameStorage.save(payload).catch(console.warn);
      }
    }, 0);
  } else {
    setTimeout(() => {
      GameStorage.save(payload).then(() => {
        if (typeof window !== 'undefined' && typeof window.markSaved === 'function') {
          window.markSaved();
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

