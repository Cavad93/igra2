// fix_nations_clean.js — safe line-by-line approach
// Avoids broken text manipulation; uses per-nation precise line-based edits
const fs = require('fs'), vm = require('vm');
const SB = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  vm.runInContext(code, SB);
}
load('nations.js');
const nations = SB.INITIAL_GAME_STATE.nations;

// ────────────────────────────────────────────────────────────────────────────
// Data for nations missing fields
// ────────────────────────────────────────────────────────────────────────────

const HIST_NOTES = {
  syracuse: 'Сиракузы в 304 г. до н.э. — крупнейший греческий город Запада, под властью тирана Агафокла. Город контролирует большую часть Сицилии и ведёт войну с Карфагеном.',
  rome:     'Рим в 304 г. до н.э. завершает Вторую Самнитскую войну. Сенат контролирует политику, нобилитет укрепляет позиции через должности консулов и цензоров.',
  carthage: 'Карфаген в 304 г. до н.э. — торговая империя Западного Средиземноморья. После поражений от Агафокла переживает период восстановления.',
  egypt:    'Птолемеевский Египет при Птолемее I строит эллинистическую монархию. Александрия становится культурной столицей мира.',
  macedon:  'Македония при Кассандре — один из крупнейших преемников Александра. Кассандр устранил прямых наследников и борется за власть с Антигоном.',
  greek_states: 'Греческие полисы разделены между сферами влияния диадохов. Большинство крупных городов имеют македонские гарнизоны.',
  epirus:   'Эпир при Пирре становится одной из сильнейших держав западных Балкан.',
  pergamon: 'Пергам при Филетере — небольшое богатое государство в Западной Анатолии. Серебро Лисимаха стало основой его независимости.',
  numidia:  'Нумидийские царства в Северной Африке западнее Карфагена. Лучшая лёгкая конница Средиземноморья.',
  gela:     'Гела — древняя греческая колония на южном побережье Сицилии. После разрушений карфагенянами переживает восстановление.',
  acragas:  'Акрагант (совр. Агридженто) — второй по величине греческий город Сицилии, знаменитый храмами VI–V вв. до н.э.',
  herakleia_minoa: 'Гераклея Минойская — стратегический портовый город между греческой и карфагенской зонами Сицилии.',
  selinous: 'Селинунт был разрушен в 409 г. до н.э. и частично восстановлен. Западнейший греческий город Сицилии.',
  elymia:   'Элимяне — древнейшие жители западной Сицилии, главные города Эрикс и Сегеста.',
  sicels:   'Сикелы — индоевропейский народ, давший имя острову. Занимали центральную и восточную Сицилию, постепенно эллинизировались.',
  sicani:   'Сиканы — один из древнейших народов Сицилии, обитавший в горных районах. Почти растворились среди сикелов и греков.',
  calactea: 'Калакта — небольшой прибрежный город на севере Сицилии, промежуточный порт между Сиракузами и западом острова.',
  tyndaria: 'Тиндарис — греческая колония на севере Сицилии, основанная Дионисием I около 396 г. до н.э.',
  neutral:  'Независимые территории охватывают неконтролируемые земли по всему миру, не входящие в состав ни одной из держав.',
};

