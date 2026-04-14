// ============================================================================
//  arma.md Шаг 57 — Портреты персонажей
//
//  Утилита renderPortrait(char, nationId, sizePx) — единственная точка выдачи
//  <img>-портрета персонажа. Используется во всех четырёх местах отображения:
//
//    1. char-card          — карточка в списке персонажей (48px)
//    2. char-detail        — детальный модал (96px)
//    3. position-slot      — слот должности при дворе (56px)
//    4. advisor-chip       — компактный чип советника (32px)
//
//  Источник пути к JPG — getPortraitForCharacter(char, nationId) из Шага 55
//  (data/culture_groups.js). Файл загружается с детерминированным маппингом,
//  так что один и тот же char.id всегда получает один и тот же портрет.
//
//  Graceful degradation: если .jpg отсутствует на диске, браузер триггерит
//  onerror и мы заменяем src на assets/portraits/placeholder.svg. Ошибка
//  в консоль при этом не попадает повторно (onerror обнуляется).
//
//  Публичное API:
//    renderPortrait(char, nationId, sizePx)    → HTMLImageElement
//    renderPortraitHTML(char, nationId, sizePx, extraClass) → string (для innerHTML)
//
//  Глобально экспортируется как window.renderPortrait / window.renderPortraitHTML.
// ============================================================================

(function () {
  const FALLBACK = 'assets/portraits/placeholder.svg';

  /**
   * Получить {src, filter} портрета.
   *  - Шаг 55: getPortraitForCharacter() возвращает путь к JPG.
   *  - Шаг 72: getPortraitInfoForCharacter() добавляет CSS-фильтр,
   *    детерминированный отдельным хэшем (char.id + '_filter').
   * Если функции недоступны (sandbox / ранняя загрузка), возвращаем fallback.
   */
  function resolvePortraitInfo(char, nationId) {
    if (typeof getPortraitInfoForCharacter === 'function') {
      try {
        const info = getPortraitInfoForCharacter(char, nationId);
        if (info && typeof info.src === 'string') {
          return { src: info.src, filter: info.filter || '' };
        }
      } catch (_) { /* fallthrough */ }
    }
    if (typeof getPortraitForCharacter === 'function') {
      try {
        return { src: getPortraitForCharacter(char, nationId), filter: '' };
      } catch (_) { /* fallthrough */ }
    }
    return { src: FALLBACK, filter: '' };
  }

  /**
   * Backward-совместимая точка: только src.
   */
  function resolvePortraitSrc(char, nationId) {
    return resolvePortraitInfo(char, nationId).src;
  }

  /**
   * HTML-escape для безопасной подстановки в innerHTML.
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Создаёт <img>-элемент с CC0-портретом персонажа.
   * @param {{id?:string, name?:string}} char
   * @param {string} nationId
   * @param {number} sizePx  размер в пикселях (квадрат)
   * @returns {HTMLImageElement}
   */
  function renderPortrait(char, nationId, sizePx) {
    const size = Number.isFinite(sizePx) ? sizePx : 48;
    const { src, filter } = resolvePortraitInfo(char, nationId);

    const img = document.createElement('img');
    img.className = 'char-portrait';
    img.src       = src;
    img.width     = size;
    img.height    = size;
    img.alt       = (char && char.name) ? char.name : '';
    img.loading   = 'lazy';
    img.draggable = false;
    if (filter) img.style.filter = filter;          // Шаг 72

    // Деградация: если JPG не скачан — показать SVG-заглушку без фильтра
    img.onerror = function () {
      img.onerror = null;
      img.src = FALLBACK;
      img.style.filter = '';                        // Шаг 72: убрать фильтр у SVG
    };

    return img;
  }

  /**
   * Строковая версия — для innerHTML. Используется в местах, где HTML
   * собирается шаблонной строкой (ui/panels.js renderCharacterCard,
   * renderAdvisorChip, openAssignModal и т.п.). Возвращает готовый
   * <img>-тег с onerror-фоллбэком.
   *
   * @param {{id?:string, name?:string}} char
   * @param {string} nationId
   * @param {number} sizePx
   * @param {string} [extraClass]   дополнительные классы через пробел
   * @returns {string}
   */
  function renderPortraitHTML(char, nationId, sizePx, extraClass) {
    const size = Number.isFinite(sizePx) ? sizePx : 48;
    const { src, filter } = resolvePortraitInfo(char, nationId);
    const cls  = 'char-portrait' + (extraClass ? ' ' + extraClass : '');
    const alt  = escapeHtml((char && char.name) || '');
    // Шаг 72: CSS-фильтр применяется inline. При onerror фильтр сбрасывается,
    // чтобы SVG-заглушка рендерилась без искажений.
    const styleAttr = filter ? ` style="filter:${escapeHtml(filter)}"` : '';
    return `<img class="${cls}" src="${escapeHtml(src)}" width="${size}" height="${size}" alt="${alt}" loading="lazy" draggable="false"${styleAttr} onerror="this.onerror=null;this.src='${FALLBACK}';this.style.filter='';">`;
  }

  // Экспорт в глобальную область
  if (typeof window !== 'undefined') {
    window.renderPortrait     = renderPortrait;
    window.renderPortraitHTML = renderPortraitHTML;
  }

  // CommonJS-экспорт для Node-тестов
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderPortrait, renderPortraitHTML };
  }
})();
