// ─────────────────────────────────────────────────────────────────
// ЭТАП 16 — Аквидукт: JS-частицы и подключение к данным
// ─────────────────────────────────────────────────────────────────
// Radial resource widget with particle streams that flow through
// canvas channels. Speed/density/color reflect resource delta.
// Each channel is one resource: gold (up), troops (right),
// food (down), pop (left).
//
// Public API (window.AquaWidget):
//   AquaWidget.init()                           — find canvases, start RAF loop
//   AquaWidget.update({ gold, troops, food, pop,
//                       deltaGold, deltaTroops, deltaFood, deltaPop })
//   AquaWidget.stop()                           — cancel RAF (tests/teardown)
//
// Called from ui/panels.js::updateResourceBar() after the classic
// resource bar is refreshed.
// ─────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const RESOURCES = [
    { id: 'gold',   dir: 'up'    },
    { id: 'troops', dir: 'right' },
    { id: 'food',   dir: 'down'  },
    { id: 'pop',    dir: 'left'  },
  ];

  // Maximum live particles per channel — keeps mobile performance safe.
  const MAX_PARTICLES = 80;

  const AquaWidget = {
    _channels: {},
    _raf: null,
    _lastTs: 0,
    _initialized: false,

    init() {
      if (typeof document === 'undefined') return;
      if (this._initialized) return;

      for (const r of RESOURCES) {
        const canvas = document.querySelector(`#aqua-${r.id} .aqua-stream`);
        if (!canvas || typeof canvas.getContext !== 'function') continue;
        this._channels[r.id] = {
          canvas,
          ctx: canvas.getContext('2d'),
          particles: [],
          delta: 0,
          dir: r.dir,
        };
      }

      if (Object.keys(this._channels).length === 0) return;

      this._initialized = true;
      this._lastTs = 0;
      const loop = (ts) => this._loop(ts);
      this._raf = requestAnimationFrame(loop);
    },

    stop() {
      if (this._raf != null) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      }
      this._initialized = false;
    },

    // Refresh numeric labels + delta badges and update channel speed.
    update(data) {
      if (!data || typeof document === 'undefined') return;

      const vals = {
        gold:   data.gold,
        troops: data.troops,
        food:   data.food,
        pop:    data.pop,
      };
      const deltas = {
        gold:   Number.isFinite(data.deltaGold)   ? data.deltaGold   : 0,
        troops: Number.isFinite(data.deltaTroops) ? data.deltaTroops : 0,
        food:   Number.isFinite(data.deltaFood)   ? data.deltaFood   : 0,
        pop:    Number.isFinite(data.deltaPop)    ? data.deltaPop    : 0,
      };

      for (const id of Object.keys(vals)) {
        const v = vals[id];
        const valEl = document.getElementById(`aq-${id}-val`);
        if (valEl) {
          valEl.textContent = (v != null && Number.isFinite(v))
            ? this._formatNum(v)
            : '—';
        }

        const d = deltas[id];
        const deltaEl = document.getElementById(`aq-${id}-delta`);
        if (deltaEl) {
          if (d > 0)      deltaEl.textContent = '+' + this._formatNum(d);
          else if (d < 0) deltaEl.textContent = this._formatNum(d);
          else            deltaEl.textContent = '';
          deltaEl.className = 'aqua-delta'
            + (d > 0 ? ' positive' : d < 0 ? ' negative' : '');
        }

        const ch = this._channels[id];
        if (ch) ch.delta = d;
      }
    },

    _formatNum(n) {
      const v = Math.round(n);
      const abs = Math.abs(v);
      if (abs >= 1000000) return (v / 1000000).toFixed(1) + 'М';
      if (abs >= 10000)   return Math.round(v / 1000) + 'К';
      return String(v);
    },

    _spawnParticle(ch) {
      const isVertical = (ch.dir === 'up' || ch.dir === 'down');
      const w = ch.canvas.width;
      const h = ch.canvas.height;
      // "from center" means particle starts near the medallion side.
      const fromCenter = (ch.dir === 'up' || ch.dir === 'left');

      const absDelta = Math.abs(ch.delta);
      const baseSpeed = 0.4 + Math.min(3, absDelta * 0.01) + Math.random() * 0.3;

      let color;
      if (ch.delta > 0) {
        color = `rgba(201,169,97,${0.4 + Math.random() * 0.4})`;     // gold
      } else if (ch.delta < 0) {
        color = `rgba(139,32,32,${0.4 + Math.random() * 0.4})`;      // red
      } else {
        color = `rgba(150,135,100,${0.3 + Math.random() * 0.3})`;    // neutral
      }

      return {
        x: isVertical ? w / 2 + (Math.random() - 0.5) * 3 : (fromCenter ? 0 : w),
        y: isVertical ? (fromCenter ? h : 0) : h / 2 + (Math.random() - 0.5) * 3,
        size: 1 + Math.random(),
        speed: baseSpeed, // px per ~16ms frame
        color,
      };
    },

    _loop(ts) {
      if (!this._initialized) return;

      // Frame-rate independent motion scale (1.0 at 60fps).
      let scale = 1;
      if (this._lastTs) {
        const dt = ts - this._lastTs;
        if (dt > 0 && dt < 250) scale = dt / 16.6667;
      }
      this._lastTs = ts;

      for (const id of Object.keys(this._channels)) {
        const ch = this._channels[id];
        const { ctx, canvas, particles, dir } = ch;
        const w = canvas.width;
        const h = canvas.height;
        const isVertical = (dir === 'up' || dir === 'down');

        ctx.clearRect(0, 0, w, h);

        // Spawn rate scales with |delta|; always spawn a baseline trickle.
        const absD = Math.abs(ch.delta);
        const rate = 1 + Math.min(5, absD / 10);
        if (particles.length < MAX_PARTICLES && Math.random() < rate * 0.05 * scale) {
          particles.push(this._spawnParticle(ch));
        }

        // Update + render.
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          if (isVertical) {
            p.y += (dir === 'up' ? -p.speed : p.speed) * scale;
            if (p.y < -2 || p.y > h + 2) { particles.splice(i, 1); continue; }
          } else {
            p.x += (dir === 'right' ? p.speed : -p.speed) * scale;
            if (p.x < -2 || p.x > w + 2) { particles.splice(i, 1); continue; }
          }
          ctx.fillStyle = p.color;
          ctx.fillRect(
            Math.round(p.x - p.size / 2),
            Math.round(p.y - p.size / 2),
            p.size,
            p.size
          );
        }

        // Hard cap to protect against pathological bursts.
        if (particles.length > MAX_PARTICLES) {
          particles.splice(0, particles.length - MAX_PARTICLES);
        }
      }

      this._raf = requestAnimationFrame((t) => this._loop(t));
    },
  };

  if (typeof window !== 'undefined') {
    window.AquaWidget = AquaWidget;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AquaWidget.init());
      } else {
        // Script injected after DOM ready — init on next tick.
        setTimeout(() => AquaWidget.init(), 0);
      }
    }
  }
})();
