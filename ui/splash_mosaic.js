/* splash_mosaic.js — анимированная мозаика на экране загрузки */

  // ══════════════════════════════════════════════════
  // uisuper ЭТАП 8 — МОЗАИКА ЗАГРУЗКИ (JS-анимация)
  // Тессеры 6×6px с 1px зазором заполняют Canvas по
  // мере роста прогресса загрузки. Каждая тессера
  // сэмплирует цвет пикселя из фоновой фрески, поэтому
  // по мере загрузки картина проявляется «из кусочков».
  // Если изображение недоступно (404/CORS на file://) —
  // fallback к стилизованному силуэту Сицилии.
  // ══════════════════════════════════════════════════
  export const SplashMosaic = {
    canvas: null,
    ctx: null,
    tiles: [],          // все тессеры в случайном порядке
    revealed: 0,        // сколько открыто
    total: 0,
    TILE: 7,            // размер тессеры (6px + 1px зазор)
    cols: 0,
    rows: 0,
    imgData: null,      // ImageData фрески, перемасштабированной под окно
    imgLoaded: false,   // флаг: true когда цвета сэмплированы

    // Длительность автосборки мозаики (мс). Тессеры открываются
    // по времени, независимо от реальной скорости загрузки игры —
    // чтобы эффект сборки был визуально заметен (uisuper Этап 8 fix).
    DURATION_MS: 20000,
    _animStart: 0,
    _animating: false,

    // Примерный силуэт Сицилии как набор относительных координат
    // (col_ratio, row_ratio) — нормализованные от 0 до 1
    // Используется только в fallback-режиме (если фреска не загрузилась)
    SICILY_MASK: [
      // центр и правая часть острова
      [0.35,0.35],[0.38,0.32],[0.42,0.30],[0.46,0.29],[0.50,0.28],
      [0.54,0.29],[0.58,0.30],[0.62,0.32],[0.65,0.35],[0.67,0.38],
      [0.66,0.42],[0.63,0.45],[0.60,0.47],[0.56,0.48],[0.52,0.48],
      [0.48,0.47],[0.44,0.46],[0.40,0.44],[0.37,0.41],[0.35,0.38],
      // заполнение центра
      [0.40,0.35],[0.44,0.33],[0.48,0.32],[0.52,0.32],[0.56,0.33],
      [0.60,0.35],[0.62,0.38],[0.61,0.41],[0.58,0.43],[0.54,0.44],
      [0.50,0.44],[0.46,0.43],[0.42,0.41],[0.40,0.38],
      // Мессина (северо-восток)
      [0.68,0.30],[0.70,0.27],[0.69,0.24],
      // Сиракузы (юго-восток)
      [0.65,0.48],[0.67,0.51],[0.65,0.53],
      // западная оконечность
      [0.32,0.37],[0.30,0.39],[0.31,0.42],
    ],

    init() {
      this.canvas = document.getElementById('splash-mosaic');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this._resize();
      this._buildTiles();
      this._render();
      this._onResize = () => {
        if (!this.canvas || !this.canvas.isConnected) return;
        this._resize();
        // Пересэмплируем фреску под новый размер окна
        if (this._srcImage && this._srcImage.complete && this._srcImage.naturalWidth) {
          this._sampleImage(this._srcImage);
        }
        this._buildTiles();
        this._render();
      };
      window.addEventListener('resize', this._onResize);
      // Асинхронно грузим фреску — пока не загружена, тессеры
      // отрисовываются fallback-цветами (силуэт Сицилии).
      // Путь фрески тот же, что использует ui/splash.js.
      this.loadImage('assets/backgrounds/splash_pompeii.jpg');
      // Стартуем автоматическую сборку по таймеру (≈20с).
      this.startAutoAnimate();
    },

    /**
     * Запускает автоматическое открытие тессер по времени.
     * Прогресс линейно растёт от 0 до 1 за DURATION_MS, независимо
     * от реального прогресса загрузки игры — чтобы эффект сборки
     * мозаики был заметен даже при быстрой инициализации.
     */
    startAutoAnimate(durationMs) {
      if (this._animating) return;
      if (typeof durationMs === 'number' && durationMs > 0) {
        this.DURATION_MS = durationMs;
      }
      this._animating = true;
      this._animStart = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      const tick = () => {
        if (!this._animating) return;
        if (!this.canvas || !this.canvas.isConnected) {
          this._animating = false;
          return;
        }
        const now = (typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now();
        const p = Math.min(1, (now - this._animStart) / this.DURATION_MS);
        this.setProgress(p);
        if (p < 1) {
          (typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(tick)
            : setTimeout(tick, 33));
        } else {
          this._animating = false;
        }
      };
      (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(tick)
        : setTimeout(tick, 33));
    },

    /**
     * true если все тессеры открыты (мозаика полностью собрана).
     */
    isComplete() {
      return this.total > 0 && this.revealed >= this.total;
    },

    /**
     * Загружает изображение фрески и сэмплирует цвета для тессер.
     * Скрывает .splash__bg чтобы фреска не просвечивала между тессерами.
     */
    loadImage(url) {
      if (!url) return;
      const img = new Image();
      // crossOrigin не используем — фреска должна быть same-origin.
      // При file:// браузер может пометить canvas как tainted; в таком
      // случае _sampleImage ловит SecurityError и мы остаёмся на fallback.
      img.onload = () => {
        this._srcImage = img;
        this._sampleImage(img);
        if (this.imgLoaded) {
          // Перекрашиваем уже построенные тессеры под цвета фрески
          this._paintTilesFromImage();
          this._render();
          // Скрываем raw-фреску, чтобы незаполненные тессеры
          // оставались чёрными и картина «проявлялась».
          const bg = document.querySelector('.splash__bg');
          if (bg) bg.style.display = 'none';
        }
      };
      img.onerror = () => {
        // Фреска не скачана — молча остаёмся на fallback-цветах.
        this.imgLoaded = false;
      };
      img.src = url;
    },

    /**
     * Рисует изображение на offscreen-canvas размером с окно
     * (с cover-пропорциями) и считывает ImageData.
     */
    _sampleImage(img) {
      try {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const off = document.createElement('canvas');
        off.width = W;
        off.height = H;
        const octx = off.getContext('2d');
        // cover-fit: масштабируем так, чтобы изображение покрыло весь canvas
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (!iw || !ih) { this.imgLoaded = false; return; }
        const scale = Math.max(W / iw, H / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        octx.fillStyle = '#080603';
        octx.fillRect(0, 0, W, H);
        octx.drawImage(img, dx, dy, dw, dh);
        this.imgData = octx.getImageData(0, 0, W, H);
        this.imgLoaded = true;
      } catch (e) {
        // getImageData бросит SecurityError на tainted canvas (например file://)
        console.warn('[SplashMosaic] image sample failed, falling back:', e.message);
        this.imgData = null;
        this.imgLoaded = false;
      }
    },

    /**
     * Заполняет tile.color сэмплом пикселя из ImageData.
     */
    _paintTilesFromImage() {
      if (!this.imgData) return;
      const data = this.imgData.data;
      const W = this.imgData.width;
      const S = this.TILE - 1;
      const half = Math.floor(S / 2);
      for (const t of this.tiles) {
        const px = Math.min(W - 1, t.x + half);
        const py = Math.min(this.imgData.height - 1, t.y + half);
        const idx = (py * W + px) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Лёгкий «античный» тон: небольшая сепия + затемнение,
        // чтобы цвета сочетались с палитрой «Римский базальт».
        const rr = Math.round(r * 0.85 + 20);
        const gg = Math.round(g * 0.78 + 10);
        const bb = Math.round(b * 0.62);
        t.color = `rgb(${rr},${gg},${bb})`;
      }
    },

    _resize() {
      this.canvas.width  = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.cols = Math.ceil(this.canvas.width  / this.TILE);
      this.rows = Math.ceil(this.canvas.height / this.TILE);
    },

    _buildTiles() {
      const arr = [];
      const prevRevealedRatio = this.total > 0 ? (this.revealed / this.total) : 0;

      // Fallback-маска острова (используется когда фреска не загрузилась)
      const islandSet = new Set();
      for (const [cr, rr] of this.SICILY_MASK) {
        const cc = Math.round(cr * this.cols);
        const rc = Math.round(rr * this.rows);
        for (let dc = -3; dc <= 3; dc++) {
          for (let dr = -3; dr <= 3; dr++) {
            if (dc*dc + dr*dr <= 12) {
              islandSet.add(`${cc+dc},${rc+dr}`);
            }
          }
        }
      }

      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          arr.push({
            x: c * this.TILE,
            y: r * this.TILE,
            island: islandSet.has(`${c},${r}`),
            shade: Math.random(),
            color: null,   // заполнится в _paintTilesFromImage если фреска готова
            visible: false,
          });
        }
      }

      // Перемешать случайно (Fisher–Yates)
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }

      this.tiles = arr;
      this.total = arr.length;
      // Если фреска уже загружена — сразу сэмплируем цвета для новых тессер
      if (this.imgLoaded) this._paintTilesFromImage();
      // Сохраняем достигнутый прогресс после resize
      this.revealed = 0;
      if (prevRevealedRatio > 0) {
        const keep = Math.floor(prevRevealedRatio * this.total);
        for (let i = 0; i < keep && i < this.total; i++) {
          this.tiles[i].visible = true;
        }
        this.revealed = keep;
      }
    },

    // progress: 0..1
    setProgress(p) {
      if (!this.canvas) return;
      const clamped = Math.max(0, Math.min(1, p));
      const target = Math.floor(clamped * this.total);
      while (this.revealed < target && this.revealed < this.total) {
        this.tiles[this.revealed].visible = true;
        this.revealed++;
      }
      this._render();
    },

    _render() {
      const ctx = this.ctx;
      if (!ctx) return;
      const S = this.TILE - 1; // размер тессеры без зазора
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (const t of this.tiles) {
        if (!t.visible) continue;
        if (t.color) {
          // Цвет из фрески (основной режим — картина собирается из кусочков)
          ctx.fillStyle = t.color;
        } else if (t.island) {
          // Fallback: тессеры острова — тёплый тёмный камень с золотым оттенком
          ctx.fillStyle = `hsl(35, 20%, ${8 + t.shade * 4}%)`;
        } else {
          // Fallback: морские тессеры — тёмный базальт, почти чёрный
          ctx.fillStyle = `hsl(210, 25%, ${4 + t.shade * 3}%)`;
        }
        ctx.fillRect(t.x, t.y, S, S);
      }
    },
  };

