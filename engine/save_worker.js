// engine/save_worker.js
// Сохраняет игровое состояние в IndexedDB из отдельного потока.
//
// Session 7: теперь принимает payload-объект напрямую (structured clone через
// postMessage). JSON.stringify на main-треде убран. Если кто-то всё ещё
// посылает ArrayBuffer (старый протокол), мы декодируем и парсим — это
// сохраняет совместимость.
//
// Протокол:
//   Получает: object (payload game state) | ArrayBuffer (legacy UTF-8 JSON)
//   Отправляет: { ok: true, backend: 'idb' } | { ok: false, error: string }

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
    let payload;
    if (data instanceof ArrayBuffer) {
      // Легаси-путь — до Session 7 main-тред отправлял UTF-8 JSON.
      const json = new TextDecoder().decode(data);
      payload = JSON.parse(json);
    } else {
      // Session 7: structured-clone объект — кладём в IDB как есть.
      payload = data;
    }

    const db = await _openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(payload, SAVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });

    self.postMessage({ ok: true, backend: 'idb' });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
