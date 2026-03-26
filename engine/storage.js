// engine/storage.js — IndexedDB хранилище сохранений
//
// Замена localStorage: нет лимита 5 МБ, хранит JS-объекты напрямую (без JSON).
// API:
//   await GameStorage.save(payload)   — сохранить объект
//   await GameStorage.load()          — загрузить объект (null если нет сохранения)
//   await GameStorage.clear()         — удалить сохранение
//   await GameStorage.migrate()       — перенести старое сохранение из localStorage

'use strict';

const GameStorage = (() => {
  const DB_NAME    = 'ancient_strategy_db';
  const DB_VERSION = 1;
  const STORE      = 'saves';
  const SAVE_KEY   = 'current';

  let _dbPromise = null;

  function _open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };

      req.onsuccess = (e) => {
        console.log('[storage] IndexedDB открыта');
        resolve(e.target.result);
      };

      req.onerror = (e) => {
        console.error('[storage] Не удалось открыть IndexedDB:', e.target.error);
        reject(e.target.error);
      };
    });
    return _dbPromise;
  }

  // ── Сохранить объект ───────────────────────────────────────
  async function save(payload) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(payload, SAVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── Загрузить объект ───────────────────────────────────────
  async function load() {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(SAVE_KEY);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── Удалить сохранение ─────────────────────────────────────
  async function clear() {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(SAVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── Миграция из localStorage → IndexedDB ──────────────────
  // Вызывается один раз при первом запуске после обновления
  async function migrate(legacyKey) {
    try {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) return false;

      // Проверяем — нет ли уже данных в IndexedDB
      const existing = await load();
      if (existing) {
        localStorage.removeItem(legacyKey);
        return false; // уже мигрировано
      }

      const parsed = JSON.parse(raw);
      await save(parsed);
      localStorage.removeItem(legacyKey);
      console.log('[storage] Сохранение мигрировано из localStorage → IndexedDB');
      return true;
    } catch (e) {
      console.warn('[storage] Ошибка миграции:', e);
      return false;
    }
  }

  // Прогрев соединения при загрузке страницы
  _open().catch(console.warn);

  return { save, load, clear, migrate };
})();
