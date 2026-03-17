// Товары, базовые цены и параметры производства
const GOODS = {
  wheat: {
    name: 'Пшеница',
    name_gen: 'пшеницы',
    base_price: 10,
    unit: 'бушель',
    category: 'food',
    // какие профессии производят этот товар
    producers: ['farmers'],
    // основной товар питания
    is_food: true,
    icon: '🌾',
  },
  fish: {
    name: 'Рыба',
    name_gen: 'рыбы',
    base_price: 15,
    unit: 'амфора',
    category: 'food',
    producers: ['sailors', 'fishermen'],
    is_food: true,
    icon: '🐟',
  },
  olives: {
    name: 'Оливки',
    name_gen: 'оливок',
    base_price: 20,
    unit: 'амфора',
    category: 'food',
    producers: ['farmers'],
    is_food: false,      // вторичный продукт
    icon: '🫒',
  },
  wine: {
    name: 'Вино',
    name_gen: 'вина',
    base_price: 30,
    unit: 'амфора',
    category: 'luxury',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🍷',
  },
  iron: {
    name: 'Железо',
    name_gen: 'железа',
    base_price: 45,
    unit: 'талант',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '⚙️',
  },
  timber: {
    name: 'Древесина',
    name_gen: 'древесины',
    base_price: 22,
    unit: 'воз',
    category: 'material',
    producers: ['farmers'],
    is_food: false,
    icon: '🪵',
  },
  cloth: {
    name: 'Ткань',
    name_gen: 'ткани',
    base_price: 25,
    unit: 'тюк',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🧵',
  },
  salt: {
    name: 'Соль',
    name_gen: 'соли',
    base_price: 18,
    unit: 'мешок',
    category: 'essential',
    producers: ['merchants'],
    is_food: false,
    is_essential: true,    // нужна всему населению
    icon: '🧂',
  },
  tools: {
    name: 'Инструменты',
    name_gen: 'инструментов',
    base_price: 35,
    unit: 'комплект',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🔨',
  },
  slaves: {
    name: 'Рабы',
    name_gen: 'рабов',
    base_price: 200,
    unit: 'человек',
    category: 'labor',
    producers: ['merchants'],
    is_food: false,
    icon: '⛓️',
  },
};

// Производство каждого региона по типу
// Коэффициенты показывают единиц товара на 1000 жителей данной профессии
const REGION_PRODUCTION_BASE = {
  coastal_city: {
    fish:    { per: 'sailors',    rate: 120 },
    cloth:   { per: 'craftsmen',  rate: 80 },
    tools:   { per: 'craftsmen',  rate: 40 },
    wine:    { per: 'craftsmen',  rate: 30 },
    salt:    { per: 'merchants',  rate: 50 },
  },
  plains: {
    wheat:   { per: 'farmers',   rate: 200 },
    olives:  { per: 'farmers',   rate: 50 },
    timber:  { per: 'farmers',   rate: 30 },
  },
  hills: {
    wheat:   { per: 'farmers',   rate: 100 },
    olives:  { per: 'farmers',   rate: 80 },
    wine:    { per: 'craftsmen', rate: 60 },
    iron:    { per: 'craftsmen', rate: 40 },
  },
  mountains: {
    iron:    { per: 'craftsmen', rate: 80 },
    timber:  { per: 'farmers',  rate: 60 },
    tools:   { per: 'craftsmen',rate: 20 },
  },
  river_valley: {
    wheat:   { per: 'farmers',  rate: 250 },
    cloth:   { per: 'craftsmen',rate: 70 },
  },
};
