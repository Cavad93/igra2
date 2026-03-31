// engine/save_worker.js
// Сохраняет игровое состояние в IndexedDB из отдельного потока.
//
// Протокол:
//   Получает: ArrayBuffer (UTF-8 JSON игрового состояния)
//   Отправляет: { ok: true } | { ok: false, error: string }

'use strict';

const DB_NAME    = 'ancient_strategy_db';
const DB_VERSION = 1;
const STORE      = 'saves';
const SAVE_KEY   = 'current';

let _db = null;

function _openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

self.onmessage = async ({ data }) => {
  try {
    const json    = new TextDecoder().decode(data);
    const payload = JSON.parse(json);

    const db = await _openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(payload, SAVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });

    self.postMessage({ ok: true });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
