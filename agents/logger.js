// agents/logger.js — цветной консольный логгер

const RESET  = '\x1b[0m';
const GREY   = '\x1b[90m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';

export function log(msg)  { console.log(`${GREY}${msg}${RESET}`); }
export function ok(msg)   { console.log(`${GREEN}✓ ${msg}${RESET}`); }
export function err(msg)  { console.log(`${RED}✗ ${msg}${RESET}`); }
export function warn(msg) { console.log(`${YELLOW}⚠ ${msg}${RESET}`); }

export function progress(current, total, good) {
  console.log(`${GREY}[${current}/${total}]${RESET} ${good}`);
}
