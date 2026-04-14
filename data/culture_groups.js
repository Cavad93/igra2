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
//    getCultureGroup(nationId)            → { groupId, label, ... }
//    getPortraitForCharacter(char, nationId) → 'assets/portraits/.../...jpg'
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
    portrait_pool: ['greek/woman_red','greek/man_bearded','greek/man_thinface','greek/woman_wreath'],
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
    portrait_pool: ['roman/youth','greek/man_bearded','greek/man_thinface'],
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
    portrait_pool: [
      'carthaginian/cma125560','carthaginian/cma144115',
      'egyptian/mummy_youth','greek/man_bearded',
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
    portrait_pool: ['egyptian/mummy_youth','greek/woman_wreath'],
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
    portrait_pool: ['greek/man_bearded','greek/man_thinface'],
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
    portrait_pool: [
      'celtic/cma133163',
      'greek/man_bearded','greek/man_thinface',
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
    portrait_pool: [
      'indian/cma147010','indian/cma141937','indian/cma151938',
      'indian/cma152487','indian/cma154768','indian/cma139731',
      'indian/met38780','indian/met38779','indian/met38799','indian/met38800',
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
    portrait_pool: [
      'east_asian/cma540825','east_asian/cma541307','east_asian/cma541305',
      'east_asian/met42178',
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
    portrait_pool: ['greek/man_bearded','greek/man_thinface'],
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
    portrait_pool: ['greek/man_bearded','greek/man_thinface','greek/woman_red'],
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

// ── Экспорт для Node (тесты) ────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NATION_CULTURE_GROUPS,
    getCultureGroup,
    getPortraitForCharacter,
    getNationIconPath,
    hashCode,
  };
}
