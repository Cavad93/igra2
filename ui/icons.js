// ui/icons.js
// SVG-глифарий в стиле «монетный штамп».
// Все иконки: viewBox="0 0 20 20", stroke="currentColor",
// stroke-width="1.5", fill="none", stroke-linecap="round"
//
// Файл подключается в index.html как обычный скрипт (см. блок ui/*).
// Также экспортирует ICONS и icon() как ES-модуль — тогда в браузерной
// консоли можно:  const m = await import('./ui/icons.js'); m.icon('gold');
// А из глобальной области (в других ui/*.js, стадия 6) доступно как
// window.ICONS и window.icon().

export const ICONS = {

  // ── РЕСУРСЫ ──

  gold: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="7"/>
    <text x="10" y="14" text-anchor="middle"
      font-size="9" stroke="none" fill="currentColor"
      font-family="serif" font-weight="bold">Ⓐ</text>
  </svg>`,
  // Профиль правителя на монете (как денарий Агафокла)

  troops: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3 L13 8 L18 8 L14 11 L16 17 L10 13 L4 17 L6 11 L2 8 L7 8 Z"/>
  </svg>`,
  // Орёл легиона

  food: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 17 L10 8"/>
    <path d="M6 12 C6 8 14 8 14 12"/>
    <path d="M7 8 L7 5 M10 8 L10 4 M13 8 L13 5"/>
  </svg>`,
  // Сноп пшеницы

  population: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="6" r="3"/>
    <path d="M4 18 C4 13 16 13 16 18"/>
    <path d="M14 4 L16 4 L16 10"/>
  </svg>`,
  // Человек у колонны

  // ── НАВИГАЦИЯ ──

  overview: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="6" height="6" rx="1"/>
    <rect x="11" y="3" width="6" height="6" rx="1"/>
    <rect x="3" y="11" width="6" height="6" rx="1"/>
    <rect x="11" y="11" width="6" height="6" rx="1"/>
  </svg>`,
  // Обзор нации (сетка)

  army: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 16 L10 4 L16 16"/>
    <path d="M7 11 L13 11"/>
    <path d="M3 8 L5 8 M15 8 L17 8"/>
  </svg>`,
  // Щит легионера

  economy: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M10 6 L10 7 M10 13 L10 14"/>
    <path d="M8 8.5 C8 7.5 12 7.5 12 9 C12 10.5 8 10.5 8 12 C8 13.5 12 13.5 12 12.5"/>
  </svg>`,
  // Монета с чертой

  diplomacy: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3 C6 3 3 6 3 10 C3 13 5 16 8 17"/>
    <path d="M10 3 C14 3 17 6 17 10 C17 13 15 16 12 17"/>
    <path d="M7 14 L13 14 L11 17 L9 17 Z"/>
  </svg>`,
  // Оливковая ветвь

  laws: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3 L7 17"/>
    <path d="M7 3 C7 3 12 3 13 6 C14 9 7 9 7 9"/>
    <path d="M7 9 C7 9 13 9 14 12 C15 15 7 17 7 17"/>
  </svg>`,
  // Свиток

  diplo_graph: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="2"/>
    <circle cx="4" cy="5" r="1.5"/>
    <circle cx="16" cy="5" r="1.5"/>
    <circle cx="4" cy="15" r="1.5"/>
    <circle cx="16" cy="15" r="1.5"/>
    <path d="M10 8 L5 6 M10 8 L15 6 M10 12 L5 14 M10 12 L15 14"/>
    <path d="M5.5 6.5 L14.5 6.5 M5.5 13.5 L14.5 13.5 M5 7 L5 13 M15 7 L15 13"/>
  </svg>`,
  // Граф связей

  // ── ДЕЙСТВИЯ ──

  search: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="9" r="5"/>
    <path d="M13 13 L17 17"/>
  </svg>`,

  settings: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="3"/>
    <path d="M10 3 L10 5 M10 15 L10 17 M3 10 L5 10 M15 10 L17 10
             M5.6 5.6 L7 7 M13 13 L14.4 14.4 M14.4 5.6 L13 7 M7 13 L5.6 14.4"/>
  </svg>`,

  end_turn: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 4 A6 6 0 1 1 4 10"/>
    <path d="M4 6 L4 10 L8 10"/>
  </svg>`,
  // Песочные часы/цикл

  orders: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 6 L15 6 M5 10 L13 10 M5 14 L11 14"/>
    <path d="M17 12 L15 16 L13 14"/>
  </svg>`,
  // Список с галочкой

  court: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17 L3 8 L10 3 L17 8 L17 17"/>
    <rect x="7" y="11" width="6" height="6"/>
    <path d="M3 8 L17 8"/>
  </svg>`,
  // Храм/дворец

  chronicle: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3 L6 17 Q6 18 7 18 L16 18 Q17 18 17 17 L17 3 Q17 2 16 2 L7 2 Q6 2 6 3Z"/>
    <path d="M6 5 Q4 5 4 7 L4 17 Q4 18 5 18"/>
    <path d="M9 7 L14 7 M9 10 L14 10 M9 13 L12 13"/>
  </svg>`,
  // Книга-кодекс

  warning: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3 L18 17 L2 17 Z"/>
    <path d="M10 9 L10 12 M10 14.5 L10 15"/>
  </svg>`,

  save: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 3 L4 17 L16 17 L16 7 L12 3 Z"/>
    <path d="M12 3 L12 8 L7 8 L7 3"/>
    <rect x="6" y="12" width="8" height="5"/>
  </svg>`,

  ai: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="6" width="12" height="9" rx="2"/>
    <path d="M8 6 L8 4 M12 6 L12 4"/>
    <circle cx="8" cy="10" r="1" fill="currentColor"/>
    <circle cx="12" cy="10" r="1" fill="currentColor"/>
    <path d="M8 13 Q10 15 12 13"/>
  </svg>`,

};

// Хелпер: вернуть иконку как HTML-строку с классом
export function icon(name, cls = '') {
  const svg = ICONS[name];
  if (!svg) return '';
  return svg.replace('<svg ', `<svg class="icon ${cls ? cls : ''}" `);
}

// Глобальная экспозиция. Файл подключается в index.html как обычный
// <script src="ui/icons.js"> — чтобы работало и при открытии index.html
// по file:// (где ES-модули блокируются CORS). `export` ниже удалён
// намеренно: под file:// инструкция `export` в классическом скрипте
// была бы SyntaxError.
if (typeof window !== 'undefined') {
}
