/* ═══════════════════════════════════════════════════════════
   ЭТАП 30 (uisuper.md) — UI-реакции на игровые события.
   При ключевых событиях (битва, победа, катастрофа, мир)
   кратковременно меняется интенсивность ambient-слоя,
   экран вспыхивает цветом, дрожит (для катастрофы), а
   клепсидра-кнопка светится золотом (для победы).
   Экспорт: `window.UIReactions`.
   Вынесен из inline-скрипта index.html в этапе 42.
   ═══════════════════════════════════════════════════════════ */
(function () {
  var _flashLock = 0;

  var UIReactions = {
    // Битва началась — лёгкий тёмно-красный flash, ambient → 0.8.
    onBattleStart: function (locationName) {
      if (window.AmbientLayer && typeof AmbientLayer.setIntensity === 'function') {
        AmbientLayer.setIntensity(0.8);
      }
      UIReactions._flash('rgba(80,10,10,0.15)', 300);
    },

    // Победа — золотой flash + подсветка клепсидры.
    onVictory: function () {
      if (window.AmbientLayer && typeof AmbientLayer.setIntensity === 'function') {
        AmbientLayer.setIntensity(0.4);
      }
      UIReactions._flash('rgba(201,169,97,0.10)', 600);
      var btn = document.getElementById('end-turn-btn');
      if (btn) {
        btn.style.filter = 'drop-shadow(0 0 16px rgba(201,169,97,0.9))';
        setTimeout(function () {
          btn.style.filter = '';
        }, 1500);
      }
    },

    // Катастрофа / крупный провал — тёмно-красный flash + шейк экрана.
    onCatastrophe: function () {
      if (window.AmbientLayer && typeof AmbientLayer.setIntensity === 'function') {
        AmbientLayer.setIntensity(1.0);
      }
      UIReactions._flash('rgba(60,0,0,0.25)', 500);
      var app = document.getElementById('app');
      if (app) {
        app.style.animation = 'ui-shake 0.3s ease';
        setTimeout(function () {
          app.style.animation = '';
          if (window.AmbientLayer && typeof AmbientLayer.setIntensity === 'function') {
            AmbientLayer.setIntensity(0.6);
          }
        }, 400);
      }
    },

    // Мир / завершение войны — мягкий зелёный flash, ambient → 0.2.
    onPeace: function () {
      if (window.AmbientLayer && typeof AmbientLayer.setIntensity === 'function') {
        AmbientLayer.setIntensity(0.2);
      }
      UIReactions._flash('rgba(40,80,40,0.08)', 800);
    },

    // Вспомогательное: создать overlay-flash.
    _flash: function (color, duration) {
      // Защита от наложения одновременных вспышек — ограничиваем до 3.
      if (_flashLock >= 3) return;
      _flashLock++;
      var flash = document.createElement('div');
      flash.style.cssText =
        'position:fixed;inset:0;z-index:99990;background:' + color +
        ';pointer-events:none;opacity:0;transition:opacity ' + duration + 'ms ease;';
      document.body.appendChild(flash);
      requestAnimationFrame(function () {
        flash.style.opacity = '1';
        setTimeout(function () {
          flash.style.opacity = '0';
          setTimeout(function () {
            if (flash && flash.parentNode) flash.parentNode.removeChild(flash);
            _flashLock = Math.max(0, _flashLock - 1);
          }, duration);
        }, 50);
      });
    },
  };

  window.UIReactions = UIReactions;
})();
