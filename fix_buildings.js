// fix_buildings.js — add missing workers_per_unit, location_requirement, historical_note
const fs = require('fs'), vm = require('vm');
const SB = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  vm.runInContext(code, SB);
}
load('buildings.js');

// Data to inject: [workers_per_unit, location_requirement, historical_note]
const PATCHES = {
  // Infrastructure
  port:             [50,  {type:'biome', deposit_key:null, allowed_biomes:['coastal_city']},
    'Порты Сиракуз, Карфагена и Александрии были крупнейшими торговыми узлами античного мира; Дионисий Сиракузский расширил гавань до вмещения 200 военных триер.'],
  shipyard:         [40,  {type:'biome', deposit_key:null, allowed_biomes:['coastal_city']},
    'Дионисий I в 399 до н.э. одновременно задействовал 20 верфей Сиракуз и нанял специалистов со всей Греции — результатом стал первый в истории пятипалубный корабль.'],
  market:           [20,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Агора Афин и форум Рима были центрами не только торговли, но и политики; Аристотель выделял особую роль рынка как места формирования гражданского сообщества.'],
  road:             [10,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Аппиева дорога (312 до н.э.) заложила стандарт: ширина 4 м, щебёночная подсыпка, камень поверху; римские дороги до сих пор служат основой европейских трасс.'],
  warehouse:        [5,   {type:'none', deposit_key:null, allowed_biomes:[]},
    'Карфагенские склады-хорреи были государственными монополиями; в Остии хорреи Эпагатиана вмещали до 7 000 тонн зерна и работали непрерывно.'],
  // Military
  barracks:         [100, {type:'none', deposit_key:null, allowed_biomes:[]},
    'Гарнизонные казармы Сиракуз при Дионисии I вмещали до 10 000 наёмников; казармы совмещали жильё, склады оружия и учебные поля.'],
  walls:            [30,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Городские стены Сиракуз при Дионисии (402–397 до н.э.) протяжённостью 27 км считались крупнейшими в греческом мире; их возвели за 20 дней с использованием 60 000 рабочих.'],
  // Agriculture
  ranch:            [8,   {type:'none', deposit_key:null, allowed_biomes:[]},
    'Скотоводческие хозяйства горных районов Сицилии (Неброди) поставляли шерсть и кожу для военного снаряжения армий Агафокла.'],
  granary:          [5,   {type:'none', deposit_key:null, allowed_biomes:[]},
    'Государственные зернохранилища Птолемеевского Египта вмещали годовой урожай провинции; Рим к I в. до н.э. содержал хорреи на 40 000 тонн зерна.'],
  irrigation:       [12,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Ирригационные системы долины Нила и Вавилонии существовали тысячелетиями; Феофраст описывал продуманные сицилийские водоводы в прибрежных равнинах.'],
  wheat_family_farm:[null, {type:'none', deposit_key:null, allowed_biomes:[]},
    'Мелкие крестьянские хозяйства Сицилии производили большую часть зерна; Диодор описывает 30 000 небольших ферм вокруг Сиракуз в IV в. до н.э.'],
  wheat_villa:      [null, {type:'none', deposit_key:null, allowed_biomes:[]},
    'Вилла с рабами среднего размера — стандарт для богатых граждан Сицилии; Катон рекомендовал 13 рабов на виноградник площадью 100 югеров.'],
  wheat_latifundium:[null, {type:'none', deposit_key:null, allowed_biomes:[]},
    'Крупные латифундии Сицилии с рабским трудом возникли после Второй Пунической войны; Тиберий Гракх видел в них угрозу для малоземельного крестьянства.'],
  horse_ranch:      [null, {type:'none', deposit_key:null, allowed_biomes:[]},
    'Нумидийские коневоды поставляли Карфагену лучшую конницу античного мира; на Сицилии конные хозяйства Агригента были известны по всей Греции.'],
  cattle_farm:      [null, {type:'none', deposit_key:null, allowed_biomes:[]},
    'Пастбищное скотоводство центральной Сицилии давало тягловых волов, мясо и кожу; Columella описывает оптимальные пропорции стада для смешанного хозяйства.'],
  // Culture
  temple:           [15,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Храм Зевса в Акраганте (V в. до н.э.) — крупнейший дорический храм Сицилии; строился силами тысяч карфагенских пленников и так и не был достроен.'],
  aqueduct:         [20,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Акведук Аппия Клавдия (312 до н.э.) первым снабдил Рим чистой водой; Фронтин сообщает, что к I в. н.э. в Рим поступало более миллиона кубометров воды в сутки.'],
  school:           [10,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Платоновская Академия и Ликей Аристотеля стали прообразом институтов высшей учёбы; обучение риторике и философии было основой образования свободного гражданина.'],
  forum:            [5,   {type:'none', deposit_key:null, allowed_biomes:[]},
    'Форум Рима — политический, торговый и религиозный центр; сицилийские агоры были меньше, но выполняли те же функции в городах под греческим влиянием.'],
  tavern:           [8,   {type:'none', deposit_key:null, allowed_biomes:[]},
    'Таверны (caupona) были обязательным элементом античного городского квартала; помпейские cauponae сохранили свинцовые прилавки с подогревом еды и надписи меню.'],
  baths:            [15,  {type:'biome', deposit_key:null, allowed_biomes:['coastal_city','mediterranean_coast','plains']},
    'Термы Агриппы в Риме (25 до н.э.) стали первыми публичными банями; ежедневное посещение терм было социальным ритуалом римского горожанина.'],
  // Production
  workshop:         [15,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Эргастерии — ремесленные мастерские — присутствовали в любом античном городе; крупнейшие афинские мастерские использовали до 120 рабов-ремесленников (Лисий, III в. до н.э.).'],
  mine:             [50,  {type:'deposit', deposit_key:'any', allowed_biomes:[]},
    'Общий термин для рудников разных типов; технология варьировалась от открытых карьеров до глубоких подземных штолен с вентиляцией и насосами.'],
  salt_works:       [15,  {type:'hybrid', deposit_key:'salt_deposit', allowed_biomes:['coastal_city','mediterranean_coast','semi_arid','desert']},
    'Солеварни у западных берегов Сицилии (Марсала) производили соль тысячелетиями; карфагеняне контролировали этот стратегический ресурс до Первой Пунической войны.'],
  lumber_camp:      [20,  {type:'biome', deposit_key:null, allowed_biomes:['temperate_forest','alpine','subtropical','mediterranean_hills']},
    'Леса Неброди и Мадоние на Сицилии заготовляли корабельный лес для флота; Дионисий I организовал промышленную вырубку для 399 до н.э. флотской программы.'],
  pottery_workshop: [12,  {type:'none', deposit_key:null, allowed_biomes:[]},
    'Коринфская и аттическая керамика экспортировалась по всему античному миру; сицилийские гончары Акраганта производили столовую посуду для местных и карфагенских рынков.'],
  oil_press:        [8,   {type:'biome', deposit_key:null, allowed_biomes:['mediterranean_hills','mediterranean_coast','volcanic','subtropical']},
    'Оливковые прессы Аттики производили масло для экспорта; крупная маслобойня использовала тяжёлые каменные жернова и деревянные прессы с верёвочным приводом.'],
  winery:           [10,  {type:'biome', deposit_key:null, allowed_biomes:['mediterranean_hills','volcanic','mediterranean_coast','subtropical','temperate_forest']},
    'Сицилийские вина экспортировались через Карфаген в Африку; Диодор упоминает виноградники Акраганта, дававшие десятки тысяч амфор в год.'],
  sulfur_mine:      [25,  {type:'hybrid', deposit_key:'sulfur_deposit', allowed_biomes:['volcanic']},
    'Сицилийские серные копи у Этны производили дезинфицирующие вещества и зажигательные смеси; монополия острова на серу сохранялась вплоть до XIX века.'],
  tuna_trap:        [12,  {type:'hybrid', deposit_key:'tuna_migration', allowed_biomes:['coastal_city']},
    'Тоннара (ловушка для тунца) в Мессинском проливе — уникальная технология, описанная ещё Страбоном; тысячи тунцов ловились в сезон миграции у берегов Сицилии.'],
  papyrus_bed:      [8,   {type:'biome', deposit_key:null, allowed_biomes:['river_valley','subtropical']},
    'Заросли папируса у Сиракуз (река Анапо) — единственное место в Европе, где рос папирус; небольшое местное производство не покрывало нужд и дополнялось египетским импортом.'],
};

let content = fs.readFileSync('data/buildings.js', 'utf8');

// For each building with missing fields, inject them before the closing `},`
// We'll work building by building using regex insertion

// Find where each building ends (last field before `},`)
// Strategy: find the building id, find the next `},\n` at the top level, insert before it

// Actually: use a simpler text-injection approach
// We'll use Node vm to get the fixed data and then do targeted string replacements

const B = SB.BUILDINGS;

for (const [id, patch] of Object.entries(PATCHES)) {
  const [wpu, locReq, histNote] = patch;
  const bld = B[id];
  if (!bld) { console.error('Building not found:', id); continue; }

  // Build insertion text
  let insert = '';
  if (wpu !== null && !('workers_per_unit' in bld)) {
    insert += `    workers_per_unit: ${wpu},\n`;
  }
  if (!('location_requirement' in bld)) {
    const lr = JSON.stringify(locReq);
    insert += `    location_requirement: ${lr},\n`;
  }
  if (!('historical_note' in bld)) {
    insert += `    historical_note: ${JSON.stringify(histNote)},\n`;
  }

  if (!insert) { console.log(id+': nothing to add'); continue; }

  // Find the building block end: look for `  <id>: {` then find `  },` at same indent
  // Simple approach: find `  <id>: {` and then the next `  },\n` that follows
  const buildingStart = `  ${id}: {`;
  const startIdx = content.indexOf(buildingStart);
  if (startIdx < 0) { console.error('Cannot find building block for', id); continue; }

  // Find the closing `  },` after startIdx
  // It should be at 2-space indent (top-level building close)
  let searchFrom = startIdx + buildingStart.length;
  const closePattern = /\n  },/g;
  closePattern.lastIndex = searchFrom;
  const closeMatch = closePattern.exec(content);
  if (!closeMatch) { console.error('Cannot find closing for', id); continue; }

  // Insert before the closing `},`
  const insertAt = closeMatch.index + 1; // after the \n
  content = content.slice(0, insertAt) + insert + content.slice(insertAt);

  console.log(`${id}: added ${insert.split('\n').filter(Boolean).length} fields`);

  // Update bld to mark fields as present (for future iterations if building id appears twice)
  if (wpu !== null) bld.workers_per_unit = wpu;
  bld.location_requirement = locReq;
  bld.historical_note = histNote;
}

fs.writeFileSync('data/buildings.js', content, 'utf8');
console.log('\ndata/buildings.js written.');
