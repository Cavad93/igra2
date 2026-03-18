// ══════════════════════════════════════════════════════════════════════════
//  НАЧАЛЬНЫЙ РЕЛИГИОЗНЫЙ СОСТАВ РЕГИОНОВ — Сицилия ~301 до н.э.
//
//  official — государственная религия (от нации-владельца)
//  beliefs  — массив { religion, fervor (0..1) }
//    fervor = интенсивность веры в регионе (не просто %, а «жар» веры)
//    Сумма fervor может быть > 1 (люди верят в нескольких богов одновременно)
//
//  Исторический контекст:
//  - Греки Сицилии почитали Олимпийский пантеон + активнейший культ Деметры
//  - Культ Диониса проник через театр (Сиракузы — театральная столица)
//  - Пунийцы: жёсткая храмовая религия Баал-Танит + Мелькарт в портах
//  - Элимы: уникальный синкретизм (Афродита Эрицина = Астарта + Афродита)
//  - Сикулы: культ Адраноса + анимизм. Энна — перекрёсток (Деметра + духи)
//  - Сиканы: древнейший анимизм Сицилии, Земля-Мать
// ══════════════════════════════════════════════════════════════════════════

const REGION_RELIGIONS = {

  // ── СИРАКУЗСКАЯ ДЕРЖАВА ────────────────────────────────────────────────

  // Мессана — космополитный порт на проливе, храм Посейдона
  r55: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.65 },
      { religion: 'dionysian',     fervor: 0.15 },
      { religion: 'demeter_kore',  fervor: 0.10 },
    ],
  },

  // Тавромений — культурный город, театр, библиотека
  r102: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.55 },
      { religion: 'dionysian',     fervor: 0.20 },
      { religion: 'adranon',       fervor: 0.10 },
      { religion: 'earth_spirits', fervor: 0.08 },
    ],
  },

  // Катания — у подножия Этны, святилище Адраноса рядом
  r245: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.50 },
      { religion: 'adranon',       fervor: 0.25 },
      { religion: 'demeter_kore',  fervor: 0.12 },
      { religion: 'earth_spirits', fervor: 0.05 },
    ],
  },

  // Кенторипа — сикельский горный город, частично эллинизирован
  r246: {
    official: 'olympian',
    beliefs: [
      { religion: 'earth_spirits', fervor: 0.35 },
      { religion: 'adranon',       fervor: 0.25 },
      { religion: 'olympian',      fervor: 0.20 },
      { religion: 'demeter_kore',  fervor: 0.10 },
    ],
  },

  // Мегара Гиблея — древняя колония, небольшая, чисто греческая
  r247: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.60 },
      { religion: 'demeter_kore',  fervor: 0.20 },
    ],
  },

  // Сиракузы — столица, храм Афины на Ортигии, театр Диониса
  r248: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.60 },
      { religion: 'dionysian',     fervor: 0.18 },
      { religion: 'demeter_kore',  fervor: 0.15 },
      { religion: 'earth_spirits', fervor: 0.03 },
    ],
  },

  // Побережье к югу от Сиракуз
  r763: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.55 },
      { religion: 'demeter_kore',  fervor: 0.18 },
      { religion: 'earth_spirits', fervor: 0.08 },
    ],
  },

  // Моргантион — сикельский город с сильным греческим влиянием
  r2402: {
    official: 'olympian',
    beliefs: [
      { religion: 'earth_spirits', fervor: 0.30 },
      { religion: 'olympian',      fervor: 0.25 },
      { religion: 'demeter_kore',  fervor: 0.20 },
      { religion: 'adranon',       fervor: 0.15 },
    ],
  },

  // Камарина — дорийская колония, порт
  r2403: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.60 },
      { religion: 'demeter_kore',  fervor: 0.20 },
    ],
  },

  // Гербесс — сикельский город
  r2405: {
    official: 'olympian',
    beliefs: [
      { religion: 'earth_spirits', fervor: 0.40 },
      { religion: 'adranon',       fervor: 0.20 },
      { religion: 'olympian',      fervor: 0.10 },
    ],
  },

  // Агирион — сикельский город с эллинизацией
  r2406: {
    official: 'olympian',
    beliefs: [
      { religion: 'earth_spirits', fervor: 0.35 },
      { religion: 'olympian',      fervor: 0.20 },
      { religion: 'adranon',       fervor: 0.20 },
      { religion: 'demeter_kore',  fervor: 0.10 },
    ],
  },

  // Леонтины — греческий город с сикельским субстратом
  r2407: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.50 },
      { religion: 'demeter_kore',  fervor: 0.20 },
      { religion: 'earth_spirits', fervor: 0.10 },
    ],
  },

  // Гелор — прибрежный греческий регион
  r2408: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.55 },
      { religion: 'demeter_kore',  fervor: 0.22 },
    ],
  },

  // ── НЕЗАВИСИМЫЕ ГРЕЧЕСКИЕ ПОЛИСЫ ──────────────────────────────────────

  // Гела — дорийская колония, возрождающаяся после разорения
  r2404: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.55 },
      { religion: 'demeter_kore',  fervor: 0.25 },
      { religion: 'earth_spirits', fervor: 0.05 },
    ],
  },

  // Акрагас — храм Зевса Олимпийского (один из крупнейших в мире!)
  r2409: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.70 },
      { religion: 'demeter_kore',  fervor: 0.18 },
      { religion: 'dionysian',     fervor: 0.08 },
    ],
  },

  // Гераклея Минойская — пограничный полис (греки + пунийцы)
  r2410: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.40 },
      { religion: 'punic_pantheon', fervor: 0.20 },
      { religion: 'demeter_kore',  fervor: 0.15 },
      { religion: 'sican_earth',   fervor: 0.08 },
    ],
  },

  // Селинунт — разрушен, пунийское население, остатки греков
  r2411: {
    official: 'punic_pantheon',
    beliefs: [
      { religion: 'punic_pantheon', fervor: 0.45 },
      { religion: 'olympian',      fervor: 0.20 },
      { religion: 'demeter_kore',  fervor: 0.10 },
      { religion: 'sican_earth',   fervor: 0.05 },
    ],
  },

  // ── КАРФАГЕНСКАЯ ЭПИКРАТЕЯ ────────────────────────────────────────────

  // Лилибей — главная пунийская крепость на Сицилии
  r2412: {
    official: 'punic_pantheon',
    beliefs: [
      { religion: 'punic_pantheon', fervor: 0.65 },
      { religion: 'melqart',       fervor: 0.20 },
      { religion: 'elymian_aphrodite', fervor: 0.05 },
    ],
  },

  // Панорм (Палермо) — крупнейший пунийский город на Сицилии
  r2415: {
    official: 'punic_pantheon',
    beliefs: [
      { religion: 'punic_pantheon', fervor: 0.55 },
      { religion: 'melqart',       fervor: 0.18 },
      { religion: 'elymian_aphrodite', fervor: 0.10 },
      { religion: 'olympian',      fervor: 0.05 },
    ],
  },

  // Химера — пунийская территория
  r2416: {
    official: 'punic_pantheon',
    beliefs: [
      { religion: 'punic_pantheon', fervor: 0.50 },
      { religion: 'elymian_aphrodite', fervor: 0.15 },
      { religion: 'melqart',       fervor: 0.12 },
    ],
  },

  // Солунт — финикийский порт
  r249: {
    official: 'punic_pantheon',
    beliefs: [
      { religion: 'punic_pantheon', fervor: 0.50 },
      { religion: 'melqart',       fervor: 0.30 },
      { religion: 'olympian',      fervor: 0.08 },
    ],
  },

  // ── ЭЛИМИЙСКИЕ ЗЕМЛИ ──────────────────────────────────────────────────

  // Эрикс — гора с храмом Афродиты/Астарты, паломнический центр!
  r2413: {
    official: 'elymian_aphrodite',
    beliefs: [
      { religion: 'elymian_aphrodite', fervor: 0.60 },
      { religion: 'punic_pantheon',    fervor: 0.18 },
      { religion: 'earth_spirits',     fervor: 0.08 },
    ],
  },

  // Сегеста — элимийский город, вечная вражда с Селинунтом
  r2414: {
    official: 'elymian_aphrodite',
    beliefs: [
      { religion: 'elymian_aphrodite', fervor: 0.40 },
      { religion: 'olympian',          fervor: 0.15 },
      { religion: 'punic_pantheon',    fervor: 0.12 },
      { religion: 'earth_spirits',     fervor: 0.10 },
    ],
  },

  // ── СИКЕЛЬСКИЕ ЗЕМЛИ ──────────────────────────────────────────────────

  // Капитий — горная крепость сикулов, последний оплот
  r2420: {
    official: 'earth_spirits',
    beliefs: [
      { religion: 'earth_spirits', fervor: 0.55 },
      { religion: 'adranon',       fervor: 0.30 },
    ],
  },

  // Энна — пуп Сицилии, святилище Деметры и Коры!
  r2422: {
    official: 'demeter_kore',
    beliefs: [
      { religion: 'demeter_kore',  fervor: 0.45 },
      { religion: 'earth_spirits', fervor: 0.30 },
      { religion: 'adranon',       fervor: 0.12 },
    ],
  },

  // ── СИКАНСКИЕ ЗЕМЛИ ──────────────────────────────────────────────────

  // Миттистратон — сиканская глубинка
  r2423: {
    official: 'sican_earth',
    beliefs: [
      { religion: 'sican_earth',   fervor: 0.55 },
      { religion: 'earth_spirits', fervor: 0.20 },
    ],
  },

  // Макелла — сиканский город с пунийским влиянием
  r2424: {
    official: 'sican_earth',
    beliefs: [
      { religion: 'sican_earth',   fervor: 0.50 },
      { religion: 'punic_pantheon', fervor: 0.10 },
      { religion: 'earth_spirits', fervor: 0.15 },
    ],
  },

  // Гиппана — сиканская территория с элимийским влиянием
  r2425: {
    official: 'sican_earth',
    beliefs: [
      { religion: 'sican_earth',        fervor: 0.45 },
      { religion: 'elymian_aphrodite',  fervor: 0.12 },
      { religion: 'earth_spirits',      fervor: 0.18 },
    ],
  },

  // ── СЕВЕРНОЕ ПОБЕРЕЖЬЕ ────────────────────────────────────────────────

  // Кефалоэдий — греко-сикельский полис
  r2417: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.40 },
      { religion: 'earth_spirits', fervor: 0.20 },
      { religion: 'melqart',       fervor: 0.10 },
    ],
  },

  // Калактея — северный порт с сильным сикельским населением
  r2418: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.35 },
      { religion: 'earth_spirits', fervor: 0.25 },
      { religion: 'adranon',       fervor: 0.15 },
    ],
  },

  // Тиндарис — колония Дионисия, военный порт
  r2419: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.60 },
      { religion: 'dionysian',     fervor: 0.15 },
    ],
  },

  // Липарские острова — вулканические, культ Гефеста/Адраноса
  r3199: {
    official: 'olympian',
    beliefs: [
      { religion: 'olympian',      fervor: 0.45 },
      { religion: 'adranon',       fervor: 0.20 },
      { religion: 'dionysian',     fervor: 0.10 },
    ],
  },
};
