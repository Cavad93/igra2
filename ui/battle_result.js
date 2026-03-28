// ══════════════════════════════════════════════════════════════════════
// BATTLE RESULT — кинематографичная анимация результата битвы
//
// Последовательность:
//   0ms   — оверлей появляется, чёрные кино-полосы закрываются
//   300ms — левая сторона (атакующий) влетает слева
//   500ms — правая сторона (защищающий) влетает справа
//   900ms — «VS» пульсирует
//   1400ms — ВЗРЫВ (Canvas частицы + тряска)
//   1700ms — победитель/проигравший revealed
//   2000ms — счётчик потерь начинает считать
//   2800ms — нижняя полоса с итогом выезжает снизу
//   8000ms — авто-закрытие
// ══════════════════════════════════════════════════════════════════════

let _brTimer       = null;
let _brRafId       = null;
let _brParticles   = [];
let _brCanvas      = null;
let _brCtx         = null;

// ── Частицы ───────────────────────────────────────────────────────────

class _Particle {
  constructor(x, y, type) {
    this.x  = x; this.y = y;
    const a = Math.random() * Math.PI * 2;
    const s = type === 'spark' ? 3 + Math.random() * 10
            : type === 'smoke' ? 0.5 + Math.random() * 2
            :                    1 + Math.random() * 5;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s - (type === 'smoke' ? 1.5 : 2);
    this.life  = 1.0;
    this.decay = type === 'smoke' ? 0.008 + Math.random() * 0.012
               :                   0.018 + Math.random() * 0.025;
    this.size  = type === 'spark' ? 2 + Math.random() * 3
               : type === 'smoke' ? 8 + Math.random() * 18
               :                    3 + Math.random() * 6;
    this.gravity = type === 'smoke' ? -0.04 : 0.12;
    this.type = type;
    const sparks = ['#ff6b00','#ff9500','#ffd700','#ff3300','#ffee00'];
    const bloods = ['#c0392b','#922b21','#e74c3c','#a93226'];
    this.color = type === 'spark' ? sparks[Math.floor(Math.random() * sparks.length)]
               : type === 'smoke' ? `rgba(${80+Math.random()*40|0},${80+Math.random()*30|0},${60+Math.random()*20|0},`
               :                    bloods[Math.floor(Math.random() * bloods.length)];
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.97;
    this.life -= this.decay;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    if (this.type === 'smoke') {
      ctx.globalAlpha = Math.max(0, this.life * 0.25);
      ctx.fillStyle   = this.color + this.life * 0.3 + ')';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (2 - this.life), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.fillStyle   = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur  = this.type === 'spark' ? 6 : 0;
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(0.5, this.size * this.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }
}

function _spawnExplosion(x, y) {
  for (let i = 0; i < 80;  i++) _brParticles.push(new _Particle(x, y, 'spark'));
  for (let i = 0; i < 30;  i++) _brParticles.push(new _Particle(x, y, 'blood'));
  for (let i = 0; i < 25;  i++) _brParticles.push(new _Particle(x, y, 'smoke'));
}

function _particleLoop() {
  if (!_brCanvas || !_brCtx) return;
  _brCtx.clearRect(0, 0, _brCanvas.width, _brCanvas.height);
  _brParticles = _brParticles.filter(p => p.life > 0);
  for (const p of _brParticles) { p.update(); p.draw(_brCtx); }
  if (_brParticles.length > 0) _brRafId = requestAnimationFrame(_particleLoop);
}

// ── Счётчик потерь ────────────────────────────────────────────────────

function _animateCounter(el, target, duration = 1400) {
  let start = null;
  const step = (ts) => {
    if (!start) start = ts;
    const p = Math.min(1, (ts - start) / duration);
    // easeOutExpo
    const ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = '−' + Math.round(target * ease).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Тряска экрана ─────────────────────────────────────────────────────

function _shakeBox(el) {
  el.classList.add('br-shake');
  setTimeout(() => el.classList.remove('br-shake'), 600);
}

// ── Terrain backgrounds ───────────────────────────────────────────────

const _TERRAIN_STYLE = {
  plains:       { bg: 'linear-gradient(180deg,#0d1a0a 0%,#162612 50%,#0a120a 100%)', icon: '🌾' },
  river_valley: { bg: 'linear-gradient(180deg,#0a0d1a 0%,#0d1626 50%,#0a1216 100%)', icon: '🌊' },
  hills:        { bg: 'linear-gradient(180deg,#140f08 0%,#1e1508 50%,#110d07 100%)', icon: '⛰' },
  mountains:    { bg: 'linear-gradient(180deg,#0c0c14 0%,#12121e 50%,#080812 100%)', icon: '🏔' },
  coastal_city: { bg: 'linear-gradient(180deg,#080d1a 0%,#0a1426 50%,#0d1620 100%)', icon: '⚓' },
};

// ── Воины-иконки ──────────────────────────────────────────────────────

function _troopIcons(count) {
  // Показываем до 8 иконок воинов, масштабируя под реальное количество
  const n = Math.min(8, Math.max(1, Math.round(count / 200)));
  return Array(n).fill('🗡').join('');
}

// ── Главная функция ───────────────────────────────────────────────────

function showBattleResult(r) {
  const overlay = document.getElementById('battle-result-overlay');
  if (!overlay) return;

  if (_brTimer)  { clearTimeout(_brTimer);  _brTimer  = null; }
  if (_brRafId)  { cancelAnimationFrame(_brRafId); _brRafId = null; }
  _brParticles = [];

  const playerNatName = GAME_STATE.nations?.[GAME_STATE.player_nation]?.name ?? '';
  const playerWins    = r.atkWins
    ? r.atkName === playerNatName
    : r.defName === playerNatName;

  const terrain = _TERRAIN_STYLE[r.terrain] ?? _TERRAIN_STYLE.plains;

  // Dominance label
  const dominance = r.margin >= 2.5 ? ['💀','Полный разгром']
                  : r.margin >= 1.8 ? ['⚔️','Убедительная победа']
                  : r.margin >= 1.3 ? ['🏆','Победа']
                  :                   ['😤','Тяжёлая победа'];

  const resultLabel = playerWins ? '⚔️  ПОБЕДА' : '💀  ПОРАЖЕНИЕ';
  const resultClass = playerWins ? 'br-victory' : 'br-defeat';

  // Строим DOM
  overlay.innerHTML = `
    <div class="br-cinematic-top" id="br-top-bar"></div>
    <div class="br-cinematic-bot" id="br-bot-bar"></div>

    <div class="br-stage" id="br-stage" style="background:${terrain.bg}">

      <!-- Фоновая сетка-виньетка -->
      <div class="br-vignette"></div>

      <!-- Canvas для частиц -->
      <canvas id="br-canvas" class="br-canvas"></canvas>

      <!-- Кольцо удара -->
      <div class="br-shockwave" id="br-shock"></div>

      <!-- Левая сторона (атакующий) -->
      <div class="br-faction br-faction--left" id="br-left">
        <div class="br-faction-banner" style="border-color:${r.atkWins ? '#ffd700' : '#555'}">
          <div class="br-faction-flag">${r.atkFlag}</div>
          <div class="br-faction-name">${r.atkName}</div>
          ${r.atkCmd ? `<div class="br-faction-cmd">⚔ ${r.atkCmd}</div>` : ''}
          <div class="br-faction-troops">${_troopIcons(r.atkTotal)}</div>
          <div class="br-faction-count">${r.atkTotal.toLocaleString()} воинов</div>
        </div>
        <div class="br-cas-block" id="br-cas-left">
          <span class="br-cas-num" id="br-num-left">−0</span>
          <span class="br-cas-lbl">потери</span>
        </div>
        ${r.atkWins ? '<div class="br-winner-badge" id="br-badge-left">ПОБЕДИТЕЛЬ</div>' : '<div class="br-loser-badge" id="br-badge-left">ОТСТУПАЕТ</div>'}
      </div>

      <!-- Центр -->
      <div class="br-center-zone" id="br-center">
        <div class="br-terrain-label">${terrain.icon} ${r.terrainLabel}</div>
        <div class="br-vs-text" id="br-vs">VS</div>
        <div class="br-dominance-badge" id="br-dom" style="display:none">
          <span>${dominance[0]}</span> ${dominance[1]}
        </div>
      </div>

      <!-- Правая сторона (защищающий) -->
      <div class="br-faction br-faction--right" id="br-right">
        <div class="br-faction-banner" style="border-color:${!r.atkWins ? '#ffd700' : '#555'}">
          <div class="br-faction-flag">${r.defFlag}</div>
          <div class="br-faction-name">${r.defName}</div>
          ${r.defCmd ? `<div class="br-faction-cmd">🛡 ${r.defCmd}</div>` : ''}
          <div class="br-faction-troops">${_troopIcons(r.defTotal)}</div>
          <div class="br-faction-count">${r.defTotal.toLocaleString()} воинов</div>
        </div>
        <div class="br-cas-block" id="br-cas-right">
          <span class="br-cas-num" id="br-num-right">−0</span>
          <span class="br-cas-lbl">потери</span>
        </div>
        ${!r.atkWins ? '<div class="br-winner-badge" id="br-badge-right">ПОБЕДИТЕЛЬ</div>' : '<div class="br-loser-badge" id="br-badge-right">ОТСТУПАЕТ</div>'}
      </div>

      <!-- Нижняя полоса с итогом -->
      <div class="br-result-strip ${resultClass}" id="br-strip">
        <div class="br-result-text">${resultLabel}</div>
        ${r.capturedRegionName ? `<div class="br-captured">🏴 Захвачен: ${r.capturedRegionName}</div>` : ''}
        <div class="br-progress-wrap">
          <div class="br-progress-bar" id="br-prog"></div>
        </div>
        <button class="br-close-btn" onclick="closeBattleResult()">Закрыть ✕</button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';

  // Canvas
  _brCanvas = document.getElementById('br-canvas');
  _brCtx    = _brCanvas ? _brCanvas.getContext('2d') : null;
  const stage = document.getElementById('br-stage');

  function _sizeCanvas() {
    if (!_brCanvas || !stage) return;
    _brCanvas.width  = stage.offsetWidth;
    _brCanvas.height = stage.offsetHeight;
  }
  _sizeCanvas();

  // ── Анимационная последовательность ──────────────────────────────

  // T=0: кино-полосы съезжают
  const topBar = document.getElementById('br-top-bar');
  const botBar = document.getElementById('br-bot-bar');
  requestAnimationFrame(() => {
    if (topBar) topBar.classList.add('br-bar--open');
    if (botBar) botBar.classList.add('br-bar--open');
  });

  // T=300: левая сторона влетает
  setTimeout(() => {
    document.getElementById('br-left')?.classList.add('br-faction--visible');
  }, 300);

  // T=500: правая сторона влетает
  setTimeout(() => {
    document.getElementById('br-right')?.classList.add('br-faction--visible');
  }, 500);

  // T=900: VS пульсирует
  setTimeout(() => {
    document.getElementById('br-vs')?.classList.add('br-vs--pulse');
  }, 900);

  // T=1400: ВЗРЫВ
  setTimeout(() => {
    _sizeCanvas();
    const cx = _brCanvas ? _brCanvas.width  / 2 : 200;
    const cy = _brCanvas ? _brCanvas.height / 2 : 150;
    _spawnExplosion(cx, cy);
    _particleLoop();

    // Shock ring
    const shock = document.getElementById('br-shock');
    if (shock) { shock.classList.add('br-shock--active'); }

    // Тряска
    if (stage) _shakeBox(stage);

    // VS → CLASH текст
    const vs = document.getElementById('br-vs');
    if (vs) { vs.textContent = '💥'; vs.classList.add('br-vs--clash'); }
  }, 1400);

  // T=1700: победитель/проигравший
  setTimeout(() => {
    const leftEl  = document.getElementById('br-left');
    const rightEl = document.getElementById('br-right');
    if (r.atkWins) {
      leftEl?.classList.add('br-faction--winner');
      rightEl?.classList.add('br-faction--loser');
    } else {
      rightEl?.classList.add('br-faction--winner');
      leftEl?.classList.add('br-faction--loser');
    }
    // бейджи появляются
    document.getElementById('br-badge-left')?.classList.add('br-badge--visible');
    document.getElementById('br-badge-right')?.classList.add('br-badge--visible');
  }, 1700);

  // T=2000: счётчики потерь
  setTimeout(() => {
    const numL = document.getElementById('br-num-left');
    const numR = document.getElementById('br-num-right');
    document.getElementById('br-cas-left')?.classList.add('br-cas--visible');
    document.getElementById('br-cas-right')?.classList.add('br-cas--visible');
    if (numL) _animateCounter(numL, r.atkCas);
    if (numR) _animateCounter(numR, r.defCas);

    // dominance badge
    const dom = document.getElementById('br-dom');
    if (dom) { dom.style.display = ''; dom.classList.add('br-dom--visible'); }

    // убираем VS
    const vs = document.getElementById('br-vs');
    if (vs) vs.style.display = 'none';
  }, 2000);

  // T=2800: нижняя полоса + прогресс-бар
  setTimeout(() => {
    const strip = document.getElementById('br-strip');
    if (strip) strip.classList.add('br-strip--visible');

    // Прогресс-бар на 8 сек (с учётом что уже 2.8с прошло)
    requestAnimationFrame(() => {
      const bar = document.getElementById('br-prog');
      if (bar) {
        bar.style.transition = 'none';
        bar.style.width = '100%';
        requestAnimationFrame(() => {
          bar.style.transition = 'width 5.2s linear';
          bar.style.width = '0%';
        });
      }
    });
  }, 2800);

  // T=8000: авто-закрытие
  _brTimer = setTimeout(closeBattleResult, 8000);
}

// ── Закрыть ───────────────────────────────────────────────────────────

function closeBattleResult() {
  if (_brTimer)  { clearTimeout(_brTimer);   _brTimer  = null; }
  if (_brRafId)  { cancelAnimationFrame(_brRafId); _brRafId = null; }
  _brParticles = [];
  _brCanvas = null; _brCtx = null;

  const overlay = document.getElementById('battle-result-overlay');
  if (!overlay || overlay.style.display === 'none') return;
  overlay.classList.add('br-fade-out');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('br-fade-out');
    overlay.innerHTML = '';
  }, 350);
}