const RULERS = {
  scythians:      { type: 'person',  name: 'Сайтафарн',            personal_power: 65 },
  maurya_empire:  { type: 'person',  name: 'Чандрагупта Маурья',   personal_power: 90 },
  parthia:        { type: 'person',  name: 'Андрагор',              personal_power: 55 },
  bactria:        { type: 'person',  name: 'Стасанор',              personal_power: 60 },
  roxolani:       { type: 'council', name: 'Совет вождей',          personal_power: 40 },
  maeotae:        { type: 'council', name: 'Совет племён',           personal_power: 35 },
  saka:           { type: 'person',  name: 'Племенной вождь',        personal_power: 50 },
  iazyges:        { type: 'person',  name: 'Племенной вождь',        personal_power: 45 },
  siraces:        { type: 'person',  name: 'Племенной вождь',        personal_power: 45 },
  aorsi:          { type: 'person',  name: 'Племенной вождь',        personal_power: 50 },
  chorasmia:      { type: 'person',  name: 'Сатрап Хорезма',         personal_power: 50 },
  gedrosia:       { type: 'person',  name: 'Сатрап Гедросии',        personal_power: 45 },
  gandhara:       { type: 'person',  name: 'Наместник Гандхары',     personal_power: 55 },
  qin:            { type: 'person',  name: 'Циньский Чжаосян-ван',  personal_power: 80 },
  chu:            { type: 'person',  name: 'Чуский Цинсян-ван',     personal_power: 65 },
  zhao:           { type: 'person',  name: 'Чжаоский Хуйвэнь-ван',  personal_power: 70 },
  wei:            { type: 'person',  name: 'Вэйский Чжао-ван',      personal_power: 55 },
  qi:             { type: 'person',  name: 'Циский Минь-ван',        personal_power: 65 },
  han:            { type: 'person',  name: 'Ханьский Сян-ван',       personal_power: 50 },
  yan:            { type: 'person',  name: 'Яньский Чжао-ван',      personal_power: 70 },
  xiongnu:        { type: 'person',  name: 'Тумань',                 personal_power: 60 },
  donghu:         { type: 'council', name: 'Совет племён',            personal_power: 40 },
  yuezhi:         { type: 'person',  name: 'Племенной вождь',        personal_power: 50 },
  gojoseon:       { type: 'person',  name: 'Ван Чжун',               personal_power: 55 },
  yayoi_japan:    { type: 'council', name: 'Совет старейшин',        personal_power: 30 },
  gaul:           { type: 'council', name: 'Совет вождей',           personal_power: 35 },
  dacia:          { type: 'person',  name: 'Дромихет',               personal_power: 60 },
  illyria:        { type: 'person',  name: 'Главкий',                personal_power: 65 },
  celtiberia:     { type: 'council', name: 'Совет вождей',           personal_power: 35 },
  belgae:         { type: 'council', name: 'Союз вождей',            personal_power: 40 },
  britannia:      { type: 'council', name: 'Совет вождей',           personal_power: 30 },
  germani:        { type: 'council', name: 'Совет воинов',           personal_power: 35 },
  helvetii:       { type: 'council', name: 'Союз племён',            personal_power: 35 },
  getae:          { type: 'person',  name: 'Дромихет',               personal_power: 60 },
  venedia:        { type: 'council', name: 'Совет старейшин',        personal_power: 30 },
  balts:          { type: 'council', name: 'Совет племён',           personal_power: 30 },
  picts:          { type: 'council', name: 'Совет вождей',           personal_power: 30 },
  iberian_coast:  { type: 'council', name: 'Совет торговцев',        personal_power: 40 },
};

const POP_TOTAL = {
  scythians:     158000,
  maurya_empire: 3620000,
  qin:           2675000,
  chu:           3225000,
};

// ────────────────────────────────────────────────────────────────────────────
// Line-by-line approach: process lines array safely
// ────────────────────────────────────────────────────────────────────────────

const lines = fs.readFileSync('data/nations.js', 'utf8').split('\n');
const result = [];
let currentNation = null;
let inNationBlock = false;
let nationIndent = null;
let braceDepth = 0;

// Track which line each nation definition starts at
// We'll process line by line, looking for nation definitions and their fields

// Strategy: find lines that define nations, then find the end of each nation block
// to inject missing fields

// First, figure out which nation each line belongs to by finding nation boundaries
// Build a map: nationId → { startLine, endLine }

// Parse nations structure manually
function findNationBoundaries(lines) {
  const boundaries = {};
  // Look for patterns like `  <id>: {` or `    <id>: {`
  const nationIds = new Set(Object.keys(nations));

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Check if this line starts a nation
    const match = line.match(/^(\s+)(\w+): \{/);
    if (match) {
      const id = match[2];
      if (nationIds.has(id)) {
        const indent = match[1];
        // Find the matching closing `},` at the same indent level
        let depth = 0;
        let j = i;
        while (j < lines.length) {
          const l = lines[j];
          depth += (l.match(/\{/g) || []).length;
          depth -= (l.match(/\}/g) || []).length;
          if (j > i && depth <= 0) {
            boundaries[id] = { start: i, end: j };
            break;
          }
          j++;
        }
      }
    }
    i++;
  }
  return boundaries;
}

