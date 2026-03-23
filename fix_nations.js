// fix_nations.js — add missing fields to nations.js
const fs = require('fs'), vm = require('vm');
const SB = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  vm.runInContext(code, SB);
}
load('nations.js');
const nations = SB.INITIAL_GAME_STATE.nations;

// Historical notes for 19 early nations missing it
const HIST_NOTES = {
  syracuse: 'Сиракузы в 304 г. до н.э. — крупнейший греческий город Запада, под властью тирана Агафокла. Город с населением свыше 200 000 человек контролирует большую часть Сицилии и ведёт войну с Карфагеном.',
  rome:     'Рим в 304 г. до н.э. завершает Вторую Самнитскую войну: мир 304 г. до н.э. восстановил границы status quo. Сенат контролирует политику, а нобилитет укрепляет позиции через должности консулов и цензоров.',
  carthage: 'Карфаген в 304 г. до н.э. — торговая империя с контролем над западным Средиземноморьем. Олигархическая республика под управлением Совета ста четырёх, после поражений от Агафокла переживает период восстановления.',
  egypt:    'Птолемеевский Египет при Птолемее I строит новую эллинистическую монархию на древней фараоновой базе. Александрия становится культурной столицей мира; монополии на папирус, зерно и стекло приносят огромные доходы.',
  macedon:  'Македония при Кассандре — один из крупнейших преемников Александра. Кассандр только что убил Роксану и Александра IV, устранив прямых наследников; теперь борьба диадохов продолжается против Антигона Одноглазого.',
  greek_states: 'Греческие полисы в 304 г. до н.э. разделены между сферами влияния диадохов. Большинство крупных городов имеют македонские гарнизоны. Города-государства сохраняют внутреннее самоуправление, но утратили независимость во внешней политике.',
  epirus:   'Эпир при Пирре становится одной из сильнейших держав западных Балкан. Молосское царство постепенно превращается в Эпирский союз, а армия молоссян считается одной из лучших в греческом мире.',
  pergamon: 'Пергам при Филетере — небольшое, но богатое государство в Западной Анатолии. Огромные запасы серебра Лисимаха, которые Филетер взял под охрану, стали основой независимости и будущего расцвета Атталидов.',
  numidia:  'Нумидийские царства в Северной Африке западнее Карфагена. Номинально подчинённые Карфагену, нумидийские вожди пользуются широкой автономией. Лучшая лёгкая конница Средиземноморья.',
  gela:     'Гела — древняя греческая колония на южном побережье Сицилии, основанная родосцами и критянами ок. 688 г. до н.э. Родина тирана Гелона. После разрушений карфагенянами переживает период восстановления.',
  acragas:  'Акрагант (совр. Агридженто) — второй по величине греческий город Сицилии. Знаменит роскошными храмами VI–V вв. до н.э. В 304 г. восстанавливается после карфагенских разрушений 406 г. до н.э.',
  herakleia_minoa: 'Гераклея Минойская — небольшой греческий город на юго-западном побережье Сицилии. Стратегический порт между греческой и карфагенской зонами. Неоднократно менял хозяев в ходе греко-карфагенских войн.',
  selinous: 'Селинунт был разрушен карфагенянами в 409 г. до н.э., но частично заново заселён. Западнейший из греческих городов Сицилии, он всегда балансировал между греческим и карфагенским миром.',
  elymia:   'Элимяне — одни из древнейших жителей западной Сицилии, жившие рядом с карфагенской сферой влияния. Их главные города — Эрикс и Сегеста. Считаются потомками троянских беженцев согласно греческим мифам.',
  sicels:   'Сикелы — индоевропейский народ, давший имя острову Сицилия (Σικελία). Занимали центральную и восточную части острова и постепенно эллинизировались. Их города-государства сохраняли отдельную идентичность.',
  sicani:   'Сиканы — один из древнейших народов Сицилии, обитавший в центральных горных районах. По Фукидиду, они переселились из Иберии. В IV в. до н.э. почти полностью растворились среди сикелов и греков.',
  calactea: 'Калакта (Калатта) — небольшой прибрежный город на севере Сицилии, основанный сикелами и позднее эллинизированный. Служил промежуточным портом между Сиракузами и западом острова.',
  tyndaria: 'Тиндарис — греческая колония на севере Сицилии, основанная Дионисием I около 396 г. до н.э. для поселения мессенских беженцев. Небольшой, но хорошо укреплённый портовый город.',
  neutral:  'Независимые территории охватывают неконтролируемые земли по всему миру — от горных племён до отдалённых островов и пустынных регионов, не входящих в состав ни одной из держав.',
};

