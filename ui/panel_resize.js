// ──────────────────────────────────────────────────────────────
// Шаг 32 — Drag-to-resize боковых панелей
// ──────────────────────────────────────────────────────────────
// Позволяет игроку тянуть разделитель между боковой панелью и картой,
// чтобы освободить место под карту. Ширина сохраняется в localStorage.
// При ширине < COLLAPSE_THRESHOLD левая панель переходит в collapsed-режим:
// скрывается #left-panel-content, остаются только иконки #left-nav.

const PANEL_RESIZE_COLLAPSE_PX = 80;   // порог свёртывания
const PANEL_RESIZE_MIN_PX = 40;        // минимальная ширина (только иконки)
const PANEL_RESIZE_MAX_PX = 360;       // максимальная ширина

function _panelResizeStorageKey(panelId) {
  return 'arma.panelWidth.' + panelId;
}

function _clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// Применить ширину к панели и обновить collapsed-режим
function _applyPanelWidth(panelId, w) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.style.width = w + 'px';
  if (panelId === 'left-panel') {
    if (w < PANEL_RESIZE_COLLAPSE_PX) panel.classList.add('collapsed');
    else panel.classList.remove('collapsed');
  }
}

// Инициализация одного разделителя
export function initPanelResize(resizerId, panelId, minW, maxW) {
  const resizer = document.getElementById(resizerId);
  const panel = document.getElementById(panelId);
  if (!resizer || !panel) return;

  minW = (typeof minW === 'number') ? minW : PANEL_RESIZE_MIN_PX;
  maxW = (typeof maxW === 'number') ? maxW : PANEL_RESIZE_MAX_PX;

  // Восстановить ширину из localStorage
  try {
    const saved = parseInt(localStorage.getItem(_panelResizeStorageKey(panelId)), 10);
    if (!isNaN(saved) && saved >= minW && saved <= maxW) {
      _applyPanelWidth(panelId, saved);
    }
  } catch (e) { /* ignore */ }

  let dragging = false;
  let startX = 0;
  let startW = 0;
  let pendingW = 0;
  let rafPending = false;

  function onMouseMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    pendingW = _clamp(startW + dx, minW, maxW);
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        _applyPanelWidth(panelId, pendingW);
        // Leaflet/Pixi-карта слушают window resize для пересчёта canvas
        try { window.dispatchEvent(new Event('resize')); } catch (_) {}
      });
    }
    e.preventDefault();
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('resizing-panel');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // Финальный dispatch resize, чтобы карта перерисовалась
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    // Сохранить ширину
    try {
      const finalW = panel.getBoundingClientRect().width;
      localStorage.setItem(_panelResizeStorageKey(panelId), String(Math.round(finalW)));
    } catch (e) { /* ignore */ }
  }

  resizer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.classList.add('resizing-panel');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  // Double-click → сброс к дефолту
  resizer.addEventListener('dblclick', () => {
    _applyPanelWidth(panelId, 220);
    try {
      localStorage.removeItem(_panelResizeStorageKey(panelId));
    } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  });
}

// Инициализация всех разделителей. Вызвать после загрузки DOM.
export function initAllPanelResizers() {
  initPanelResize('left-resizer', 'left-panel', PANEL_RESIZE_MIN_PX, PANEL_RESIZE_MAX_PX);
}

// Автоинициализация
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllPanelResizers);
  } else {
    initAllPanelResizers();
  }
}
