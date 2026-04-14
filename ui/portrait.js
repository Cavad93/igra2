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
   * Получить src портрета через getPortraitForCharacter из Шага 55.
   * Если функция недоступна (sandbox / ранняя загрузка), возвращает fallback.
   */
  function resolvePortraitSrc(char, nationId) {
    if (typeof getPortraitForCharacter === 'function') {
      try {
        return getPortraitForCharacter(char, nationId);
      } catch (_) {
        return FALLBACK;
      }
    }
    return FALLBACK;
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
    const src  = resolvePortraitSrc(char, nationId);

    const img = document.createElement('img');
    img.className = 'char-portrait';
    img.src       = src;
    img.width     = size;
    img.height    = size;
    img.alt       = (char && char.name) ? char.name : '';
    img.loading   = 'lazy';
    img.draggable = false;

    // Деградация: если JPG не скачан — показать SVG-заглушку
    img.onerror = function () {
      // Обнуляем onerror чтобы избежать бесконечного цикла, если и SVG
      // недоступен.
      img.onerror = null;
      img.src = FALLBACK;
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
    const src  = resolvePortraitSrc(char, nationId);
    const cls  = 'char-portrait' + (extraClass ? ' ' + extraClass : '');
    const alt  = escapeHtml((char && char.name) || '');
    return `<img class="${cls}" src="${escapeHtml(src)}" width="${size}" height="${size}" alt="${alt}" loading="lazy" draggable="false" onerror="this.onerror=null;this.src='${FALLBACK}';">`;
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
