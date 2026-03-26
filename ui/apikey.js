// ui/apikey.js — Управление API ключами (Anthropic + Groq)
// Ключи шифруются через Web Crypto API (AES-GCM + PBKDF2) и хранятся в localStorage.
// Открытый текст ключей НИКОГДА не сохраняется напрямую.

'use strict';

const _AK_DATA      = '_akd';                        // зашифрованный Anthropic ключ
const _AK_GROQ_DATA = '_akgd';                       // зашифрованный Groq ключ
const _AK_SALT      = '_aks';                        // соль PBKDF2 (общая)
const _AK_LEGACY    = 'ancient_strategy_api_key';   // старый незашифрованный ключ (миграция)

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

// ── Anthropic ключ ────────────────────────────────────────────
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
    console.warn('[apikey] Не удалось расшифровать Anthropic ключ:', e.message);
    localStorage.removeItem(_AK_DATA);
  }
  return false;
}

async function saveEncryptedAPIKey(apiKey) {
  const encrypted = await _encrypt(apiKey);
  localStorage.setItem(_AK_DATA, encrypted);
  CONFIG.API_KEY = apiKey;
}

// ── Groq ключ ─────────────────────────────────────────────────
async function loadGroqAPIKey() {
  const stored = localStorage.getItem(_AK_GROQ_DATA);
  if (!stored) return false;

  try {
    const key = await _decrypt(stored);
    if (key.length > 10) {
      CONFIG.GROQ_API_KEY = key;
      return true;
    }
  } catch (e) {
    console.warn('[apikey] Не удалось расшифровать Groq ключ:', e.message);
    localStorage.removeItem(_AK_GROQ_DATA);
  }
  return false;
}

async function saveGroqAPIKey(apiKey) {
  const encrypted = await _encrypt(apiKey);
  localStorage.setItem(_AK_GROQ_DATA, encrypted);
  CONFIG.GROQ_API_KEY = apiKey;
}

function deleteEncryptedAPIKey() {
  localStorage.removeItem(_AK_DATA);
  localStorage.removeItem(_AK_GROQ_DATA);
  localStorage.removeItem(_AK_SALT);
  localStorage.removeItem(_AK_LEGACY);
  CONFIG.API_KEY      = '';
  CONFIG.GROQ_API_KEY = '';
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
  const inpAnthropic = document.getElementById('akm-input');
  const inpGroq      = document.getElementById('akm-groq-input');
  const btn          = document.getElementById('akm-btn');
  if (!btn) return;

  const anthropicKey = inpAnthropic?.value.trim() ?? '';
  const groqKey      = inpGroq?.value.trim() ?? '';

  // Нужен хотя бы один ключ
  if (!anthropicKey && !groqKey) {
    _akmSetError('Введите хотя бы один ключ (Groq или Anthropic)');
    return;
  }
  if (anthropicKey && !anthropicKey.startsWith('sk-ant-')) {
    _akmSetError('Anthropic ключ должен начинаться с sk-ant-');
    inpAnthropic.style.animation = 'none';
    void inpAnthropic.offsetWidth;
    inpAnthropic.style.animation = 'akShake 0.4s ease';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Шифрование...';
  _akmSetError('');

  try {
    if (anthropicKey) await saveEncryptedAPIKey(anthropicKey);
    if (groqKey)      await saveGroqAPIKey(groqKey);

    hideAPIKeyModal();
    const modal = document.getElementById('api-key-modal');
    if (modal && modal._cb) { modal._cb(); modal._cb = null; }

    const saved = [
      anthropicKey ? 'Anthropic' : null,
      groqKey      ? 'Groq'      : null,
    ].filter(Boolean).join(' + ');
    if (typeof showAIResponse === 'function') {
      showAIResponse(`✅ Ключи сохранены и зашифрованы: ${saved}`, 'success');
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
  showAPIKeyModal(null);
}

// ── Инлайн-форма ключей в правой панели ──────────────────────────

// Обновляет статусную строку под инлайн-формой и в нижней панели
function _updateInlineKeyStatus() {
  const parts = [];
  if (CONFIG.GROQ_API_KEY)  parts.push('Groq');
  if (CONFIG.API_KEY)       parts.push('Anthropic');

  const inline = document.getElementById('inline-key-status');
  if (inline) {
    inline.textContent = parts.length
      ? '✅ ' + parts.map(p => p + ' сохранён').join(' · ')
      : '⚠️ Ключи не сохранены';
    inline.style.color = parts.length ? '#4caf50' : 'var(--text-dim)';
  }

  const bottom = document.getElementById('ak-section-status');
  if (bottom) {
    bottom.textContent = parts.length ? '✅ ' + parts.join(' + ') : '⚠️ нет ключей';
    bottom.style.color = parts.length ? '#4caf50' : '#f44336';
  }
}

// Сохраняет ключи из инлайн-формы (без удаления существующих)
async function saveInlineAPIKeys() {
  const groqVal      = (document.getElementById('inline-groq-key')?.value ?? '').trim();
  const anthropicVal = (document.getElementById('inline-anthropic-key')?.value ?? '').trim();

  if (!groqVal && !anthropicVal) {
    const el = document.getElementById('inline-key-status');
    if (el) { el.textContent = '⚠️ Введите хотя бы один ключ'; el.style.color = '#f44336'; }
    return;
  }
  if (anthropicVal && !anthropicVal.startsWith('sk-ant-')) {
    const el = document.getElementById('inline-key-status');
    if (el) { el.textContent = '❌ Anthropic ключ должен начинаться с sk-ant-'; el.style.color = '#f44336'; }
    return;
  }

  try {
    if (groqVal)      await saveGroqAPIKey(groqVal);
    if (anthropicVal) await saveEncryptedAPIKey(anthropicVal);

    // Очищаем поля после сохранения
    const groqInp      = document.getElementById('inline-groq-key');
    const anthropicInp = document.getElementById('inline-anthropic-key');
    if (groqInp)      groqInp.value = '';
    if (anthropicInp) anthropicInp.value = '';

    _updateInlineKeyStatus();
    if (typeof addEventLog === 'function') {
      const saved = [groqVal ? 'Groq' : null, anthropicVal ? 'Anthropic' : null].filter(Boolean).join(' + ');
      addEventLog(`🔑 API ключи сохранены: ${saved}`, 'info');
    }
  } catch (e) {
    const el = document.getElementById('inline-key-status');
    if (el) { el.textContent = '❌ Ошибка: ' + e.message; el.style.color = '#f44336'; }
  }
}

// ──────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ (вызывается при старте игры)
// ──────────────────────────────────────────────────────────────

async function initAPIKey() {
  const foundAnthropic = await loadEncryptedAPIKey();
  const foundGroq      = await loadGroqAPIKey();
  // Показываем модал если нет ни одного ключа
  if (!foundAnthropic && !foundGroq) showAPIKeyModal(null);
  // Обновляем статус инлайн-формы
  _updateInlineKeyStatus();
}
