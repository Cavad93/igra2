// ══════════════════════════════════════════════════════════════════════
// BATTALION — класс данных юнита (arma.md Шаг 16)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Описывает один батальон на тактической карте: позицию, сторону,
// тип войск, здоровье, формацию, состояние выделения.
//
// Экспортирует:
//   Battalion                — класс.
//   createTestBattalions()   → Array<Battalion> (2 ally + 2 enemy).
//   BATTALION_SIDES          — ['ally', 'enemy'].
//   BATTALION_UNIT_TYPES     — ['infantry', 'cavalry', 'archers', 'cannon'].
//   BATTALION_FORMATIONS     — ['line', 'square', 'skirmish'].
//
// Контракт (arma.md Шаг 16):
//   new Battalion({ id, x, y, side, unitType, health, maxHealth, formation })
//   Поля:
//     id          — уникальный string ('ally_1', 'enemy_2', …)
//     x, y        — позиция на карте (координаты heightmap, число)
//     side        — 'ally' | 'enemy'
//     unitType    — 'infantry' | 'cavalry' | 'archers' | 'cannon'
//     health      — текущее HP (0..maxHealth)
//     maxHealth   — максимальное HP
//     formation   — 'line' | 'square' | 'skirmish'
//     isSelected  — boolean (выбран игроком), по умолчанию false
//   Методы:
//     isAlive()            — вернуть health > 0.
//     takeDamage(amount)   — уменьшить health, нижняя граница 0.
//
// Тест Шага 16:
//   - new Battalion({...}).isAlive() → true при health > 0.
//   - battalion.takeDamage(200) → battalion.health == 0, не отрицательное.
//   - battalion.side должен быть 'ally' или 'enemy'.
// ══════════════════════════════════════════════════════════════════════

export var BATTALION_SIDES      = ['ally', 'enemy'];
export var BATTALION_UNIT_TYPES = ['infantry', 'cavalry', 'archers', 'cannon'];
export var BATTALION_FORMATIONS = ['line', 'square', 'skirmish'];

function _includes(arr, v) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true;
  return false;
}

export function Battalion(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('Battalion: options object is required');
  }

  // id — непустая строка
  if (typeof opts.id !== 'string' || opts.id.length === 0) {
    throw new Error('Battalion: id must be a non-empty string');
  }

  // x, y — конечные числа
  if (typeof opts.x !== 'number' || !isFinite(opts.x)) {
    throw new Error('Battalion: x must be a finite number');
  }
  if (typeof opts.y !== 'number' || !isFinite(opts.y)) {
    throw new Error('Battalion: y must be a finite number');
  }

  // side
  if (!_includes(BATTALION_SIDES, opts.side)) {
    throw new Error('Battalion: side must be one of ' + BATTALION_SIDES.join('|'));
  }

  // unitType
  if (!_includes(BATTALION_UNIT_TYPES, opts.unitType)) {
    throw new Error('Battalion: unitType must be one of ' + BATTALION_UNIT_TYPES.join('|'));
  }

  // maxHealth — положительное число
  if (typeof opts.maxHealth !== 'number' || !isFinite(opts.maxHealth) || opts.maxHealth <= 0) {
    throw new Error('Battalion: maxHealth must be a positive finite number');
  }

  // health — конечное число, клампится в [0, maxHealth]
  if (typeof opts.health !== 'number' || !isFinite(opts.health)) {
    throw new Error('Battalion: health must be a finite number');
  }

  // formation
  if (!_includes(BATTALION_FORMATIONS, opts.formation)) {
    throw new Error('Battalion: formation must be one of ' + BATTALION_FORMATIONS.join('|'));
  }

  this.id         = opts.id;
  this.x          = opts.x;
  this.y          = opts.y;
  this.side       = opts.side;
  this.unitType   = opts.unitType;
  this.maxHealth  = opts.maxHealth;
  // clamp health в [0, maxHealth]
  var h = opts.health;
  if (h < 0) h = 0;
  if (h > opts.maxHealth) h = opts.maxHealth;
  this.health     = h;
  this.formation  = opts.formation;
  this.isSelected = false;
}

Battalion.prototype.isAlive = function() {
  return this.health > 0;
};

Battalion.prototype.takeDamage = function(amount) {
  if (typeof amount !== 'number' || !isFinite(amount)) return this.health;
  if (amount < 0) amount = 0;
  var next = this.health - amount;
  if (next < 0) next = 0;
  this.health = next;
  return this.health;
};

// ────────────────────────────────────────────────────────────────
// Тестовые батальоны — 2 ally + 2 enemy, разных типов и позиций.
// Используется только в тестах и в dev-сборках.
// ────────────────────────────────────────────────────────────────
export function createTestBattalions() {
  return [
    new Battalion({
      id:        'ally_1',
      x:         40,
      y:         60,
      side:      'ally',
      unitType:  'infantry',
      health:    100,
      maxHealth: 100,
      formation: 'line'
    }),
    new Battalion({
      id:        'ally_2',
      x:         60,
      y:         70,
      side:      'ally',
      unitType:  'archers',
      health:    80,
      maxHealth: 80,
      formation: 'skirmish'
    }),
    new Battalion({
      id:        'enemy_1',
      x:         140,
      y:         60,
      side:      'enemy',
      unitType:  'cavalry',
      health:    120,
      maxHealth: 120,
      formation: 'line'
    }),
    new Battalion({
      id:        'enemy_2',
      x:         150,
      y:         80,
      side:      'enemy',
      unitType:  'cannon',
      health:    60,
      maxHealth: 60,
      formation: 'square'
    })
  ];
}

// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

