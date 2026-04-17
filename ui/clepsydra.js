/* clepsydra.js — клепсидра (кнопка конца хода) */

export const Clepsydra = {
  _progress: 0,
  _ready: false,
  _flipping: false,

  get progress() { return this._progress; },
  set progress(v) {
    this._progress = Math.max(0, Math.min(1, v));
    this._update();
  },

  setReady(isReady) {
    this._ready = !!isReady;
    const btn = document.getElementById('end-turn-btn');
    if (btn) btn.classList.toggle('turn-ready', this._ready);
    document.querySelectorAll('.clepsy-water').forEach(el =>
      el.classList.toggle('ready', this._ready)
    );
    const stream = document.getElementById('clepsy-stream');
    if (stream) stream.classList.toggle('ready', this._ready);
  },

  _update() {
    const upperH = Math.round(28 * (1 - this._progress));
    const upperRect = document.getElementById('clip-upper-rect');
    if (upperRect) {
      upperRect.setAttribute('y', String(4 + (28 - upperH)));
      upperRect.setAttribute('height', String(upperH));
    }
    const lowerH = Math.round(28 * this._progress);
    const lowerRect = document.getElementById('clip-lower-rect');
    if (lowerRect) {
      lowerRect.setAttribute('y', String(76 - lowerH));
      lowerRect.setAttribute('height', String(lowerH));
    }
    const stream = document.getElementById('clepsy-stream');
    if (stream) {
      stream.style.opacity = (this._progress > 0 && this._progress < 1) ? '1' : '0';
    }
  },

  flip(onComplete) {
    if (this._flipping) { try { onComplete?.(); } catch (_) {} return; }
    this._flipping = true;
    const btn = document.getElementById('end-turn-btn');
    if (!btn) { this._flipping = false; try { onComplete?.(); } catch (_) {} return; }

    const start = this._progress;
    const t0 = performance.now();
    const dur = 400;

    const drain = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      this.progress = start + (1 - start) * p;
      if (p < 1) {
        requestAnimationFrame(drain);
      } else {
        btn.style.transition = 'transform 0.3s ease-in-out';
        btn.style.transform  = 'rotate(180deg)';
        setTimeout(() => {
          this.progress = 0;
          this.setReady(false);
          btn.style.transform  = '';
          btn.style.transition = '';
          this._flipping = false;
          try { onComplete?.(); } catch (_) {}
        }, 320);
      }
    };
    requestAnimationFrame(drain);
  },
};

// Backward compat
window.Clepsydra = Clepsydra;
try { Clepsydra.progress = 0; } catch (_) {}
