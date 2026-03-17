// ui/apikey.js — Управление API ключом
// Ключ шифруется через Web Crypto API (AES-GCM + PBKDF2) и хранится в localStorage.
// Открытый текст ключа НИКОГДА не сохраняется напрямую.

'use strict';

const _AK_DATA   = '_akd';                        // зашифрованный ключ
const _AK_SALT   = '_aks';                        // соль PBKDF2
const _AK_LEGACY = 'ancient_strategy_api_key';   // старый незашифрованный ключ (миграция)

// ──────────────────────────────────────────────────────────────
// КРИПТОГРАФИЯ  (AES-256-GCM + PBKDF2-SHA256, 100 000 итераций)
// Ключ шифрования привязан к устройству через отпечаток браузера.
// ──────────────────────────────────────────────────────────────

async function _deriveKey() {
  const fingerprint = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    'ancient_strategy_v1',
  ].join('|');

  // Соль — одноразовая, генерируется при первом запуске, хранится в localStorage
  let saltB64 = localStorage.getItem(_AK_SALT);
  if (!saltB64) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    saltB64 = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(_AK_SALT, saltB64);
  }
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));

  const raw = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(fingerprint),
    'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function _encrypt(plaintext) {
  const key = await _deriveKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  // Формат хранения: IV (12 байт) || шифртекст
  const buf = new Uint8Array(12 + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...buf));
}

async function _decrypt(b64) {
  const key = await _deriveKey();
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const pt  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.slice(0, 12) },
    key,
    buf.slice(12),
  );
  return new TextDecoder().decode(pt);
}

// ──────────────────────────────────────────────────────────────
// ПУБЛИЧНОЕ API: загрузка / сохранение / удаление
// ──────────────────────────────────────────────────────────────

async function loadEncryptedAPIKey() {
  // Миграция старого открытого ключа → зашифровать и убрать
  const legacy = localStorage.getItem(_AK_LEGACY);
  if (legacy && legacy.startsWith('sk-ant-')) {
    try {
      await saveEncryptedAPIKey(legacy);
      localStorage.removeItem(_AK_LEGACY);
      CONFIG.API_KEY = legacy;
      return true;
    } catch (_) { /* пробуем зашифрованный */ }
  }

  const stored = localStorage.getItem(_AK_DATA);
  if (!stored) return false;

  try {
    const key = await _decrypt(stored);
    if (key.startsWith('sk-ant-')) {
      CONFIG.API_KEY = key;
      return true;
    }
  } catch (e) {
    console.warn('[apikey] Не удалось расшифровать ключ:', e.message);
    localStorage.removeItem(_AK_DATA);
  }
  return false;
}

async function saveEncryptedAPIKey(apiKey) {
  const encrypted = await _encrypt(apiKey);
  localStorage.setItem(_AK_DATA, encrypted);
  CONFIG.API_KEY = apiKey;
}

function deleteEncryptedAPIKey() {
  localStorage.removeItem(_AK_DATA);
  localStorage.removeItem(_AK_SALT);
  localStorage.removeItem(_AK_LEGACY);
  CONFIG.API_KEY = '';
}

// ──────────────────────────────────────────────────────────────
// СТАРТОВЫЙ МОДАЛ
// ──────────────────────────────────────────────────────────────

function _akmSetError(msg) {
  const el = document.getElementById('akm-error');
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function showAPIKeyModal(onSuccess) {
  const modal = document.getElementById('api-key-modal');
  if (!modal) return;
  modal._cb = onSuccess || null;
  modal.style.display = 'flex';
  _akmSetError('');
  const btn = document.getElementById('akm-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Сохранить и продолжить'; }
  const inp = document.getElementById('akm-input');
  if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 80); }
}

function hideAPIKeyModal() {
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
}

async function submitAPIKey() {
  const inp = document.getElementById('akm-input');
  const btn = document.getElementById('akm-btn');
  if (!inp || !btn) return;

  const key = inp.value.trim();
  if (!key.startsWith('sk-ant-')) {
    _akmSetError('Неверный формат. Ключ должен начинаться с sk-ant-');
    inp.style.animation = 'none';
    void inp.offsetWidth;  // reflow для перезапуска анимации
    inp.style.animation = 'akShake 0.4s ease';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Шифрование...';
  _akmSetError('');

  try {
    await saveEncryptedAPIKey(key);
    hideAPIKeyModal();
    const modal = document.getElementById('api-key-modal');
    if (modal && modal._cb) { modal._cb(); modal._cb = null; }
    // Показываем подтверждение в AI-блоке (если уже инициализирован)
    if (typeof showAIResponse === 'function') {
      showAIResponse('✅ API ключ сохранён и зашифрован на устройстве.', 'success');
    }
  } catch (e) {
    _akmSetError('Ошибка шифрования: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Сохранить и продолжить';
  }
}

// Enter в поле → сохранить
function _akmKeyDown(e) {
  if (e.key === 'Enter') submitAPIKey();
}

// Смена ключа (вызывается из UI)
function changeAPIKey() {
  deleteEncryptedAPIKey();
  showAPIKeyModal(null);
}

// ──────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ (вызывается при старте игры)
// ──────────────────────────────────────────────────────────────

async function initAPIKey() {
  const found = await loadEncryptedAPIKey();
  if (!found) showAPIKeyModal(null);
}
