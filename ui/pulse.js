// Шаг 35 — Визуальный "пульс" для критических событий
// Мгновенно привлекает внимание — без звука, через CSS-анимацию
// на `body::after`. Типы: 'war' | 'gold' | 'warning' | 'dark'.
//
// Реализация чисто через CSS keyframes + классы на <body>,
// поэтому не влияет на FPS и не мешает кликам (pointer-events: none).

(function () {
  'use strict';

  // Список поддерживаемых типов пульса (см. таблицу в arma.md Шаг 35)
  var PULSE_TYPES = ['war', 'gold', 'warning', 'dark'];

  // Длительность, после которой класс должен быть снят (мс).
  // Должна быть >= самой длинной анимации pulse-edge (2s для pulse-war).
  var PULSE_DURATION_MS = 2000;

  var _pulseTimer = null;

  function _removeAllPulseClasses(body) {
    for (var i = 0; i < PULSE_TYPES.length; i++) {
      body.classList.remove('pulse-' + PULSE_TYPES[i]);
    }
  }

  /**
   * Запускает визуальный пульс по краям экрана.
   * @param {string} type - war | gold | warning | dark
   */
  function triggerPulse(type) {
    if (typeof document === 'undefined' || !document.body) return;
    if (PULSE_TYPES.indexOf(type) < 0) return;

    var body = document.body;

    // Сбросить предыдущий пульс (если был) — чтобы новый всегда проигрывался
    if (_pulseTimer) {
      clearTimeout(_pulseTimer);
      _pulseTimer = null;
    }
    _removeAllPulseClasses(body);

    // Reflow, чтобы анимация перезапускалась при повторных вызовах того же типа
    // (иначе браузер может проигнорировать класс, если он уже был применён)
    // eslint-disable-next-line no-unused-expressions
    void body.offsetWidth;

    body.classList.add('pulse-' + type);

    _pulseTimer = setTimeout(function () {
      _removeAllPulseClasses(body);
      _pulseTimer = null;
    }, PULSE_DURATION_MS);
  }

  if (typeof window !== 'undefined') {
    window.triggerPulse = triggerPulse;
    window.PULSE_TYPES = PULSE_TYPES;
  }
})();
