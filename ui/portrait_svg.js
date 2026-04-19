// ============================================================================
//  arma.md Шаг 73 — Процедурный SVG-портрет
//
//  Для персонажей чьи JPG-портреты не загружены (первый запуск, офлайн, малые
//  нации) генерируется уникальный SVG прямо в браузере из char.id. Каждый
//  персонаж получает детерминированное лицо: форма, цвет кожи, цвет волос,
//  борода — всё выбирается seeded-PRNG (mulberry32) из hashCode(char.id).
//
//  Палитры тонов кожи подобраны по культурным группам (Шаг 55).
//
//  Публичное API:
//    generatePortraitSVG(charId, groupId = 'generic', size = 96) → string
//    generatePortraitDataURL(charId, groupId, size)              → string
//
//  Глобально экспортируется как window.generatePortraitSVG /
//  window.generatePortraitDataURL. Для Node-тестов также доступно через
//  module.exports.
// ============================================================================

  // ── Палитры тонов кожи (RGB) по культурным группам Шаг 55 ─────────────
  const SKIN_PALETTES = {
    greek:        [[210,175,120],[195,160,105],[225,190,140]],
    roman:        [[205,170,115],[190,155,100],[220,185,135]],
    egyptian:     [[160,120, 80],[140,100, 60],[175,135, 90]],
    persian:      [[170,130, 85],[155,115, 70],[185,145,100]],
    indian:       [[150,110, 70],[130, 90, 50],[165,125, 85]],
    carthaginian: [[155,115, 75],[140,100, 60],[170,130, 90]],
    celtic:       [[220,185,145],[205,170,130],[235,200,160]],
    east_asian:   [[215,180,140],[200,165,125],[230,195,155]],
    nomadic:      [[185,145, 95],[170,130, 80],[200,160,110]],
    generic:      [[200,165,120],[185,150,105],[215,180,135]],
  };

  // ── Получить seededRNG / hashCode из глобалов или require (Node) ──────
  function getRNGFactory() {
    if (typeof seededRNG === 'function') return seededRNG;
    if (typeof window !== 'undefined' && typeof window.seededRNG === 'function') {
      return window.seededRNG;
    }
    // CommonJS dual-mode (Node-тесты). typeof-guard защищает bare-вызов
    // `require` в браузерной сборке; на ESLint нужен явный disable для
    // самого вызова.
    if (typeof require === 'function') {
      // eslint-disable-next-line no-undef
      try { return require('../js/rng.js').seededRNG; } catch (_) {}
    }
    // Fallback — простой LCG, чтобы генератор всегда работал
    return function (seed) {
      let s = (seed >>> 0) || 1;
      return function () {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
  }

  function getHasher() {
    if (typeof hashCode === 'function') return hashCode;
    if (typeof window !== 'undefined' && typeof window.hashCode === 'function') {
      return window.hashCode;
    }
    if (typeof require === 'function') {
      // eslint-disable-next-line no-undef
      try { return require('../data/culture_groups.js').hashCode; } catch (_) {}
    }
    // Локальный fallback (совместим с hashCode из data/culture_groups.js)
    return function (str) {
      if (str == null) return 0;
      const s = String(str);
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      }
      return Math.abs(h);
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * Сгенерировать детерминированный SVG-портрет для персонажа.
   * @param {string} charId — уникальный id персонажа
   * @param {string} [groupId] — id культурной группы (greek, roman, ...)
   * @param {number} [size]    — размер квадрата в пикселях (default 96)
   * @returns {string} строка SVG
   */
  export function generatePortraitSVG(charId, groupId, size) {
    const gid  = (groupId && SKIN_PALETTES[groupId]) ? groupId : 'generic';
    const sz   = Number.isFinite(size) && size > 0 ? size : 96;
    const hash = getHasher()(charId == null ? '' : charId);
    const rng  = getRNGFactory()(hash);

    // Цвет кожи
    const palette = SKIN_PALETTES[gid];
    const skin    = palette[Math.floor(rng() * palette.length) % palette.length];
    const r = skin[0], g = skin[1], b = skin[2];

    // Форма лица: 0=овал, 1=круглое, 2=вытянутое
    const faceType = Math.floor(rng() * 3);
    const faceRx   = faceType === 0 ? 30 : faceType === 1 ? 33 : 27;
    const faceRy   = faceType === 0 ? 38 : faceType === 1 ? 34 : 42;

    // Цвет волос
    const hairH    = Math.floor(rng() * 60);          // 0-59 — тёплые оттенки
    const hairL    = Math.floor(10 + rng() * 35);     // 10-44% светлости
    const hairColor= 'hsl(' + hairH + ',40%,' + hairL + '%)';

    // Борода (только у части персонажей)
    const hasBeard = rng() > 0.55;

    // Цвет фона — немного темнее кожи
    const bgR = clamp(r - 40, 0, 255);
    const bgG = clamp(g - 40, 0, 255);
    const bgB = clamp(b - 40, 0, 255);

    // Цвет плеч
    const shR = clamp(r - 30, 0, 255);
    const shG = clamp(g - 30, 0, 255);
    const shB = clamp(b - 30, 0, 255);

    // Цвет рта — темнее кожи
    const mR = clamp(r - 40, 0, 255);
    const mG = clamp(g - 50, 0, 255);
    const mB = clamp(b - 40, 0, 255);

    // Верхняя точка волос — подстраивается под форму лица
    const hairCy = 30 - faceRy + 10; // может быть отрицательным — это нормально
    const hairRx = faceRx + 4;
    const hairRy = 20;

    const beardSvg = hasBeard
      ? '<ellipse cx="48" cy="' + (68 + faceRy - 10) + '" rx="' + (faceRx - 6) +
        '" ry="10" fill="' + hairColor + '" opacity="0.7"/>'
      : '';

    const mouthY1 = 52 + faceRy * 0.15;
    const mouthY2 = 56 + faceRy * 0.15;

    return '<svg xmlns="http://www.w3.org/2000/svg" ' +
      'width="' + sz + '" height="' + sz + '" viewBox="0 0 96 96">' +
      // Фон
      '<rect width="96" height="96" rx="6" fill="rgb(' + bgR + ',' + bgG + ',' + bgB + ')"/>' +
      // Плечи
      '<ellipse cx="48" cy="90" rx="36" ry="20" fill="rgb(' + shR + ',' + shG + ',' + shB + ')"/>' +
      // Волосы
      '<ellipse cx="48" cy="' + hairCy + '" rx="' + hairRx + '" ry="' + hairRy + '" fill="' + hairColor + '"/>' +
      // Лицо
      '<ellipse cx="48" cy="45" rx="' + faceRx + '" ry="' + faceRy + '" fill="rgb(' + r + ',' + g + ',' + b + ')"/>' +
      // Глаза
      '<ellipse cx="' + (48 - faceRx * 0.35) + '" cy="38" rx="4" ry="3" fill="#1a1008"/>' +
      '<ellipse cx="' + (48 + faceRx * 0.35) + '" cy="38" rx="4" ry="3" fill="#1a1008"/>' +
      // Рот
      '<path d="M' + (48 - 8) + ',' + mouthY1 +
        ' Q48,' + mouthY2 + ' ' + (48 + 8) + ',' + mouthY1 + '" ' +
        'stroke="rgb(' + mR + ',' + mG + ',' + mB + ')" stroke-width="1.5" fill="none"/>' +
      beardSvg +
      '</svg>';
  }

  /**
   * Сгенерировать data:URL SVG-портрета — удобно для <img src=...>.
   * @param {string} charId
   * @param {string} [groupId]
   * @param {number} [size]
   * @returns {string}
   */
  export function generatePortraitDataURL(charId, groupId, size) {
    const svg = generatePortraitSVG(charId, groupId, size);
    // Кодируем UTF-8 + процентами, чтобы работать с кириллицей и `#`, `&`.
    const enc = encodeURIComponent(svg)
      .replace(/'/g, '%27').replace(/"/g, '%22');
    return 'data:image/svg+xml;charset=utf-8,' + enc;
  }

