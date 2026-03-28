// ══════════════════════════════════════════════════════════════════════
// BATTLE RESULT OVERLAY — анимированный экран результата сражения
//
// Вызывается из combat.js после resolveArmyBattle() если игрок участвует.
// Показывает: флаги наций, потери, командиров, итог (победа/поражение).
// Авто-закрывается через 6 секунд. Клик на оверлей — закрыть немедленно.
// ══════════════════════════════════════════════════════════════════════

let _brTimeout = null;

function showBattleResult(r) {
  const overlay = document.getElementById('battle-result-overlay');
  if (!overlay) return;

  // Очищаем предыдущий таймер автозакрытия
  if (_brTimeout) { clearTimeout(_brTimeout); _brTimeout = null; }

  const playerIsAtk = r.atkName === (GAME_STATE.nations?.[GAME_STATE.player_nation]?.name ?? '');
  const playerWins  = (playerIsAtk && r.atkWins) || (!playerIsAtk && !r.atkWins);

  const winSide  = r.atkWins ? { name: r.atkName,  flag: r.atkFlag,  cas: r.atkCas,  total: r.atkTotal }
                              : { name: r.defName,  flag: r.defFlag,  cas: r.defCas,  total: r.defTotal };
  const loseSide = r.atkWins ? { name: r.defName,  flag: r.defFlag,  cas: r.defCas,  total: r.defTotal }
                              : { name: r.atkName,  flag: r.atkFlag,  cas: r.atkCas,  total: r.atkTotal };

  const marginPct = Math.round((r.margin - 1) * 100);
  const dominance = r.margin >= 2.0 ? 'Разгром' : r.margin >= 1.5 ? 'Убедительная победа' : r.margin >= 1.2 ? 'Победа' : 'Тяжёлая победа';

  const atkCmdStr = r.atkCmd ? `<span class="br-cmd">⚔️ ${r.atkCmd}</span>` : '';
  const defCmdStr = r.defCmd ? `<span class="br-cmd">🛡 ${r.defCmd}</span>` : '';

  const captureBlock = r.capturedRegionName
    ? `<div class="br-capture">🏴 Захвачен регион: <strong>${r.capturedRegionName}</strong></div>`
    : '';

  const resultClass = playerWins ? 'br-victory' : 'br-defeat';
  const resultTitle = playerWins ? '⚔️ ПОБЕДА' : '💀 ПОРАЖЕНИЕ';
  const resultColor = playerWins ? '#ffd700' : '#e53935';

  overlay.innerHTML = `
    <div class="br-box ${resultClass}" onclick="event.stopPropagation()">

      <!-- Шапка: итог -->
      <div class="br-header">
        <div class="br-result-title" style="color:${resultColor}">${resultTitle}</div>
        <div class="br-location">📍 ${r.terrainLabel} · ${r.regionName}</div>
      </div>

      <!-- Основная секция: стороны -->
      <div class="br-sides">

        <!-- Победитель -->
        <div class="br-side br-side--winner">
          <div class="br-flag">${winSide.flag}</div>
          <div class="br-nation-name">${winSide.name}</div>
          ${winSide.name === r.atkName ? atkCmdStr : defCmdStr}
          <div class="br-troops-before">${winSide.total.toLocaleString()} войск</div>
          <div class="br-cas br-cas--green">−${winSide.cas.toLocaleString()} <span class="br-cas-label">потери</span></div>
        </div>

        <!-- Мечи по центру -->
        <div class="br-center">
          <div class="br-swords-wrap">
            <span class="br-sword br-sword--left">⚔</span>
            <span class="br-sword br-sword--right">⚔</span>
          </div>
          <div class="br-dominance">${dominance}</div>
          <div class="br-margin">+${marginPct}%</div>
        </div>

        <!-- Проигравший -->
        <div class="br-side br-side--loser">
          <div class="br-flag">${loseSide.flag}</div>
          <div class="br-nation-name">${loseSide.name}</div>
          ${loseSide.name === r.atkName ? atkCmdStr : defCmdStr}
          <div class="br-troops-before">${loseSide.total.toLocaleString()} войск</div>
          <div class="br-cas br-cas--red">−${loseSide.cas.toLocaleString()} <span class="br-cas-label">потери</span></div>
        </div>
      </div>

      ${captureBlock}

      <!-- Прогресс-бар автозакрытия -->
      <div class="br-footer">
        <div class="br-progress-wrap">
          <div class="br-progress-bar" id="br-progress"></div>
        </div>
        <button class="br-close-btn" onclick="closeBattleResult()">Закрыть ✕</button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';

  // Запустить анимацию прогресс-бара автозакрытия
  requestAnimationFrame(() => {
    const bar = document.getElementById('br-progress');
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      requestAnimationFrame(() => {
        bar.style.transition = 'width 6s linear';
        bar.style.width = '0%';
      });
    }
  });

  _brTimeout = setTimeout(closeBattleResult, 6000);
}

function closeBattleResult() {
  if (_brTimeout) { clearTimeout(_brTimeout); _brTimeout = null; }
  const overlay = document.getElementById('battle-result-overlay');
  if (!overlay) return;
  overlay.classList.add('br-fade-out');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('br-fade-out');
    overlay.innerHTML = '';
  }, 300);
}
