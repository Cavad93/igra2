// ============================================================================
//  arma.md Шаг 58 — Фон splash-экрана: историческая фреска с культурным тинтом
//
//  initSplash(nationId)
//    Устанавливает CSS-переменную --splash-bg на путь к JPG-фреске,
//    выбранной по splash_bg культурной группы нации (Шаг 55).
//    После завершения загрузки показывает кнопку "Начать игру",
//    которая скрывает splash плавной анимацией splashFade (0.6s).
//
//  hideSplashWithAnimation()
//    Программно скрывает splash через ту же анимацию (для авто-скрытия).
//
//  Фреска — CC0/PD-изображение из assets/backgrounds/. Если файл не скачан,
//  браузер тихо деградирует к background-color (нет крашей).
//
//  Глобально экспортируется как window.initSplash / window.hideSplashWithAnimation.
// ============================================================================

(function () {
  const FALLBACK_BG_ID = 'splash_pompeii';
  const BG_DIR         = 'assets/backgrounds/';

  /**
   * Резолвит id splash-фона из культурной группы нации.
   * Если getCultureGroup недоступна или нация неизвестна — fallback.
   */
  function resolveSplashBgId(nationId) {
    if (typeof getCultureGroup === 'function') {
      try {
        const group = getCultureGroup(nationId);
        if (group && group.splash_bg) return group.splash_bg;
      } catch (_) { /* ignore */ }
    }
    return FALLBACK_BG_ID;
  }

  /**
   * Устанавливает CSS-переменную --splash-bg на documentElement.
   * @param {string} nationId   id нации (или null/undefined для fallback)
   */
  function initSplash(nationId) {
    const bgId   = resolveSplashBgId(nationId);
    const bgPath = BG_DIR + bgId + '.jpg';

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty(
        '--splash-bg', "url('" + bgPath + "')"
      );
    }

    // Привязываем обработчик клика к кнопке "Начать игру", если она есть.
    if (typeof document !== 'undefined') {
      const btn = document.getElementById('splash-start-btn');
      if (btn && !btn._splashBound) {
        btn._splashBound = true;
        btn.addEventListener('click', hideSplashWithAnimation);
      }
    }
  }

  /**
   * Показывает кнопку "Начать игру" после завершения загрузки.
   * Скрывает прогресс-бар и статус.
   */
  function showStartButton() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('splash-start-btn');
    if (btn) btn.style.display = '';
    const wrap = document.getElementById('splash-bar-wrap');
    if (wrap) wrap.style.display = 'none';
    const status = document.getElementById('splash-status');
    if (status) status.style.display = 'none';
  }

  /**
   * Программно скрывает splash через анимацию splashFade.
   */
  function hideSplashWithAnimation() {
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
    // Страховка на случай если animationend не сработал
    // (uisuper Этап 8: splashFade = 0.8s, запас ещё 0.2s)
    setTimeout(() => {
      if (splash.parentNode) {
        splash.style.display = 'none';
        try { splash.parentNode.removeChild(splash); } catch (_) {}
      }
    }, 1000);
  }

  // Экспорт в глобальную область
  if (typeof window !== 'undefined') {
    window.initSplash               = initSplash;
    window.showSplashStartButton    = showStartButton;
    window.hideSplashWithAnimation  = hideSplashWithAnimation;
  }

  // CommonJS-экспорт для Node-тестов
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initSplash,
      showSplashStartButton: showStartButton,
      hideSplashWithAnimation,
      resolveSplashBgId,
    };
  }
})();
