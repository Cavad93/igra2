// engine/idb_storage.js — тонкий helper: IDB + localStorage-fallback.
//
// Session 7: используется из engine/save.js как резервный путь, когда
// Web Worker недоступен (file://, строгий CSP, sandbox без Worker).
//
// API:
//   await idbSave(payload)   — положить объект в IndexedDB (store 'saves', key 'current')
//   await idbLoad()          — вернуть объект из IDB или null
//   await idbClear()         — удалить сохранение
//   idbSupported()           — синхронная проверка доступности indexedDB
//
// Поведение:
//   — IDB-путь принимает объект напрямую, структурный клон делает сам IDB.
//   — Если IDB выбрасывает (QuotaExceededError, NotAllowedError и т.п.) —
//     делаем JSON.stringify + localStorage.setItem(LS_KEY).
//     На fallback-пути stringify неизбежен, т.к. localStorage принимает
//     только строки; это OK — fallback срабатывает редко (только когда IDB
//     реально сломан).
//
// Ключ IDB совпадает с engine/storage.js и engine/save_worker.js
// (STORE='saves', SAVE_KEY='current'), чтобы и воркер, и main читали
// одну и ту же запись.

'use strict';

const DB_NAME    = 'ancient_strategy_db';
const DB_VERSION = 1;
const STORE      = 'saves';
const SAVE_KEY   = 'current';
const LS_KEY     = 'ancient_strategy_save_fallback';

let _dbPromise = null;

export function idbSupported() {
  return typeof indexedDB !== 'undefined';
}

function _openDB() {
  if (_dbPromise) return _dbPromise;
  if (!idbSupported()) {
    _dbPromise = Promise.reject(new Error('IndexedDB unavailable'));
    return _dbPromise;
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return _dbPromise;
}

function _lsSaveFallback(payload) {
  try {
    const json = JSON.stringify(payload);
    localStorage.setItem(LS_KEY, json);
    return true;
  } catch (e) {
    console.warn('[idb_storage] localStorage-fallback не удался:', e.message);
    return false;
  }
}

function _lsLoadFallback() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[idb_storage] чтение localStorage-fallback не удалось:', e.message);
    return null;
  }
}

export async function idbSave(payload) {
  try {
    const db = await _openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(payload, SAVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
    return { ok: true, backend: 'idb' };
  } catch (e) {
    const saved = _lsSaveFallback(payload);
    return { ok: saved, backend: saved ? 'localStorage' : 'none', error: e.message };
  }
}

export async function idbLoad() {
  try {
    const db = await _openDB();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(SAVE_KEY);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (_e) {
    return _lsLoadFallback();
  }
}

export async function idbClear() {
  try {
    const db = await _openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(SAVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (_e) { /* ignore */ }
  try { localStorage.removeItem(LS_KEY); } catch (_e) { /* ignore */ }
}