// Ruler data for nations missing government.ruler.name
const RULERS = {
  scythians:      { type: 'person',  name: 'Сайтафарн',          personal_power: 65 },
  maurya_empire:  { type: 'person',  name: 'Чандрагупта Маурья', personal_power: 90 },
  parthia:        { type: 'person',  name: 'Андрагор',            personal_power: 55 },
  bactria:        { type: 'person',  name: 'Стасанор',            personal_power: 60 },
  roxolani:       { type: 'council', name: 'Совет вождей',       personal_power: 40 },
  maeotae:        { type: 'council', name: 'Совет племён',        personal_power: 35 },
  saka:           { type: 'person',  name: 'Верховный вождь',     personal_power: 50 },
  iazyges:        { type: 'person',  name: 'Племенной вождь',     personal_power: 45 },
  siraces:        { type: 'person',  name: 'Племенной вождь',     personal_power: 45 },
  aorsi:          { type: 'person',  name: 'Племенной вождь',     personal_power: 50 },
  chorasmia:      { type: 'person',  name: 'Сатрап Хорезма',      personal_power: 50 },
  gedrosia:       { type: 'person',  name: 'Сатрап Гедросии',     personal_power: 45 },
  gandhara:       { type: 'person',  name: 'Наместник Гандхары',  personal_power: 55 },
  qin:            { type: 'person',  name: 'Циньский Чжаосян-ван', personal_power: 80 },
  chu:            { type: 'person',  name: 'Чуский Цинсян-ван',   personal_power: 65 },
  zhao:           { type: 'person',  name: 'Чжаоский Хуйвэнь-ван', personal_power: 70 },
  wei:            { type: 'person',  name: 'Вэйский Чжао-ван',    personal_power: 55 },
  qi:             { type: 'person',  name: 'Циский Минь-ван',     personal_power: 65 },
  han:            { type: 'person',  name: 'Ханьский Сян-ван',    personal_power: 50 },
  yan:            { type: 'person',  name: 'Яньский Чжао-ван',    personal_power: 70 },
  xiongnu:        { type: 'person',  name: 'Тумань',               personal_power: 60 },
  donghu:         { type: 'council', name: 'Совет племён',         personal_power: 40 },
  yuezhi:         { type: 'person',  name: 'Племенной вождь',      personal_power: 50 },
  gojoseon:       { type: 'person',  name: 'Ван Чжун',             personal_power: 55 },
  yayoi_japan:    { type: 'council', name: 'Совет старейшин',      personal_power: 30 },
  gaul:           { type: 'council', name: 'Совет друидов',        personal_power: 35 },
  dacia:          { type: 'person',  name: 'Племенной вождь',      personal_power: 50 },
  illyria:        { type: 'person',  name: 'Главкий',              personal_power: 65 },
  celtiberia:     { type: 'council', name: 'Совет вождей',         personal_power: 35 },
  belgae:         { type: 'council', name: 'Союз вождей',          personal_power: 40 },
  britannia:      { type: 'council', name: 'Совет вождей',         personal_power: 30 },
  germani:        { type: 'council', name: 'Совет воинов',         personal_power: 35 },
  helvetii:       { type: 'council', name: 'Союз племён',          personal_power: 35 },
  getae:          { type: 'person',  name: 'Дромихет',             personal_power: 60 },
  venedia:        { type: 'council', name: 'Совет старейшин',      personal_power: 30 },
  balts:          { type: 'council', name: 'Совет племён',         personal_power: 30 },
  picts:          { type: 'council', name: 'Совет вождей',         personal_power: 30 },
  iberian_coast:  { type: 'council', name: 'Совет торговцев',      personal_power: 40 },
};

// Population total derived from by_profession sums
const POP_TOTAL = {
  scythians:     158000,
  maurya_empire: 3620000,
  qin:           2675000,
  chu:           3225000,
};

let content = fs.readFileSync('data/nations.js', 'utf8');
let fixes = 0;

function injectBeforeClose(id, indent, insertText) {
  // Find `  <id>: {` or `    <id>: {` then the next closing `},` at same indent level
  const startPattern = `${indent}${id}: {`;
  const startIdx = content.indexOf(startPattern);
  if (startIdx < 0) { console.error('Cannot find nation:', id); return false; }

  // Find closing at same indent
  const closePattern = new RegExp(`\\n${indent}\\},`, 'g');
  closePattern.lastIndex = startIdx + startPattern.length;
  const closeMatch = closePattern.exec(content);
  if (!closeMatch) { console.error('Cannot find close for:', id); return false; }

  // Insert before the closing
  const insertAt = closeMatch.index + 1;
  content = content.slice(0, insertAt) + insertText + content.slice(insertAt);
  return true;
}