const boundaries = findNationBoundaries(lines);

// Now process each nation that needs fixing
// We'll build a set of line-level insertions

const insertions = {}; // lineNum → [string] to insert after that line

function addInsertion(lineNum, text) {
  if (!insertions[lineNum]) insertions[lineNum] = [];
  insertions[lineNum].push(text);
}

let totalFixes = 0;

for (const [id, n] of Object.entries(nations)) {
  const b = boundaries[id];
  if (!b) { console.error('No boundary for:', id); continue; }

  const needHist = !n.historical_note && HIST_NOTES[id];
  const needRuler = !n.government?.ruler?.name && RULERS[id];
  const needTreasury = typeof n.economy?.treasury !== 'number' && typeof n.economy?.gold === 'number';
  const needPopTotal = !n.population?.total && POP_TOTAL[id];
  const needTaxRate = typeof n.economy?.tax_rate !== 'number' || n.economy.tax_rate <= 0 || n.economy.tax_rate >= 1;
  const needLeg = typeof n.government?.legitimacy !== 'number';
  const needStab = typeof n.government?.stability !== 'number';

  if (!needHist && !needRuler && !needTreasury && !needPopTotal && !needTaxRate && !needLeg && !needStab) continue;

  // Find specific line numbers within the nation block
  const startLine = b.start;
  const endLine = b.end;
  const indent = lines[startLine].match(/^(\s+)/)?.[1] || '  ';
  const innerIndent = indent + '  ';

  // Add historical_note just before endLine
  if (needHist) {
    addInsertion(endLine - 1, `${innerIndent}historical_note: ${JSON.stringify(HIST_NOTES[id])},`);
    console.log(id+': historical_note added');
    totalFixes++;
  }

  // Find government line and add ruler, legitimacy, stability
  for (let li = startLine; li <= endLine; li++) {
    const line = lines[li];
    if (line.includes('government:') && line.includes('{')) {
      // Check if it's an inline government object (all on one line)
      const closingBrace = line.lastIndexOf('}');
      const openingBrace = line.indexOf('{');

      if (closingBrace > openingBrace) {
        // Inline government object - modify the line directly
        let govContent = line.slice(0, closingBrace);
        const suffix = line.slice(closingBrace); // `},` or `}`

        if (needLeg) {
          const govType = n.government?.type || 'oligarchy';
          const leg = govType === 'monarchy' ? 65 : govType === 'empire' ? 70 : govType === 'tribal' ? 45 : 55;
          govContent += `, legitimacy: ${leg}`;
        }
        if (needStab) {
          const govType = n.government?.type || 'oligarchy';
          const stab = govType === 'monarchy' ? 60 : govType === 'empire' ? 65 : govType === 'tribal' ? 45 : 50;
          govContent += `, stability: ${stab}`;
        }
        if (needRuler) {
          const r = RULERS[id];
          govContent += `, ruler: { type: ${JSON.stringify(r.type)}, name: ${JSON.stringify(r.name)}, character_ids: [], personal_power: ${r.personal_power} }`;
        }
        lines[li] = govContent + suffix;
        if (needLeg || needStab || needRuler) {
          console.log(id+': govt fields added (inline)');
          totalFixes++;
        }
      } else {
        // Multiline government - add after the line
        let ins = '';
        if (needLeg) {
          const leg = 55;
          ins += `${innerIndent}  legitimacy: ${leg},\n`;
        }
        if (needStab) {
          ins += `${innerIndent}  stability: 50,\n`;
        }
        if (needRuler) {
          const r = RULERS[id];
          ins += `${innerIndent}  ruler: { type: ${JSON.stringify(r.type)}, name: ${JSON.stringify(r.name)}, character_ids: [], personal_power: ${r.personal_power} },\n`;
        }
        if (ins) {
          addInsertion(li, ins.trimEnd());
          console.log(id+': govt fields added (multiline)');
          totalFixes++;
        }
      }
      break;
    }
  }

  // Find economy line and add treasury and/or tax_rate
  for (let li = startLine; li <= endLine; li++) {
    const line = lines[li];
    if (line.includes('economy:') && line.includes('{')) {
      const closingBrace = line.lastIndexOf('}');
      const openingBrace = line.indexOf('{');

      if (closingBrace > openingBrace) {
        // Inline economy object
        let econContent = line.slice(0, closingBrace);
        const suffix = line.slice(closingBrace);

        if (needTreasury) {
          const treasury = Math.round((n.economy.gold || 0) * 10);
          econContent += `, treasury: ${treasury}`;
        }
        if (needTaxRate) {
          econContent += `, tax_rate: 0.10`;
        }
        lines[li] = econContent + suffix;
        if (needTreasury || needTaxRate) {
          console.log(id+': economy fields added (inline)');
          totalFixes++;
        }
      } else {
        // Multiline economy - find next line after `economy: {`
        let ins = '';
        if (needTreasury) {
          const treasury = Math.round((n.economy?.gold || 0) * 10);
          ins += `${innerIndent}  treasury: ${treasury},`;
        }
        if (needTaxRate) {
          ins += (ins ? '\n' : '') + `${innerIndent}  tax_rate: 0.10,`;
        }
        if (ins) {
          addInsertion(li, ins);
          console.log(id+': economy fields added (multiline after line)');
          totalFixes++;
        }
      }
      break;
    }
  }

  // Find population line and add total
  if (needPopTotal) {
    for (let li = startLine; li <= endLine; li++) {
      const line = lines[li];
      if (line.includes('population:') && line.includes('{')) {
        const closingBrace = line.lastIndexOf('}');
        const openingBrace = line.indexOf('{');
        if (closingBrace > openingBrace) {
          // Inline - add total
          let popContent = line.slice(0, closingBrace);
          const suffix = line.slice(closingBrace);
          popContent += `, total: ${POP_TOTAL[id]}`;
          lines[li] = popContent + suffix;
        } else {
          addInsertion(li, `${innerIndent}  total: ${POP_TOTAL[id]},`);
        }
        console.log(id+': population.total added');
        totalFixes++;
        break;
      }
    }
  }
}

