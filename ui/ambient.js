/* ═══════════════════════════════════════════════════════════
   ЭТАП 29 (uisuper.md) — Ambient-слой: живые тессеры фона.
   Тонкий canvas позади интерфейса, где медленно дрейфуют
   крошечные точки. Интенсивность повышается во время войны
   и используется Этапом 30 (UIReactions). Всё — внутри
   одного IIFE, глобально экспортируется `window.AmbientLayer`.
   Вынесен из inline-скрипта index.html в этапе 42.
   ═══════════════════════════════════════════════════════════ */
  export var AmbientLayer = {
    canvas: null,
    ctx: null,
    particles: [],
    _raf: null,
    _intensity: 0.3,        // 0 = покой, 1 = война
    _dpr: 1,
    _visible: true,
    _paused: false,         // Session 11 — форс-пауза на время processTurn()

    PARTICLE_COUNT: 120,

    init: function () {
      if (this._inited) return;
      this.canvas = document.getElementById('ambient-canvas');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d', { alpha: true });
      if (!this.ctx) return;
      this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._resize();
      this._spawn();
      var self = this;
      this._onResize = function () { self._resize(); self._spawn(); };
      window.addEventListener('resize', this._onResize, { passive: true });
      // Приостанавливаем рисование когда вкладка скрыта — экономим батарею.
      document.addEventListener('visibilitychange', function () {
        self._visible = !document.hidden;
        if (self._visible && !self._raf) self._loop();
      });
      this._loop();
      this._inited = true;
    },

    // Установить интенсивность: 0 = мир, 1 = война.
    setIntensity: function (v) {
      if (typeof v !== 'number' || isNaN(v)) return;
      this._intensity = Math.max(0, Math.min(1, v));
    },

    getIntensity: function () {
      return this._intensity;
    },

    _resize: function () {
      if (!this.canvas) return;
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = this._dpr;
      this.canvas.width  = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.canvas.style.width  = w + 'px';
      this.canvas.style.height = h + 'px';
      // Рисуем в CSS-пикселях.
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    _spawn: function () {
      this.particles.length = 0;
      for (var i = 0; i < this.PARTICLE_COUNT; i++) {
        this.particles.push(this._newParticle(true));
      }
    },

    _newParticle: function (randomPos) {
      var W = window.innerWidth;
      var H = window.innerHeight;
      var size = 0.8 + Math.random() * 1.2;
      return {
        x: randomPos ? Math.random() * W : (Math.random() < 0.5 ? -1 : W + 1),
        y: randomPos ? Math.random() * H : Math.random() * H,
        size: size,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        brightness: 6 + Math.random() * 6,
        opacity: 0.10 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      };
    },

    // Session 11 — остановить RAF на время обсчёта хода.
    // Идемпотентно: повторный pause() безопасен.
    pause: function () {
      this._paused = true;
      if (this._raf != null) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      }
    },

    // Session 11 — возобновить RAF после processTurn().
    // Учитывает _visible (вкладка в фоне) и _inited.
    resume: function () {
      if (!this._paused) return;
      this._paused = false;
      if (this._inited && this._visible && this._raf == null) {
        this._loop();
      }
    },

    _loop: function () {
      if (!this.ctx || !this.canvas) return;
      if (this._paused) { this._raf = null; return; }
      if (!this._visible) { this._raf = null; return; }

      var W = window.innerWidth;
      var H = window.innerHeight;
      var ctx = this.ctx;
      var t = performance.now() * 0.001;
      var speed = 0.5 + this._intensity * 2.5;

      ctx.clearRect(0, 0, W, H);

      var arr = this.particles;
      for (var i = arr.length - 1; i >= 0; i--) {
        var p = arr[i];
        p.x += p.vx * speed;
        p.y += p.vy * speed;
        // Лёгкий «ветер».
        p.x += Math.sin(t * 0.3 + p.phase) * 0.02;
        p.y += Math.cos(t * 0.2 + p.phase) * 0.02;

        if (p.x < -2 || p.x > W + 2 || p.y < -2 || p.y > H + 2) {
          // Переиспользуем тот же объект — object pooling без аллокаций.
          p.x = Math.random() < 0.5 ? -1 : W + 1;
          p.y = Math.random() * H;
          p.vx = (Math.random() - 0.5) * 0.15;
          p.vy = (Math.random() - 0.5) * 0.15;
          p.phase = Math.random() * Math.PI * 2;
          continue;
        }

        var pulsed = p.opacity * (0.6 + 0.4 * Math.sin(t * 0.5 + p.phase));
        if (pulsed < 0) pulsed = 0;
        ctx.fillStyle = 'hsla(35, 15%, ' + p.brightness + '%, ' + pulsed + ')';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }

      var self = this;
      this._raf = requestAnimationFrame(function () { self._loop(); });
    },
  };


  function _initAmbient() { AmbientLayer.init(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initAmbient);
  } else {
    _initAmbient();
  }
