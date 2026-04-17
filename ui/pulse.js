// Визуальный "пульс" для критических событий
// Типы: 'war' | 'gold' | 'warning' | 'dark'

export const PULSE_TYPES = ['war', 'gold', 'warning', 'dark'];

const PULSE_DURATION_MS = 2000;
let _pulseTimer = null;

function _removeAllPulseClasses(body) {
  for (let i = 0; i < PULSE_TYPES.length; i++) {
    body.classList.remove('pulse-' + PULSE_TYPES[i]);
  }
}

export function triggerPulse(type) {
  if (typeof document === 'undefined' || !document.body) return;
  if (PULSE_TYPES.indexOf(type) < 0) return;

  const body = document.body;

  if (_pulseTimer) {
    clearTimeout(_pulseTimer);
    _pulseTimer = null;
  }
  _removeAllPulseClasses(body);

  void body.offsetWidth;

  body.classList.add('pulse-' + type);

  _pulseTimer = setTimeout(function () {
    _removeAllPulseClasses(body);
    _pulseTimer = null;
  }, PULSE_DURATION_MS);
}

// Backward compat: expose to non-module scripts (ai/)
if (typeof window !== 'undefined') {
}