// Apply insertions in reverse order to preserve line numbers
const insertionLines = Object.keys(insertions).map(Number).sort((a,b) => b-a);
for (const lineNum of insertionLines) {
  const toInsert = insertions[lineNum];
  lines.splice(lineNum + 1, 0, ...toInsert);
}

console.log('\nTotal fix operations:', totalFixes);

// Validate by loading the result
const content = lines.join('\n');
const SB2 = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
try {
  vm.runInContext(content.replace(/^const /mg,'var ').replace(/^let /mg,'var '), SB2);
  const nations2 = SB2.INITIAL_GAME_STATE.nations;
  let errors = 0;
  for (const [id, n] of Object.entries(nations2)) {
    if (!n.government?.ruler?.name) { /* optional field */ }
    if (typeof n.economy?.treasury !== 'number') { /* optional */ }
    if (!n.historical_note && ['syracuse','rome','carthage'].includes(id)) { errors++; console.error('STILL no hist_note:', id); }
    if (typeof n.economy?.tax_rate !== 'number' || n.economy.tax_rate <= 0 || n.economy.tax_rate >= 1) { errors++; console.error('STILL tax_rate:', id, n.economy?.tax_rate); }
    if (typeof n.government?.legitimacy !== 'number') { errors++; console.error('STILL legitimacy:', id); }
    if (typeof n.government?.stability !== 'number') { errors++; console.error('STILL stability:', id); }
  }
  if (errors === 0) console.log('Post-fix validation: OK');
  else console.error('Remaining issues:', errors);
} catch(e) {
  console.error('Parse error:', e.message);
}

fs.writeFileSync('data/nations.js', content, 'utf8');
console.log('data/nations.js written.');
