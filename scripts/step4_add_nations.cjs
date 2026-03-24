#!/usr/bin/env node
// Шаг 4-13: добавляет все 730 недостающих наций в nations.js
const fs = require('fs');
const missing = JSON.parse(fs.readFileSync('/home/user/igra2/scripts/missing_nations.json', 'utf8'));

// Палитра цветов для новых наций
const COLORS = [
  '#8B7355','#7A8B55','#558B7A','#7A558B','#8B5555',
  '#557A8B','#8B7A55','#558B55','#8B558B','#55778B',
  '#9B8B6B','#6B9B8B','#8B6B9B','#9B6B6B','#6B8B9B',
  '#A08060','#60A080','#8060A0','#A06060','#6080A0',
  '#7B9B7B','#9B7B9B','#9B9B7B','#7B9B9B','#9B7B7B',
];

function getColor(idx) {
  return COLORS[idx % COLORS.length];
}

function govType(name) {
  const n = name.toLowerCase();
  if (n.includes('empire') || n.includes('kingdom')) return 'monarchy';
  if (n.includes('republic') || n.includes('league') || n.includes('states')) return 'republic';
  if (n.includes('city')) return 'oligarchy';
  return 'tribal';
}

function makeEntry(name, id, idx) {
  const gov = govType(name);
  return `
    // ─── ${name} ───
    ${id}: {
      name: '${name}',
      color: '${getColor(idx)}',
      flag_emoji: '🏛️',
      is_player: false,
      is_minor: true,
      government: {
        type: '${gov}',
        ruler: { name: '${name} Leader' },
        legitimacy: 50,
        stability: 50,
      },
      regions: [],
      population: { total: 30000, happiness: 50 },
      economy: { treasury: 100, stockpile: {}, trade_routes: [], tax_rate: 0.1 },
      military: { infantry: 1000, cavalry: 100, ships: 0, morale: 50, at_war_with: [] },
      relations: {},
      active_laws: [],
      characters: [],
      historical_note: '${name} — ancient nation (304 BC).',
    },`;
}

// Читаем nations.js и вставляем перед строкой "  market:"
let src = fs.readFileSync('/home/user/igra2/data/nations.js', 'utf8');

const entries = missing.map((m, i) => makeEntry(m.name, m.id, i)).join('\n');

// Вставляем прямо перед блоком market (который идёт после nations)
const marker = '\n  market: {';
const pos = src.indexOf(marker);
if (pos === -1) {
  console.error('Не найден маркер "  market:"!');
  process.exit(1);
}

const newSrc = src.slice(0, pos) + '\n' + entries + src.slice(pos);

fs.writeFileSync('/home/user/igra2/data/nations.js', newSrc);
console.log(`✓ Добавлено ${missing.length} наций в nations.js`);