// Fix 1: Add historical_note to 19 early nations (4-space indent)
for (const [id, note] of Object.entries(HIST_NOTES)) {
  const n = nations[id];
  if (!n) { console.error('Nation not found:', id); continue; }
  if (n.historical_note) { console.log(id+': already has historical_note'); continue; }

  const insert = `      historical_note: ${JSON.stringify(note)},\n`;
  if (injectBeforeClose(id, '    ', insert)) {
    console.log(id+': historical_note added');
    fixes++;
  }
}

// Fix 2: Add government.ruler to nations missing it
// These nations have inline government: { type: "X", stability: N, corruption: M }
// We need to add ruler to the inline object
for (const [id, ruler] of Object.entries(RULERS)) {
  const n = nations[id];
  if (!n) { console.error('Nation not found:', id); continue; }
  if (n.government?.ruler?.name) { console.log(id+': already has ruler'); continue; }

  const rulerStr = `, ruler: { type: ${JSON.stringify(ruler.type)}, name: ${JSON.stringify(ruler.name)}, character_ids: [], personal_power: ${ruler.personal_power} }`;

  // Find `government: { type: "....", stability: N, corruption: M }` for this nation
  // First find the nation block
  const startPattern = `  ${id}: {`;
  const startIdx = content.indexOf(startPattern);
  if (startIdx < 0) { console.error('Cannot find nation block:', id); continue; }

  // Find `government: { ` after startIdx
  const govIdx = content.indexOf('government: {', startIdx);
  if (govIdx < 0 || govIdx > startIdx + 5000) { console.error('Cannot find government for:', id); continue; }

  // Find the closing } of the inline government object
  const govLineEnd = content.indexOf('},', govIdx);
  if (govLineEnd < 0) { console.error('Cannot find govt close for:', id); continue; }

  // Insert ruler before the closing `}`
  content = content.slice(0, govLineEnd) + rulerStr + content.slice(govLineEnd);
  console.log(id+': ruler added');
  fixes++;
}

// Fix 3: Add economy.treasury to nations missing it
// These nations have economy: { gold: N, income_per_turn: M, ... }
for (const id of Object.keys(RULERS)) {
  const n = nations[id];
  if (!n) continue;
  if (n.economy?.treasury !== undefined && n.economy?.treasury !== null) {
    console.log(id+': already has treasury');
    continue;
  }
  const gold = n.economy?.gold || 0;
  const treasury = Math.round(gold * 10);

  // Find `economy: {` after this nation's start
  const startPattern = `  ${id}: {`;
  const startIdx = content.indexOf(startPattern);
  if (startIdx < 0) { console.error('Cannot find nation block for treasury:', id); continue; }

  const econIdx = content.indexOf('economy: {', startIdx);
  if (econIdx < 0 || econIdx > startIdx + 5000) { console.error('Cannot find economy for:', id); continue; }

  // Find opening { and insert treasury right after
  const openBrace = econIdx + 'economy: {'.length;
  const insertStr = `\n      treasury: ${treasury},`;

  // Check if it's a multiline economy or inline
  const nextNewline = content.indexOf('\n', econIdx);
  const nextClose = content.indexOf('}', econIdx + 10);
  const isInline = nextClose < nextNewline;

  if (isInline) {
    // Inline economy object: economy: { gold: N, ... }
    // Insert after the opening {
    content = content.slice(0, openBrace) + ` treasury: ${treasury},` + content.slice(openBrace);
  } else {
    // Multiline: insert after `economy: {\n`
    content = content.slice(0, openBrace) + insertStr + content.slice(openBrace);
  }
  console.log(id+': treasury='+treasury+' added');
  fixes++;
}

// Fix 4: Add population.total for 4 nations
for (const [id, total] of Object.entries(POP_TOTAL)) {
  const n = nations[id];
  if (!n) continue;
  if (n.population?.total) { console.log(id+': already has pop.total'); continue; }

  const startPattern = `  ${id}: {`;
  const startIdx = content.indexOf(startPattern);
  if (startIdx < 0) { console.error('Cannot find nation for pop:', id); continue; }

  const popIdx = content.indexOf('population: {', startIdx);
  if (popIdx < 0) { console.error('Cannot find population for:', id); continue; }

  const openBrace = popIdx + 'population: {'.length;
  content = content.slice(0, openBrace) + `\n      total: ${total},` + content.slice(openBrace);
  console.log(id+': population.total='+total+' added');
  fixes++;
}

console.log('\nTotal fixes:', fixes);
fs.writeFileSync('data/nations.js', content, 'utf8');
console.log('data/nations.js written.');
