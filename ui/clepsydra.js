/* clepsydra.js — Rota Historiae (маховик истории), кнопка конца хода.
   Имя модуля оставлено для обратной совместимости с engine/turn.js и
   ui/turn_progress.js, которые зовут window.Clepsydra.{progress,setReady,flip}.
   Внутри — колесо со стрелкой-указателем и дугой прогресса. */

export const Clepsydra = {
  _progress: 0,
  _ready: false,
  _flipping: false,
  _rot: 0,   // накопленный поворот диска в градусах

  get progress() { return this._progress; },
  set progress(v) {
    this._progress = Math.max(0, Math.min(1, v));
    this._update();
  },

  setReady(isReady) {
    this._ready = !!isReady;
    const btn = document.getElementById('end-turn-btn');
    if (btn) btn.classList.toggle('turn-ready', this._ready);
  },

  _update() {
    // Дуга прогресса: pathLength=100, offset=100 → невидима, offset=0 → полная окружность.
    const arc = document.getElementById('rh-progress');
    if (arc) arc.setAttribute('stroke-dashoffset', String(100 - 100 * this._progress));
  },

  flip(onComplete) {
    if (this._flipping) { try { onComplete?.(); } catch (_) {} return; }
    const btn  = document.getElementById('end-turn-btn');
    const disc = document.getElementById('rh-disc');
    if (!btn || !disc) { try { onComplete?.(); } catch (_) {} return; }

    this._flipping = true;
    btn.classList.add('rh-flipping');

    // Один полный оборот + 30° (символ «прошёл месяц»).
    this._rot += 390;
    disc.style.transformOrigin = '40px 40px';
    disc.style.transform = `rotate(${this._rot}deg)`;

    setTimeout(() => {
      btn.classList.remove('rh-flipping');
      this.progress = 0;
      this.setReady(false);
      this._flipping = false;
      try { onComplete?.(); } catch (_) {}
    }, 720);
  },
};

// Инициализация начального состояния
try { Clepsydra.progress = 0; } catch (_) {}
