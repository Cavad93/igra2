// engine/ai_worker.js
// AI Worker Manager — управление Web Worker для Groq-запросов
// и фоновый AI-цикл (Super-OU).
// Вынесено из engine/turn.js (Этап 50).

import { CONFIG } from '../config.js';
import { SuperOU } from './super_ou.js';

// ── Фоновый AI: кэш решений и флаг цикла ────────────────────────────────
export const _aiPending = new Map();
let _aiBgRunning = false;

// ══════════════════════════════════════════════════════════════════════
// AI HTTP WORKER — Groq-запросы в отдельном потоке
// ══════════════════════════════════════════════════════════════════════

let _aiHttpWorker       = null;
let _aiHttpWorkerFailed = false;
let _aiReqCounter  = 0;
const _aiPendingReqs = new Map();

function _getAIHttpWorker() {
  if (_aiHttpWorker) return _aiHttpWorker;
  if (_aiHttpWorkerFailed) return null;
  try {
    _aiHttpWorker = new Worker('ai/ai_worker.js');
    _aiHttpWorker.onmessage = ({ data }) => {
      const cb = _aiPendingReqs.get(data.id);
      if (!cb) return;
      _aiPendingReqs.delete(data.id);
      if (data.ok) cb.resolve(data.raw);
      else         cb.reject(new Error(data.error));
    };
    _aiHttpWorker.onerror = (e) => {
      for (const [id, cb] of _aiPendingReqs) {
        cb.reject(new Error(`AI Worker: ${e.message}`));
        _aiPendingReqs.delete(id);
      }
    };
    return _aiHttpWorker;
  } catch (e) {
    _aiHttpWorkerFailed = true;
    console.warn('[ai_worker] Web Worker недоступен (Workers работают только через HTTP-сервер, не file://):', e.message);
    return null;
  }
}

