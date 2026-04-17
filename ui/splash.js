/* splash.js — Фон splash-экрана: историческая фреска с культурным тинтом */

const FALLBACK_BG_ID = 'splash_pompeii';
const BG_DIR         = 'assets/backgrounds/';

function resolveSplashBgId(nationId) {
  if (typeof window.getCultureGroup === 'function') {
    try {
      const group = window.getCultureGroup(nationId);
      if (group && group.splash_bg) return group.splash_bg;
    } catch (_) { /* ignore */ }
  }
  return FALLBACK_BG_ID;
}

export function initSplash(nationId) {
  const bgId   = resolveSplashBgId(nationId);
  const bgPath = BG_DIR + bgId + '.jpg';

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty(
      '--splash-bg', "url('" + bgPath + "')"
    );
  }

  if (typeof document !== 'undefined') {
    const btn = document.getElementById('splash-start-btn');
    if (btn && !btn._splashBound) {
      btn._splashBound = true;
      btn.addEventListener('click', hideSplashWithAnimation);
    }
  }
}

export function showSplashStartButton() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('splash-start-btn');
  if (btn) btn.style.display = '';
  const wrap = document.getElementById('splash-bar-wrap');
  if (wrap) wrap.style.display = 'none';
  const status = document.getElementById('splash-status');
  if (status) status.style.display = 'none';
}

export function hideSplashWithAnimation() {
  if (typeof document === 'undefined') return;
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  if (splash.classList.contains('splash--hiding')) return;
  splash.classList.add('splash--hiding');
  const onEnd = () => {
    splash.removeEventListener('animationend', onEnd);
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  };
  splash.addEventListener('animationend', onEnd, { once: true });
  setTimeout(() => {
    if (splash.parentNode) {
      splash.style.display = 'none';
      try { splash.parentNode.removeChild(splash); } catch (_) {}
    }
  }, 1000);
}

// Backward compat
if (typeof window !== 'undefined') {
  window.initSplash               = initSplash;
  window.showSplashStartButton    = showSplashStartButton;
  window.hideSplashWithAnimation  = hideSplashWithAnimation;
}
