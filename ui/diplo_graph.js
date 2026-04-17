// ══════════════════════════════════════════════════════════════════════════════
// Шаг 49 (arma.md) — Граф дипломатических отношений
// ══════════════════════════════════════════════════════════════════════════════
// Fullscreen-оверлей с визуализацией всех активных наций и связей между ними:
//   • нации расставляются равномерно по кругу
//   • линии окрашиваются по типу отношений:
//       – войны                 → красные, толщина 3px
//       – военные союзы         → зелёные, толщина 2px
//       – торговые договоры     → синие пунктиры
//       – мирные договоры       → серые линии
//   • клик на нации открывает дипломатическую панель для переговоров
//   • Esc закрывает оверлей (через window.closeTopModal)
// ══════════════════════════════════════════════════════════════════════════════


  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ─────────────────────────────────────────────────────────────
  // Тип отношения между парой наций. Более «сильные» типы
  // приоритетнее при рендере (чтобы не затерялись).
  // ─────────────────────────────────────────────────────────────
  // 0 — ничего, 1 — мирный, 2 — торговый, 3 — союз, 4 — война
  const REL_NONE     = 0;
  const REL_PEACE    = 1;
  const REL_TRADE    = 2;
  const REL_ALLIANCE = 3;
  const REL_WAR      = 4;

  function _classify(type) {
    // Типы из engine/diplomacy.js → категории графа
    switch (type) {
      case 'military_alliance':
      case 'defensive_alliance':
      case 'marriage_alliance':
        return REL_ALLIANCE;
      case 'trade_agreement':
        return REL_TRADE;
      case 'peace_treaty':
      case 'non_aggression':
      case 'armistice':
        return REL_PEACE;
      default:
        return REL_NONE;
    }
  }

  function _edgeStyle(category) {
    // Возвращает {stroke, width, dash, label}
    switch (category) {
      case REL_WAR:
        return { stroke: '#d93b3b', width: 3, dash: null,  label: 'Война' };
      case REL_ALLIANCE:
        return { stroke: '#2fa24a', width: 2, dash: null,  label: 'Союз' };
      case REL_TRADE:
        return { stroke: '#3a86ff', width: 2, dash: '6 4', label: 'Торговый договор' };
      case REL_PEACE:
        return { stroke: '#9a9a9a', width: 1.5, dash: null, label: 'Мирный договор' };
      default:
        return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Построение списка рёбер по текущему состоянию игры
  // ─────────────────────────────────────────────────────────────
  function _collectEdges(nationIds) {
    const idx = new Map();
    for (let i = 0; i < nationIds.length; i++) idx.set(nationIds[i], i);

    // key "a|b" → строго отсортированный порядок id
    const best = new Map();
    function _put(a, b, cat) {
      if (a === b) return;
      if (!idx.has(a) || !idx.has(b)) return;
      const k = a < b ? a + '|' + b : b + '|' + a;
      const prev = best.get(k) ?? REL_NONE;
      if (cat > prev) best.set(k, cat);
    }

    const ns = (window.GAME_STATE && window.GAME_STATE.nations) || {};

    // 1) Войны — берём из getRelation(a,b).war. Для производительности
    //    обходим только ациклические пары.
    const getRel = typeof window.getRelation === 'function' ? window.getRelation : null;
    if (getRel) {
      for (let i = 0; i < nationIds.length; i++) {
        for (let j = i + 1; j < nationIds.length; j++) {
          let rel = null;
          try { rel = getRel(nationIds[i], nationIds[j]); } catch (_) {}
          if (rel && rel.war) _put(nationIds[i], nationIds[j], REL_WAR);
        }
      }
    }

    // 2) Договоры — сканируем treaties.
    const treaties = (window.GAME_STATE && window.GAME_STATE.diplomacy && window.GAME_STATE.diplomacy.treaties) || [];
    for (const t of treaties) {
      if (!t || t.status !== 'active') continue;
      const parties = t.parties || [];
      if (parties.length < 2) continue;
      const cat = _classify(t.type);
      if (cat === REL_NONE) continue;
      for (let i = 0; i < parties.length; i++) {
        for (let j = i + 1; j < parties.length; j++) {
          _put(parties[i], parties[j], cat);
        }
      }
    }

    const edges = [];
    best.forEach((cat, k) => {
      const [a, b] = k.split('|');
      edges.push({ a, b, category: cat });
    });
    return edges;
  }

  // ─────────────────────────────────────────────────────────────
  // Отрисовка графа в SVG
  // ─────────────────────────────────────────────────────────────
  export function renderDiploGraph() {
    const overlay = document.getElementById('diplo-graph-overlay');
    const svg     = document.getElementById('diplo-graph-svg');
    if (!overlay || !svg) return;

    // Очистка
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const ns = (window.GAME_STATE && window.GAME_STATE.nations) || {};
    // Активные нации: есть объект и хотя бы одно поле; игрок всегда первый.
    const nationIds = Object.keys(ns).filter(id => ns[id] && ns[id].name);
    // Стабильный порядок: игрок первым, далее — по имени
    const playerId = window.GAME_STATE && window.GAME_STATE.player_nation;
    nationIds.sort((a, b) => {
      if (a === playerId) return -1;
      if (b === playerId) return  1;
      return (ns[a].name || '').localeCompare(ns[b].name || '');
    });

    const total = nationIds.length;
    if (!total) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', '50%');
      t.setAttribute('y', '50%');
      t.setAttribute('fill', '#c8aa64');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '18');
      t.textContent = 'Нет активных наций';
      svg.appendChild(t);
      return;
    }

    // viewBox задаётся под размер overlay
    const W = overlay.clientWidth  || 1000;
    const H = overlay.clientHeight || 700;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width',   W);
    svg.setAttribute('height',  H);

    const cx = W / 2;
    const cy = H / 2;
    const r  = Math.max(140, Math.min(W, H) / 2 - 120);

    // Подсчёт позиций
    const positions = new Map();
    for (let i = 0; i < total; i++) {
      const angle = (i / total) * 2 * Math.PI - Math.PI / 2; // старт сверху
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      positions.set(nationIds[i], { x, y, angle });
    }

    // ── Рёбра ──
    const gEdges = document.createElementNS(SVG_NS, 'g');
    gEdges.setAttribute('class', 'dg-edges');
    svg.appendChild(gEdges);

    const edges = _collectEdges(nationIds);
    for (const e of edges) {
      const pa = positions.get(e.a);
      const pb = positions.get(e.b);
      if (!pa || !pb) continue;
      const style = _edgeStyle(e.category);
      if (!style) continue;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', pa.x);
      line.setAttribute('y1', pa.y);
      line.setAttribute('x2', pb.x);
      line.setAttribute('y2', pb.y);
      line.setAttribute('stroke', style.stroke);
      line.setAttribute('stroke-width', String(style.width));
      line.setAttribute('stroke-linecap', 'round');
      if (style.dash) line.setAttribute('stroke-dasharray', style.dash);
      line.setAttribute('data-a', e.a);
      line.setAttribute('data-b', e.b);
      line.setAttribute('data-category', String(e.category));
      gEdges.appendChild(line);
    }

    // ── Узлы ──
    const gNodes = document.createElementNS(SVG_NS, 'g');
    gNodes.setAttribute('class', 'dg-nodes');
    svg.appendChild(gNodes);

    for (const id of nationIds) {
      const pos = positions.get(id);
      const n   = ns[id];
      if (!pos || !n) continue;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'dg-node' + (id === playerId ? ' dg-node-player' : ''));
      g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
      g.setAttribute('data-nation-id', id);
      g.style.cursor = 'pointer';
      g.addEventListener('click', function () { onDiploGraphNodeClick(id); });

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', '18');
      circle.setAttribute('fill', n.color || '#888');
      circle.setAttribute('stroke', id === playerId ? '#ffdf6f' : '#0d0a05');
      circle.setAttribute('stroke-width', id === playerId ? '3' : '2');
      g.appendChild(circle);

      // Имя — размещаем снаружи круга, вдоль радиуса
      const lx = 26 * Math.cos(pos.angle);
      const ly = 26 * Math.sin(pos.angle);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', lx);
      text.setAttribute('y', ly + 4);
      text.setAttribute('fill', '#e8d9a6');
      text.setAttribute('font-size', '13');
      text.setAttribute('font-family', 'serif');
      text.setAttribute('paint-order', 'stroke');
      text.setAttribute('stroke', 'rgba(13,10,5,0.95)');
      text.setAttribute('stroke-width', '3');
      // Разворачиваем текст так, чтобы он уходил от центра
      text.setAttribute('text-anchor', (pos.angle > Math.PI / 2 || pos.angle < -Math.PI / 2) ? 'end' : 'start');
      text.textContent = n.name || id;
      g.appendChild(text);

      gNodes.appendChild(g);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Обработчик клика на узле — открыть дипломатическую панель
  // ─────────────────────────────────────────────────────────────
  export function onDiploGraphNodeClick(nationId) {
    const playerId = window.GAME_STATE && window.GAME_STATE.player_nation;
    if (!nationId || nationId === playerId) return;
    // Закрываем граф перед открытием дипломатической панели
    closeDiploGraph();
    if (typeof window.showDiplomacyOverlay === 'function') {
      try { window.showDiplomacyOverlay(nationId); return; } catch (_) {}
    }
    if (typeof window.renderLeftPanelTab === 'function') {
      try { window.renderLeftPanelTab('diplomacy'); } catch (_) {}
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Открыть / закрыть / переключить
  // ─────────────────────────────────────────────────────────────
  export function openDiploGraph() {
    const overlay = document.getElementById('diplo-graph-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    // Дожидаемся layout, чтобы corrsectly прочитать clientWidth/Height
    requestAnimationFrame(() => renderDiploGraph());
  }

  export function closeDiploGraph() {
    const overlay = document.getElementById('diplo-graph-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  }

  export function toggleDiploGraph() {
    const overlay = document.getElementById('diplo-graph-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('hidden')) openDiploGraph();
    else closeDiploGraph();
  }

  export function isDiploGraphOpen() {
    const overlay = document.getElementById('diplo-graph-overlay');
    return !!(overlay && !overlay.classList.contains('hidden'));
  }

  // Экспорт
  window.renderDiploGraph     = renderDiploGraph;
  window.openDiploGraph       = openDiploGraph;
  window.closeDiploGraph      = closeDiploGraph;
  window.toggleDiploGraph     = toggleDiploGraph;
  window.isDiploGraphOpen     = isDiploGraphOpen;
  window.onDiploGraphNodeClick = onDiploGraphNodeClick;