export function _callGroqViaWorker(system, user, maxTokens) {
  if (!CONFIG?.GROQ_API_KEY) return null;
  const worker = _getAIHttpWorker();
  if (!worker) return null;

  const id = ++_aiReqCounter;
  return new Promise((resolve, reject) => {
    _aiPendingReqs.set(id, { resolve, reject });
    worker.postMessage({
      id,
      url:       CONFIG.GROQ_API_URL,
      apiKey:    CONFIG.GROQ_API_KEY,
      model:     CONFIG.MODEL_WAR_AI,
      maxTokens,
      system,
      user,
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// ФОНОВЫЙ AI-ЦИКЛ
// ══════════════════════════════════════════════════════════════════════

export function startAIBackgroundLoop() {
  if (_aiBgRunning) return;
  _aiBgRunning = true;
  console.log('[ai_bg] Фоновый AI-цикл запущен');
  _aiBgTick();
}

export function stopAIBackgroundLoop() {
  _aiBgRunning = false;
  console.log('[ai_bg] Фоновый AI-цикл остановлен');
}

async function _aiBgTick() {
  if (!_aiBgRunning) return;
  try {
    await _aiBgProcess();
  } catch (e) {
    console.warn('[ai_bg] Ошибка тика:', e.message);
  }
  if (_aiBgRunning) setTimeout(_aiBgTick, 200);
}

async function _aiBgProcess() {
  if (!GAME_STATE?.nations || IS_PROCESSING_TURN) return;
  if (!SuperOU) return;

  const tier1 = [], tier2 = [];
  for (const [nId, n] of Object.entries(GAME_STATE.nations)) {
    if (n.is_player || n.is_eliminated) continue;
    const tier = typeof getNationTier === 'function' ? getNationTier(nId) : 3;
    if      (tier === 1) tier1.push(nId);
    else if (tier === 2) tier2.push(nId);
  }

  const rotationList = [...tier1, ...tier2];
  if (rotationList.length === 0) return;

  const currentTurn = GAME_STATE.turn ?? 0;
  const playerNationIdBg = GAME_STATE.player_nation;

  if (CONFIG?.GROQ_API_KEY) {
    for (const nId of rotationList) {
      if (!playerNationIdBg) break;
      const atWar = (GAME_STATE.nations[nId]?.military?.at_war_with ?? []).includes(playerNationIdBg);
      if (!atWar) continue;
      const cached = _aiPending.get(nId);
      const isFresh = cached && cached.source === 'war_bg' && (currentTurn - cached.turn) <= 1;
      if (isFresh) continue;
      const prompts = typeof window._buildWarPrompts === 'function' ? window._buildWarPrompts(nId) : null;
      if (!prompts) continue;
      const workerPromise = _callGroqViaWorker(prompts.system, prompts.user, 400);
      if (!workerPromise) break;
      workerPromise
        .then(raw => {
          if (!raw) return;
          const decision = typeof window._parseWarDecision === 'function'
            ? window._parseWarDecision(raw, nId)
            : null;
          if (decision) {
            _aiPending.set(nId, { decision, turn: currentTurn, source: 'war_bg', processedAt: Date.now() });
            console.log(`[ai_bg] ⚔ war pre-cache: ${GAME_STATE.nations[nId]?.name ?? nId} → ${decision.action}`);
          }
        })
        .catch(e => console.warn(`[ai_bg] war pre-cache ошибка для ${nId}:`, e.message));
    }
  }

  const needsUpdate = nId => {
    if (playerNationIdBg &&
        (GAME_STATE.nations[nId]?.military?.at_war_with ?? []).includes(playerNationIdBg)) {
      return false;
    }
    const c = _aiPending.get(nId);
    return !c || (currentTurn - c.turn) > 2;
  };

  const currentTurnBg = GAME_STATE.turn ?? 0;
  const hotNations = new Set(
    (GAME_STATE.events_log ?? [])
      .filter(e => (currentTurnBg - (e.turn ?? 0)) <= 2
        && (e.type === 'military' || e.type === 'diplomacy'))
      .flatMap(e => [e.actor, e.target, e.nation].filter(Boolean))
  );

  const atWarUncached = rotationList.filter(
    nId => (GAME_STATE.nations[nId]?.military?.at_war_with?.length ?? 0) > 0 && needsUpdate(nId)
  );
  const hotUncached = rotationList.filter(nId => hotNations.has(nId) && needsUpdate(nId));

  let nationId;
  if (atWarUncached.length > 0) {
    nationId = atWarUncached[0];
  } else if (hotUncached.length > 0) {
    nationId = hotUncached[0];
  } else {
    if (GAME_STATE._ai_bg_cursor == null || GAME_STATE._ai_bg_cursor >= rotationList.length)
      GAME_STATE._ai_bg_cursor = 0;

    let found = false;
    for (let i = 0; i < rotationList.length; i++) {
      const idx = (GAME_STATE._ai_bg_cursor + i) % rotationList.length;
      if (needsUpdate(rotationList[idx])) {
        nationId = rotationList[idx];
        GAME_STATE._ai_bg_cursor = (idx + 1) % rotationList.length;
        found = true;
        break;
      }
    }
    if (!found) {
      return;
    }
  }

  const t0 = Date.now();
  let decision = null;
  try {
    const ouResult = SuperOU.tick(GAME_STATE, nationId);
    if (ouResult?.actions?.length) {
      const top = ouResult.actions[0];
      decision = { action: top.action, target: top.target ?? null, reasoning: `SuperOU p=${top.prob?.toFixed(2)}` };
    }
  } catch (e) {
    console.warn(`[ai_bg] SuperOU tick error for ${nationId}:`, e.message);
  }
  const ms = Date.now() - t0;

  if (decision) {
    _aiPending.set(nationId, { decision, turn: currentTurn, processedAt: Date.now() });
    const nation = GAME_STATE.nations[nationId];
    console.log(`[ai_bg] ${nation?.name ?? nationId}: ${decision.action} | ${ms}ms | SuperOU`);
  }
}


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

