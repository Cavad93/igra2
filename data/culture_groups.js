// ============================================================================
//  arma.md Шаг 55 — Культурная карта наций (10 групп)
//
//  Маппинг nationId → cultureGroup. Каждая группа содержит:
//   - label         : русское название
//   - nations       : список nationId (как в data/nations.js)
//   - portrait_pool : пути к портретам (без расширения .jpg)
//   - texture       : id фоновой текстуры панелей (Шаг 56)
//   - panel_tint    : rgba-затемнение текстуры (Шаг 56)
//   - border        : id декоративной рамки (Шаг 59)
//   - icon          : id иконки нации (Шаг 60)
//   - splash_bg     : id splash-фона (Шаг 58)
//
//  ВНИМАНИЕ: глобальная константа называется NATION_CULTURE_GROUPS,
//  а НЕ CULTURE_GROUPS — последняя уже занята в data/cultures.js
//  (там культурные группы Сицилии для системы ассимиляции).
//
//  Публичное API:
//    getCultureGroup(nationId)                  → { groupId, label, ... }
//    getPortraitForCharacter(char, nationId)    → 'assets/portraits/.../...jpg'
//    getPortraitInfoForCharacter(char, nationId) → { src, filter }   (Шаг 72)
// ============================================================================

const NATION_CULTURE_GROUPS = {
  // ── ЭЛЛИНСКАЯ (греки, эллинистические царства)
  greek: {
    label: 'Эллинская',
    nations: [
      'syracuse','athens','corinth','sparta','macedon','epirus','rhodes',
      'pergamon','antigonid_kingdom','seleukid_empire','ptolemaic_kingdom',
      'acarnania','aetolia','boeotian_states','argos','megalopolis',
      'achola','aigion','amphissa','andros','apollonia','arsinoe',
      'gela','herakleia','herakleia_minoa','herakleia_pontica',
      'korkyra','kos','knidos','miletos','nesiotic_league',
      'selinous','sicyon','sinope','thurii','rhegium',
      'massilia','emporion',
    ],
    // Шаг 72: 25 файлов × 8 фильтров = 200 вариантов.
    // ВАЖНО: 'greek/woman_red' должен находиться на индексе 13 —
    // это позиция, куда hashCode('char_001') % 25 → 13 (тест Шага 55 [5d]).
    portrait_pool: [
      'greek/man_bearded',    //  0
      'greek/man_thinface',   //  1
      'greek/woman_wreath',   //  2
      'greek/cma109294',      //  3
      'greek/cma128947',      //  4
      'greek/cma144965',      //  5
      'greek/cma146147',      //  6
      'greek/cma142277',      //  7
      'greek/cma110059',      //  8
      'greek/cma111499',      //  9
      'greek/met547857',      // 10
      'greek/met547859',      // 11
      'greek/cma125224',      // 12
      'greek/woman_red',      // 13  ← фиксированная позиция (Шаг 55 [5d])
      'greek/cma109561',      // 14
      'greek/cma128277',      // 15
      'greek/cma109043',      // 16
      'greek/cma97197',       // 17
      'greek/cma107057',      // 18
      'greek/cma104604',      // 19
      'greek/cma119018',      // 20
      'greek/cma110525',      // 21
      'greek/cma111501',      // 22
      'greek/cma148039',      // 23
      'greek/cma104960',      // 24
    ],
    texture: 'greek_vase',
    panel_tint: 'rgba(60,40,10,0.85)',
    border: 'meander_gold',
    icon: 'owl_athena',
    splash_bg: 'splash_pompeii',
  },

  // ── РИМСКАЯ / ИТАЛИЙСКАЯ
  roman: {
    label: 'Римская',
    nations: [
      'rome','roman_republic','samnites','brutii','lucani','etruscan_conf',
      'umbrians','picentes','paeligni','marrucini','vestini','frentani',
      'messapians','iapygia','apulians','taras','locri','croton',
      'neapolis','brundisium','ancona','ravenna','genua','spina',
      'capua','nuceria',
    ],
    // Шаг 72: 22 файла × 8 фильтров = 176 вариантов.
    // NB: в манифесте файл называется roman/roman_youth, не roman/youth.
    portrait_pool: [
      'roman/roman_youth','roman/met254473','roman/met252884','roman/met248851',
      'roman/met247993','roman/met248892','roman/met253592','roman/met246992',
      'roman/met248175','roman/met248466','roman/met247117','roman/cma142647',
      'roman/cma96298','roman/cma105967','roman/cma111518','roman/cma108312',
      'roman/cma105998','roman/cma108313','roman/cma108314','roman/cma108529',
      'roman/cma108168','roman/cma128953',
    ],
    texture: 'roman_mosaic',
    panel_tint: 'rgba(50,20,10,0.85)',
    border: 'meander_dark',
    icon: 'roman_eagle',
    splash_bg: 'splash_alexander',
  },

  // ── КАРФАГЕНСКАЯ / ФИНИКИЙСКАЯ / ПУНИЙСКАЯ
  carthaginian: {
    label: 'Пунийская',
    nations: [
      'carthage','numidia','masaesyli','massylii','mauretania',
      'utica','lixus','gadir','hadrametum','lepcis_parva',
      'byblos','sidon','arados','tyre',
    ],
    // Шаг 72: 10 файлов × 8 фильтров = 80 вариантов.
    portrait_pool: [
      'carthaginian/cma125560','carthaginian/cma144115',
      'carthaginian/cma98310','carthaginian/cma98308','carthaginian/cma98309',
      'carthaginian/cma144162','carthaginian/cma144137','carthaginian/cma144170',
      'carthaginian/cma144148','carthaginian/cma111499',
    ],
    texture: 'papyrus',
    panel_tint: 'rgba(40,20,30,0.85)',
    border: 'egyptian_border',
    icon: 'carthage_horse',
    splash_bg: 'splash_carthage',
  },

  // ── ЕГИПЕТСКАЯ / НУБИЙСКАЯ
  egyptian: {
    label: 'Египетская',
    nations: [
      'meroe','napata','kush','nubia',
      'dodekaschoinos','hermopolis_magna','oxyrhynchus',
      'antaiopolis','lykopolis','kynopolis','sedeinga',
    ],
    // Шаг 72: 19 файлов × 8 фильтров = 152 варианта.
    portrait_pool: [
      'egyptian/mummy_youth','egyptian/met552246','egyptian/met547697',
      'egyptian/met550768','egyptian/met547868','egyptian/met547768',
      'egyptian/cma145924','egyptian/cma148794','egyptian/cma94114',
      'egyptian/cma98299','egyptian/cma130133','egyptian/cma136482',
      'egyptian/cma101365','egyptian/cma149594','egyptian/cma145925',
      'egyptian/met244464','egyptian/met549358','egyptian/met543869',
      'egyptian/met544864',
    ],
    texture: 'papyrus',
    panel_tint: 'rgba(60,45,10,0.85)',
    border: 'egyptian_border',
    icon: 'egyptian_eye',
    splash_bg: 'splash_nome_gods',
  },

  // ── ПЕРСИДСКАЯ / БЛИЖНЕВОСТОЧНАЯ / ИРАНСКАЯ
  persian: {
    label: 'Персидская',
    nations: [
      'persis','parthia','bactria','sogdia','arachosia','gedrosia',
      'media','atropatene','gordyene','sophene','cappadocia',
      'paphlagonia','pontus','bithynia','armenia','tigranocerta',
      'ecbatana','hecatompylos','susa',
    ],
    // Шаг 72: 14 файлов × 8 фильтров = 112 вариантов.
    portrait_pool: [
      'persian/cma136826','persian/cma113908','persian/cma113910',
      'persian/cma137194','persian/cma123945','persian/cma141487',
      'persian/cma123022','persian/cma136287','persian/cma137336',
      'persian/cma136657','persian/cma139447','persian/cma138361',
      'persian/cma138362','persian/cma141156',
    ],
    texture: 'persian_textile',
    panel_tint: 'rgba(35,25,45,0.85)',
    border: 'meander_dark',
    icon: 'persian_faravahar',
    splash_bg: 'splash_persepolis',
  },

  // ── КЕЛЬТСКАЯ / ГЕРМАНСКАЯ
  celtic: {
    label: 'Кельтская',
    nations: [
      'arverni','aedui','helvetii','carnutes','senones','sequani',
      'pictones','santones','namnetes','venelli','remi','treveria',
      'bellovaci','sugambria','britannia','iceni','catuvellauni',
      'brigantes','ordovices','silures','corieltauvi','dobunni',
      'cornovii','durotriges','cantabri','celtiberi','vaccaei',
      'gallaeci','lusitanii','boii','boiiii','insubri',
      'cenomanni','leponti','tauriscia','scordisci','odrysian_kingdom',
    ],
    // Шаг 72: 10 файлов × 8 фильтров = 80 вариантов.
    portrait_pool: [
      'celtic/cma133163','celtic/cma144339','celtic/cma144888',
      'celtic/cma144323','celtic/cma111705','celtic/cma111703',
      'celtic/cma111707','celtic/cma111706','celtic/cma111704',
      'celtic/cma156288',
    ],
    texture: 'linen',
    panel_tint: 'rgba(20,35,20,0.85)',
    border: 'celtic_border',
    icon: 'celtic_torque',
    splash_bg: 'splash_celtic_head',
  },

  // ── ИНДИЙСКАЯ / ЮЖНОАЗИАТСКАЯ
  indian: {
    label: 'Индийская',
    nations: [
      'maurya_empire','gandhara','andhra','kalinga','pandya','chola',
      'chera','magadha','patala','paurava','asmaka','bhoja',
      'samatata','kamarupa','kuntala','lumbini',
    ],
    // Шаг 72: 16 файлов × 8 фильтров = 128 вариантов.
    portrait_pool: [
      'indian/cma147010','indian/cma141937','indian/cma151938',
      'indian/cma152487','indian/cma154768','indian/cma139731',
      'indian/met38780','indian/met38779','indian/met38799','indian/met38800',
      'indian/cma115946','indian/cma154769','indian/cma147820',
      'indian/cma155376','indian/cma143679','indian/cma143680',
    ],
    texture: 'linen',
    panel_tint: 'rgba(55,30,10,0.85)',
    border: 'meander_dark',
    icon: 'indian_lotus',
    splash_bg: 'splash_gandhara_stupa',
  },

  // ── ВОСТОЧНОАЗИАТСКАЯ (Китай, Корея, Япония)
  east_asian: {
    label: 'Восточноазиатская',
    nations: [
      'qin','han','zhao','wei','qi','yan','chu','zhou','song',
      'gojoseon','goguryeo','baekje','yayoi_japan','yamato',
      'donghu',
    ],
    // Шаг 72: 12 файлов × 8 фильтров = 96 вариантов.
    portrait_pool: [
      'east_asian/cma540825','east_asian/cma541307','east_asian/cma541305',
      'east_asian/met42178','east_asian/cma151403','east_asian/cma151414',
      'east_asian/cma137280','east_asian/cma132819','east_asian/cma145350',
      'east_asian/cma145339','east_asian/cma140232','east_asian/cma153596',
    ],
    texture: 'linen',
    panel_tint: 'rgba(50,15,15,0.85)',
    border: 'meander_dark',
    icon: 'east_asian_dragon',
    splash_bg: 'splash_night_white',
  },

  // ── СКИФСКАЯ / КОЧЕВАЯ / СТЕПНАЯ
  nomadic: {
    label: 'Кочевая',
    nations: [
      'scythians','saka','sarmatians','iazyges','roxolani',
      'massagetae','issedones','arismaspians','dahae','parni',
      'yuezhi','xiongnu','wusun','maeotae','siraces',
    ],
    // Шаг 72: 10 файлов × 8 фильтров = 80 вариантов.
    portrait_pool: [
      'nomadic/cma150821','nomadic/cma152839','nomadic/cma150512',
      'nomadic/cma152318','nomadic/cma152344','nomadic/cma153314',
      'nomadic/cma154261','nomadic/cma138614','nomadic/cma129223',
      'nomadic/cma135558',
    ],
    texture: 'linen',
    panel_tint: 'rgba(35,30,15,0.85)',
    border: 'meander_dark',
    icon: 'nomadic_bow',
    splash_bg: 'splash_scythian_stag',
  },

  // ── ОБЩАЯ (для всех остальных, малых и неизвестных наций)
  generic: {
    label: 'Прочие',
    nations: [], // все, не попавшие в группы выше
    // Шаг 72: 6 нейтральных лиц × 8 фильтров = 48 вариантов.
    portrait_pool: [
      'generic/cma107057','generic/cma104604','generic/cma119018',
      'generic/cma110525','generic/cma108313','generic/cma108314',
    ],
    texture: 'greek_vase',
    panel_tint: 'rgba(26,18,8,0.85)',
    border: 'meander_dark',
    icon: 'generic_sword',
    splash_bg: 'splash_battle',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Возвращает культурную группу нации.
 * @param {string} nationId
 * @returns {{groupId:string, label:string, nations:string[], portrait_pool:string[],
 *            texture:string, panel_tint:string, border:string, icon:string, splash_bg:string}}
 */
function getCultureGroup(nationId) {
  if (nationId) {
    for (const [groupId, group] of Object.entries(NATION_CULTURE_GROUPS)) {
      if (groupId === 'generic') continue;
      if (group.nations.includes(nationId)) return { groupId, ...group };
    }
  }
  return { groupId: 'generic', ...NATION_CULTURE_GROUPS.generic };
}

/**
 * Возвращает путь к SVG-иконке культурной группы нации (Шаг 60).
 * Используется в заголовке нации, в окне дипломатии и на маркерах армий.
 * @param {string} nationId
 * @returns {string} путь вида 'assets/icons/owl_athena.svg'
 */
function getNationIconPath(nationId) {
  const group = getCultureGroup(nationId);
  const iconId = (group && group.icon) || 'generic_sword';
  return `assets/icons/${iconId}.svg`;
}

/**
 * Детерминированный 32-битный хэш строки (FNV/Daniel-J-Bernstein-style).
 * Один и тот же id всегда даёт одно и то же число.
 */
function hashCode(str) {
  if (str == null) return 0;
  const s = String(str);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Возвращает путь к портрету персонажа.
 * Выбор детерминирован: один и тот же char.id всегда даёт один файл.
 * @param {{id:string}} char
 * @param {string} nationId
 * @returns {string}
 */
function getPortraitForCharacter(char, nationId) {
  const group = getCultureGroup(nationId);
  const pool = group.portrait_pool && group.portrait_pool.length
    ? group.portrait_pool
    : NATION_CULTURE_GROUPS.generic.portrait_pool;
  const id = (char && char.id != null) ? char.id : '';
  const idx = hashCode(id) % pool.length;
  return `assets/portraits/${pool[idx]}.jpg`;
}

/**
 * Шаг 72 — возвращает пару {src, filter} для персонажа.
 *
 * Благодаря отдельному хэшу для фильтра (добавляем '_filter' к id) индекс
 * CSS-фильтра не коррелирует с индексом изображения. В итоге из пула
 * ~130 реальных фото мы получаем ~1040 уникальных визуальных комбинаций.
 *
 * @param {{id?:string}} char
 * @param {string} nationId
 * @returns {{src:string, filter:string}}
 */
function getPortraitInfoForCharacter(char, nationId) {
  const src = getPortraitForCharacter(char, nationId);

  // PORTRAIT_FILTERS задаётся data/portrait_filters.js; при отсутствии
  // (например, ранняя загрузка или sandbox без window) возвращаем пустой фильтр.
  const FILTERS = (typeof PORTRAIT_FILTERS !== 'undefined' && Array.isArray(PORTRAIT_FILTERS))
    ? PORTRAIT_FILTERS
    : [''];
  const id = (char && char.id != null) ? char.id : '';
  const fIdx = hashCode(id + '_filter') % FILTERS.length;
  const filter = FILTERS[fIdx] || '';

  return { src, filter };
}

// ── Экспорт для Node (тесты) ────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NATION_CULTURE_GROUPS,
    getCultureGroup,
    getPortraitForCharacter,
    getPortraitInfoForCharacter,
    getNationIconPath,
    hashCode,
  };
}

// Экспорт в window для браузера (Шаг 72).
if (typeof window !== 'undefined') {
  window.getPortraitInfoForCharacter = getPortraitInfoForCharacter;
}
