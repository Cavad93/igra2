// agents/gen_buildings.js
// Генератор начальных зданий для всех регионов мира.
//
// Алгоритм:
//   Для каждого региона без зданий и с нацией (не neutral):
//     1. Определяем биом/тип местности
//     2. Выбираем подходящие здания (terrain + deposits + biome score)
//     3. Рассчитываем уровень из численности населения
//     4. Назначаем владельца (farmers_class / soldiers_class / aristocrats / nation)
//     5. Генерируем building_slots
//   Записываем изменения обратно в regions_data.js.
//
// Запуск: node agents/gen_buildings.js
// Флаги:
//   --dry-run       — только показать статистику, не записывать файл
//   --include-neutral — генерировать и для neutral регионов
//   --overwrite     — заменять существующие здания

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DRY_RUN         = process.argv.includes('--dry-run');
const INCL_NEUTRAL    = process.argv.includes('--include-neutral');
const OVERWRITE       = process.argv.includes('--overwrite');

// ─────────────────────────────────────────────────────────────────────────────
// 1. ЗАГРУЗКА ДАННЫХ через vm (работает в ES-модулях)
// ─────────────────────────────────────────────────────────────────────────────
const ctx = {
  // shimы нужные скриптам данных
  INITIAL_GAME_STATE: { regions: {} },
  GAME_STATE:         { regions: {}, nations: {}, world_market: {} },
  console,
};
vm.createContext(ctx);

