// fix_nations2.js — add missing tax_rate, legitimacy, stability to all nations
const fs = require('fs'), vm = require('vm');
const SB = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  vm.runInContext(code, SB);
}
load('nations.js');
const nations = SB.INITIAL_GAME_STATE.nations;

let content = fs.readFileSync('data/nations.js', 'utf8');
let fixes = 0;

// Default values by government type
function defaultLegitimacy(type) {
  const m = { monarchy: 65, republic: 60, oligarchy: 55, tyranny: 50, tribal: 45, empire: 70, democracy: 60, satrapy: 55 };
  return m[type] || 55;
}
function defaultStability(type) {
  const m = { monarchy: 60, republic: 55, oligarchy: 55, tyranny: 50, tribal: 45, empire: 65, democracy: 58, satrapy: 50 };
  return m[type] || 50;
}

for (const [id, n] of Object.entries(nations)) {
  const needTaxRate  = typeof n.economy?.tax_rate !== 'number' || n.economy.tax_rate <= 0 || n.economy.tax_rate >= 1;
  const needLeg      = typeof n.government?.legitimacy !== 'number';
  const needStab     = typeof n.government?.stability !== 'number';

  if (!needTaxRate && !needLeg && !needStab) continue;

  // Find this nation's block in content
  // Nations can be at 4-space or 2-space indent depending on when they were added
  let nationStartIdx = -1;
  for (const indent of ['    ', '  ']) {
    const pat = `${indent}${id}: {`;
    const idx = content.indexOf(pat);
    if (idx >= 0) { nationStartIdx = idx; break; }
  }
  if (nationStartIdx < 0) { console.error('Cannot find:', id); continue; }
  const nationSearchEnd = nationStartIdx + 3000; // search within 3000 chars

  // Fix government legitimacy and stability
  if (needLeg || needStab) {
    const govIdx = content.indexOf('government: {', nationStartIdx);
    if (govIdx < 0 || govIdx > nationSearchEnd) { console.error('Cannot find govt for:', id); continue; }

    const govType = n.government?.type || 'oligarchy';
    const leg = defaultLegitimacy(govType);
    const stab = defaultStability(govType);

    // Find closing } of government inline object
    // The government object can be inline or multiline
    const govStart = govIdx + 'government: {'.length;

    // Check if inline (closing } on same line)
    const govLineEnd = content.indexOf('\n', govIdx);
    const govClose = content.indexOf('}', govIdx + 13);
    const isInline = govClose < govLineEnd;

    let toInsert = '';
    if (needLeg) toInsert += `, legitimacy: ${leg}`;
    if (needStab) toInsert += `, stability: ${stab}`;

    if (isInline) {
      // Inline government: insert before the first `}` after opening
      content = content.slice(0, govClose) + toInsert + content.slice(govClose);
    } else {
      // Multiline: find a good insertion point after the last field
      // Insert before the `}` that closes the government object
      // Find `\n    },` or `\n  },` after govStart
      let closePos = content.indexOf('\n', govStart);
      // Keep looking for the closing `},` at the indent level
      const closePat = /\n\s{4,8}\},?/g;
      closePat.lastIndex = govStart;
      const m = closePat.exec(content);
      if (m && m.index < nationSearchEnd + govIdx) {
        content = content.slice(0, m.index + 1) + `      ${toInsert.slice(2)},\n` + content.slice(m.index + 1);
      } else {
        console.error('Cannot find govt close for multiline:', id);
        continue;
      }
    }
    console.log(`${id}: added${needLeg?' legitimacy':''}${needStab?' stability':''}`);
    fixes++;
  }

  // Re-find the nation start since content may have shifted
  nationStartIdx = -1;
  for (const indent of ['    ', '  ']) {
    const pat = `${indent}${id}: {`;
    const idx = content.indexOf(pat);
    if (idx >= 0) { nationStartIdx = idx; break; }
  }
  if (nationStartIdx < 0) { console.error('Cannot re-find:', id); continue; }

  // Fix tax_rate
  if (needTaxRate) {
    const econIdx = content.indexOf('economy: {', nationStartIdx);
    if (econIdx < 0 || econIdx > nationStartIdx + 3000) { console.error('Cannot find economy for:', id); continue; }

    const econStart = econIdx + 'economy: {'.length;
    const econLineEnd = content.indexOf('\n', econIdx);
    const econClose = content.indexOf('}', econIdx + 10);
    const isInline = econClose < econLineEnd;

    if (isInline) {
      // Insert tax_rate after opening {
      content = content.slice(0, econStart) + ` tax_rate: 0.10,` + content.slice(econStart);
    } else {
      // Multiline: insert after {
      content = content.slice(0, econStart) + `\n      tax_rate: 0.10,` + content.slice(econStart);
    }
    console.log(`${id}: added tax_rate`);
    fixes++;
  }
}

console.log('\nTotal fixes:', fixes);

// Validate
const SB2 = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
const code2 = content.replace(/^const /mg,'var ').replace(/^let /mg,'var ');
vm.runInContext(code2, SB2);
const nations2 = SB2.INITIAL_GAME_STATE.nations;
let errors = 0;
for (const [id, n] of Object.entries(nations2)) {
  if (typeof n.economy?.tax_rate !== 'number' || n.economy.tax_rate <= 0 || n.economy.tax_rate >= 1) {
    console.error('STILL: tax_rate', id); errors++;
  }
  if (typeof n.government?.legitimacy !== 'number') { console.error('STILL: legitimacy', id); errors++; }
  if (typeof n.government?.stability !== 'number') { console.error('STILL: stability', id); errors++; }
}
if (errors === 0) console.log('Post-fix validation: OK');
else console.error('Remaining errors:', errors);

fs.writeFileSync('data/nations.js', content, 'utf8');
console.log('data/nations.js written.');