function loadData(relPath) {
  let code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  // В vm-контексте 'const X =' и 'let X =' создают блочные переменные,
  // недоступные снаружи скрипта. Заменяем их на 'var X =' чтобы
  // переменные попали в sandbox ctx.
  code = code.replace(/^(const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm, 'var $2 =');
  try {
    vm.runInContext(code, ctx);
  } catch (e) {
    // Некоторые IIFE в chains_data.js используют GAME_STATE — допустимо
    if (e instanceof ReferenceError) return;
    throw e;
  }
}

loadData('data/regions_data.js');   // → ctx.INITIAL_GAME_STATE.regions
loadData('data/biomes.js');         // → ctx.BIOME_META, ctx.REGION_BIOMES
loadData('data/buildings.js');      // → ctx.BUILDINGS
loadData('data/chains_data.js');    // → ctx.CHAINS_DATA (RECIPE_DATA, BUILDING_RECIPES)

const { BIOME_META, REGION_BIOMES, BUILDINGS } = ctx;
const REGIONS = ctx.INITIAL_GAME_STATE.regions;

// ─────────────────────────────────────────────────────────────────────────────
// 2. КОНФИГУРАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  MIN_POP:              1000,    // регионы меньше — пропускаем
  WORKERS_FRAC:         0.20,    // доля населения занятая в зданиях
  MIN_BIOME_SCORE:      0.55,    // порог пригодности биома для выбора здания
  MAX_BLDG_PER_REGION:  6,       // максимум типов зданий
  // Доля населения для спец. зданий
  PORT_POP:             4000,    // порог для порта
  MARKET_POP:           5000,    // порог для рынка
  WAREHOUSE_POP:        8000,    // порог для склада
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. СПРАВОЧНИКИ
// ─────────────────────────────────────────────────────────────────────────────

// Основной товар каждого здания (для оценки пригодности биома)
const BUILDING_GOOD = {};
for (const [bid, bdef] of Object.entries(BUILDINGS)) {
  if (bdef.production_output?.length) {
    BUILDING_GOOD[bid] = bdef.production_output[0].good;
  }
}

// Месторождение → здание-шахта
const DEPOSIT_BUILDING = {
  iron:          'iron_mine',
  copper:        'copper_mine',
  silver:        'silver_mine',
  gold:          'gold_mine',
  tin:           'tin_mine',
  sulfur:        'sulfur_mine',
  stone:         'quarry',
  amber:         'amber_gathering',
  furs:          'fur_trapping',
  incense:       'incense_grove',
  war_elephants: 'elephant_corral',
};

// Правила собственности зданий
const OWNER_RULES = {
  wheat_family_farm:  'farmers_class',
  wheat_villa:        'soldiers_class',
  wheat_latifundium:  'aristocrats',    // 70% — остальное 'nation' обрабатывается отдельно
  horse_ranch:        'soldiers_class',
  cattle_farm:        'farmers_class',
  apiary:             'farmers_class',
  olive_grove:        'aristocrats',
  hemp_field:         'farmers_class',
  ranch:              'farmers_class',
  // По умолчанию 'nation'
};

// Здания только для определённых типов местности (terrain_restriction уже есть в BUILDINGS)
// Этот список — быстрая проверка для основных сценариев
const COASTAL_ONLY = new Set([
  'port','shipyard','tuna_trap','salt_works','fishery','garum_workshop',
]);
const MINE_BUILDINGS = new Set([
  'mine','iron_mine','copper_mine','silver_mine','gold_mine','tin_mine',
  'sulfur_mine','quarry',
]);

// ─────────────────────────────────────────────────────────────────────────────
// 4. ФУНКЦИИ ОЦЕНКИ
// ─────────────────────────────────────────────────────────────────────────────

/** Оценка пригодности биома для товара. 0.0 – 2.0 */
function biomeScore(biomeId, good) {
  const meta = typeof BIOME_META !== 'undefined' ? BIOME_META[biomeId] : null;
  if (!meta?.goods_bonus) return 0.8;
  return meta.goods_bonus[good] ?? 0.8;
}

/** Проверяем terrain_restriction здания */
function terrainAllowed(bdef, terrain) {
  if (!bdef.terrain_restriction || bdef.terrain_restriction.length === 0) return true;
  return bdef.terrain_restriction.includes(terrain);
}

/** Подбираем биом для региона */
function getRegionBiome(rid, region) {
  if (typeof REGION_BIOMES !== 'undefined' && REGION_BIOMES[rid]) {
    return REGION_BIOMES[rid];
  }
  // Fallback: старые terrain-типы как биом
  return region.terrain || region.type || 'plains';
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ВЫБОР ЗДАНИЙ ДЛЯ РЕГИОНА
// ─────────────────────────────────────────────────────────────────────────────

function selectBuildings(rid, region) {
  const terrain = region.terrain || region.type || 'plains';
  const biome   = getRegionBiome(rid, region);
  const pop     = region.population || 0;
  const deposits = region.deposits || {};
  const coastal  = terrain === 'coastal_city';

  const selected = [];  // { building_id, priority, owner }

  // ── А. Инфраструктура ─────────────────────────────────────────────────────
  if (coastal && pop >= CFG.PORT_POP) {
    selected.push({ building_id: 'port', priority: 10 });
  }
  if (pop >= CFG.MARKET_POP) {
    selected.push({ building_id: 'market', priority: 8 });
  }
  if (pop >= CFG.WAREHOUSE_POP) {
    selected.push({ building_id: 'warehouse', priority: 6 });
  }

  // ── Б. Месторождения (deposits) → шахты ───────────────────────────────────
  for (const [depositGood, depositMult] of Object.entries(deposits)) {
    const bid = DEPOSIT_BUILDING[depositGood];
    if (!bid || !BUILDINGS[bid]) continue;
    const bdef = BUILDINGS[bid];
    if (!terrainAllowed(bdef, terrain)) continue;
    // depositMult > 1.0 → хорошее месторождение
    const priority = 15 + depositMult;   // высокий приоритет
    selected.push({ building_id: bid, priority, depositGood });
  }

  // ── В. Прибрежные здания (кроме порта) ────────────────────────────────────
  if (coastal) {
    const coastalCandidates = ['tuna_trap', 'salt_works', 'fishery', 'garum_workshop'];
    for (const bid of coastalCandidates) {
      const bdef = BUILDINGS[bid];
      if (!bdef) continue;
      const good = BUILDING_GOOD[bid];
      const score = good ? biomeScore(biome, good) : 0.8;
      if (score >= CFG.MIN_BIOME_SCORE) {
        selected.push({ building_id: bid, priority: 7 + score });
      }
    }
  }

  // ── Г. Сельское хозяйство (по биому) ──────────────────────────────────────
  // Базовые культуры: низкий порог (0.55)
  const agriBase = ['wheat_family_farm', 'cattle_farm'];
  // Крупные хозяйства: только для крупных регионов
  const agriLarge = ['wheat_villa', 'wheat_latifundium', 'horse_ranch'];
  // Специальные культуры: высокий порог биома (0.85)
  const agriSpecial = [
    'olive_grove', 'winery', 'oil_press', 'apiary',
    'hemp_field',
  ];
  // Экзотические: только определённые terrain + высокий порог
  const agriExotic = [
    { bid: 'papyrus_bed', terrains: ['river_valley'] },
  ];

  for (const bid of agriBase) {
    const bdef = BUILDINGS[bid];
    if (!bdef || !terrainAllowed(bdef, terrain)) continue;
    const good = BUILDING_GOOD[bid];
    if (!good) continue;
    const score = biomeScore(biome, good);
    if (score >= CFG.MIN_BIOME_SCORE) {
      selected.push({ building_id: bid, priority: 5 + score });
    }
  }
  if (pop >= 5000) {
    for (const bid of agriLarge) {
      const bdef = BUILDINGS[bid];
      if (!bdef || !terrainAllowed(bdef, terrain)) continue;
      const good = BUILDING_GOOD[bid];
      if (!good) continue;
      const score = biomeScore(biome, good);
      if (score >= CFG.MIN_BIOME_SCORE) {
        selected.push({ building_id: bid, priority: 5 + score });
      }
    }
  }
  for (const bid of agriSpecial) {
    const bdef = BUILDINGS[bid];
    if (!bdef || !terrainAllowed(bdef, terrain)) continue;
    const good = BUILDING_GOOD[bid];
    if (!good) continue;
    const score = biomeScore(biome, good);
    if (score >= 0.85) {
      selected.push({ building_id: bid, priority: 4 + score });
    }
  }
  for (const { bid, terrains } of agriExotic) {
    if (!terrains.includes(terrain)) continue;
    const bdef = BUILDINGS[bid];
    if (!bdef) continue;
    const good = BUILDING_GOOD[bid];
    if (!good) continue;
    const score = biomeScore(biome, good);
    if (score >= 0.85) {
      selected.push({ building_id: bid, priority: 3 + score });
    }
  }

  // ── Д. Производственные здания ────────────────────────────────────────────
  const prodBuildings = [
    'workshop', 'pottery_workshop', 'charcoal_kiln',
    'lumber_camp', 'textile_mill', 'tannery',
    'forge', 'bronze_foundry',
    'trading_post',
  ];
  for (const bid of prodBuildings) {
    const bdef = BUILDINGS[bid];
    if (!bdef) continue;
    if (!terrainAllowed(bdef, terrain)) continue;
    const good = BUILDING_GOOD[bid];
    const score = good ? biomeScore(biome, good) : 0.8;
    if (score >= CFG.MIN_BIOME_SCORE) {
      selected.push({ building_id: bid, priority: 4 + score });
    }
  }

  // ── Е. Дедубликация + сортировка по приоритету ────────────────────────────
  const seen = new Set();
  const unique = [];
  for (const item of selected.sort((a, b) => b.priority - a.priority)) {
    if (!seen.has(item.building_id)) {
      seen.add(item.building_id);
      unique.push(item);
    }
  }

  // Ограничиваем количество зданий
  return unique.slice(0, CFG.MAX_BLDG_PER_REGION);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. РАСЧЁТ УРОВНЯ ЗДАНИЯ
// ─────────────────────────────────────────────────────────────────────────────

function calcLevel(pop, bdef, buildingCount) {
  const wpu = bdef.workers_per_unit || 50;
  const maxLvl = bdef.max_level ?? 10;

  // Делим рабочий резерв равномерно между зданиями
  const workersPerBuilding = Math.floor((pop * CFG.WORKERS_FRAC) / buildingCount);
  const rawLevel = Math.floor(workersPerBuilding / wpu);

  // Минимум 1, максимум ограничен max_level
  return Math.max(1, maxLvl ? Math.min(rawLevel, maxLvl) : rawLevel);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. НАЗНАЧЕНИЕ ВЛАДЕЛЬЦА
// ─────────────────────────────────────────────────────────────────────────────

function getOwner(buildingId) {
  return OWNER_RULES[buildingId] || 'nation';
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ГЕНЕРАЦИЯ СЛОТОВ ДЛЯ ОДНОГО РЕГИОНА
// ─────────────────────────────────────────────────────────────────────────────

function generateSlots(rid, region, candidates) {
  const slots = [];
  const pop = region.population || 1000;

  for (let i = 0; i < candidates.length; i++) {
    const { building_id } = candidates[i];
    const bdef = BUILDINGS[building_id];
    if (!bdef) continue;

    const level = calcLevel(pop, bdef, candidates.length);
    const owner = getOwner(building_id);

    // Собираем workers из определения здания
    const workers = {};
    if (bdef.worker_profession?.length) {
      for (const { profession, count } of bdef.worker_profession) {
        workers[profession] = count;
      }
    } else {
      workers.craftsmen = bdef.workers_per_unit || 50;
    }

    const slot = {
      slot_id:      `${rid}_g${i + 1}`,
      building_id,
      status:       'active',
      level,
      workers,
      founded_turn: 0,
      revenue:      0,
      wages_paid:   0,
    };
    if (owner !== 'nation') slot.owner = owner;

    slots.push(slot);
  }

  return slots;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ГЛАВНЫЙ ЦИКЛ
// ─────────────────────────────────────────────────────────────────────────────

function generate() {
  let generated = 0, skipped = 0, empty = 0;
  const buildingStats = {};   // building_id → кол-во новых слотов

  for (const [rid, region] of Object.entries(REGIONS)) {
    // Пропустить если уже есть здания (и не --overwrite)
    if (!OVERWRITE && region.building_slots?.length > 0) {
      skipped++;
      continue;
    }
    // Нейтральные регионы
    if (!INCL_NEUTRAL && region.nation === 'neutral') {
      skipped++;
      continue;
    }
    // Слишком маленькие регионы
    if ((region.population || 0) < CFG.MIN_POP) {
      skipped++;
      continue;
    }

    const candidates = selectBuildings(rid, region);
    if (candidates.length === 0) {
      empty++;
      continue;
    }

    const slots = generateSlots(rid, region, candidates);
    if (!OVERWRITE) {
      region.building_slots = [...(region.building_slots || []), ...slots];
    } else {
      region.building_slots = slots;
    }
    generated += slots.length;
    for (const s of slots) {
      buildingStats[s.building_id] = (buildingStats[s.building_id] || 0) + 1;
    }
  }

  return { generated, skipped, empty, buildingStats };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. ЗАПИСЬ В regions_data.js
// ─────────────────────────────────────────────────────────────────────────────

function serializeSlots(slots) {
  return JSON.stringify(slots).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/g, '$1:');
}

function writeOutput() {
  const regionsFile = path.join(ROOT, 'data', 'regions_data.js');
  const src = fs.readFileSync(regionsFile, 'utf8');

  // Разбиваем на строки — каждый регион на своей строке
  const lines = src.split('\n');
  let patchCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ищем строку с определением региона: R['rXXX']={...}
    const m = line.match(/^\s*R\['(r\d+)'\]=/);
    if (!m) continue;
    const rid = m[1];

    const region = REGIONS[rid];
    if (!region?.building_slots?.length) continue;

    const slotsStr = serializeSlots(region.building_slots);

    const bsIdx = line.indexOf('building_slots:');

    if (bsIdx !== -1) {
      // Поле уже есть — заменяем значение
      const arrStart = line.indexOf('[', bsIdx);
      if (arrStart === -1) continue;

      let depth = 0;
      let arrEnd = -1;
      for (let j = arrStart; j < line.length; j++) {
        if (line[j] === '[' || line[j] === '{') depth++;
        else if (line[j] === ']' || line[j] === '}') {
          depth--;
          if (depth === 0) { arrEnd = j; break; }
        }
      }
      if (arrEnd === -1) continue;

      lines[i] = line.slice(0, arrStart) + slotsStr + line.slice(arrEnd + 1);
    } else {
      // Поля нет — добавляем перед закрывающим };
      // Строка заканчивается на '};'
      const closeIdx = line.lastIndexOf('};');
      if (closeIdx === -1) continue;
      lines[i] = line.slice(0, closeIdx) + `,building_slots:${slotsStr}};`;
    }
    patchCount++;
  }

  fs.writeFileSync(regionsFile, lines.join('\n'), 'utf8');
  return patchCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. ТОЧКА ВХОДА
// ─────────────────────────────────────────────────────────────────────────────

const { generated, skipped, empty, buildingStats } = generate();

console.log('\n=== ГЕНЕРАТОР ЗДАНИЙ ===');
console.log(`Новых слотов:      ${generated}`);
console.log(`Пропущено регионов: ${skipped}`);
console.log(`Пустых (нет кандидатов): ${empty}`);
console.log('\nЗдания по типу:');
const sorted = Object.entries(buildingStats).sort((a, b) => b[1] - a[1]);
for (const [bid, cnt] of sorted) {
  const name = BUILDINGS[bid]?.name || bid;
  console.log(`  ${name.padEnd(28)} ${cnt}`);
}

if (!DRY_RUN) {
  const patched = writeOutput();
  console.log(`\nЗаписано регионов: ${patched}`);
  console.log('Файл обновлён: data/regions_data.js');
} else {
  console.log('\n[DRY-RUN] Файл НЕ изменён.');
}
