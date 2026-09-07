# SKILL: Ancient Strategy — дизайн-система интерфейса

Инструкция для AI-ассистента, работающего над UI игры **Ancient Strategy (igra2 / Syracuse 301 BC)**.
Подключай этот файл в контекст при любой задаче по интерфейсу. Источник истины — код репозитория
(`ui/styles/*.css`, `ui/*.js`), визуальный справочник — `Ancient Strategy — Design System.dc.html`.

---

## 1. Художественная идея

«Тёмный базальт и античное золото». Интерфейс — археологический артефакт: стелы, диптихи,
вощёные таблички, монетные штампы. Один акцент — золото. Насыщенный цвет = только семантика
(доход/расход/тревога). Тирский пурпур `#4a1942` зарезервирован для исключительного:
победа, катастрофа, судьбоносный выбор. НИКОГДА не использовать пурпур в рядовом UI.

## 2. Токены (ui/styles/base.css → :root)

```css
/* Поверхности */
--bg-deep: #131110;    --bg-panel: #1e1b16;   --bg-section: #262118;
--bg-hover: #2e2820;   --bg-overlay: rgba(13,11,9,.82);  --sea: #0f1a24;
/* Бордюры */
--border-main: #3d3020; --border-light: #5a4830; --border-gold: #7a6030;
/* Акценты */
--gold: #c9a961; --gold-dim: #8a6e3a; --gold-bright: #e8c97a;
--bronze: #8c6e4f; --bronze-dark: #5a4535; --purple: #4a1942;
/* Текст */
--text-primary: #ebe0d1; --text-secondary: #a89070; --text-dim: #6a5840; --text-gold: #c9a961;
/* Семантика (фоны тёмные, текст светлый) */
--positive: #3a6b3a (текст #81c784);  --negative: #8b2020 (текст #ef9a9a);
--warning: #7a5020 (текст #ffb74d);
/* Размеры */
--panel-w: 260px; --header-h: 42px; --footer-h: 32px; --panel-radius: 6px;
```

Полупрозрачное золото (де-факто стандарт до токенизации R2):
фоны `rgba(107,79,26,.15–.55)`, ховеры `rgba(212,168,83,.08–.25)`.

## 3. Типографика

| Роль | Шрифт | Где |
|---|---|---|
| `--font-display` | Cinzel (700/900) | имена, заголовки панелей, названия наций, letter-spacing .06–.2em |
| `--font-ui` | Inter | весь интерфейс, 13px базовый |
| `--font-data` | JetBrains Mono | ЛЮБЫЕ числа: ресурсы, даты, проценты |
| `--font-lore` | IM Fell English italic | хроники, письма, манускрипты |

Шкала: 10 / 12 / 13 / 15 / 18 / 24 / 32. Межстрочные: 1.2 / 1.5 / 1.8 (лор).
Числа никогда не набираются Inter'ом — только mono. Заголовки Cinzel — всегда uppercase или small-caps с трекингом.

## 4. Иконография

`ui/icons.js` — «монетный штамп»: viewBox 20×20, stroke=currentColor 1.5, fill:none,
linecap/linejoin round. Новые иконки строго в этом стиле.
Эмодзи разрешены ТОЛЬКО в игровом контенте (товары 🌾, события, портреты-заглушки),
запрещены в хроме (кнопки, навигация, ресурсы топ-бара — см. R4).

## 5. Рецепты компонентов

- **Панель**: bg `--bg-panel`, border 1–2px `--border-gold`, radius 6; заголовок Cinzel
  15px gold по центру с нижней линией. Текстура greek_vase (opacity .07) + меандровые углы 40px (opacity .55).
- **Секция**: bg `--bg-section`, border `--border-gold`, radius 2, padding 8;
  заголовок 11px uppercase gold с подчёркиванием `rgba(107,79,26,.4)`.
- **Кнопка первичная**: gradient `#3a2508→#221508`, border `--border-gold`, текст gold,
  hover: `#5a3510→#3a2008` + border `--gold-bright`. Disabled: opacity .4.
- **Кнопка опасная**: bg `#3a0a0a`, border `#8B2020`, текст `#ff8a65`.
- **Строка данных (.stat-row)**: label 11px `--text-dim` слева, значение mono bold справа;
  итог отделяется линией `rgba(107,79,26,.3)`.
- **Бар**: track `rgba(20,12,4,.8)` + border `rgba(107,79,26,.4)`, radius 2–3, высота 4–10px;
  заливки-градиенты: легитимность `#9C27B0→#E040FB`, лояльность `#1B5E20→#43A047`, мораль `#B71C1C→#8b2020`.
- **Тултип**: bg `rgba(13,10,5,.95)`, border gold, имя Cinzel 13 gold; строка разведки —
  через dashed-линию, цвет по уровню (0 `#7a6a48` / 1 `#c9a566` / 2 `#8ec07c`).
- **Тост**: bg `rgba(20,15,8,.96)`, border-left 3px по типу (info gold / warning / danger / success), blur 6px, слайд справа.
- **Модалка**: `--bg-overlay` + blur; box: bg-panel, border 1–2px gold, radius 4–8, shadow `0 8px 40px rgba(0,0,0,.7)`.
- **Скроллбар**: thin, thumb `--border-gold`.
- **kbd**: mono 11px gold, bg `rgba(0,0,0,.5)`, border gold, radius 3.

## 6. Карта (ui/map.js — Tabula Peutingeriana)

- Море `--sea #0f1a24`; Ocean `#14202c`, Strait `#16263a`, Lake `#1c3045`, Impassible — умбра `#5a4a32`.
- Цвет региона = `tabulaRegionColor(nationId)` — хэш нации → охристая гамма; граница = fill затемнённый на 55%.
- Выделение: stroke `#c9a961` 2.5px, fillOpacity .92. Оккупация: fill оригинала + dashed 6 3 цвета захватчика.
- Туман: уровень 0 — тёмная заливка (использовать тёплый `#241e17`, не чёрный), уровень 1 — вуаль `#0a0804` op .28.
- Режимы: political / economy / military / population (хоткеи 1–4); переключатель — сетка 2×2 в правой панели.
- Зум-тиры: strategic <4 (армии 18px, без цифр), regional, detailed >6.5 (маршруты ×2, гарнизоны, мини-постройки).
- Подписи: города Cinzel uppercase 9–12px с тёмной обводкой; моря — italic `rgba(140,180,210,.4)`, трекинг .2em.
- Торговые маршруты: dashed 4 10, анимация stroke-dashoffset 1s; grain `#a5d6a7`, metal `#b0bec5`, luxury `#ce93d8`, general gold, world `#64b5f6`. Уважать prefers-reduced-motion.

## 7. Каркас экрана

```
top-bar 42px:  стела (правитель + греч. месяц) | аквидукт ресурсов (иконка+поток+число+дельта) | действия + Rota Historiae 44px
main:          диптих TABVLAE (48px торец / 280px открыт) | карта | правая панель 260px (двор: камеи+ростер, режимы карты)
bottom 32px:   лог-полоска (точки категорий + IM Fell строка + ▲Хроники) | ввод 580px (приказы + дощечка + печать)
```
Оверлеи — fixed поверх карты, z-index 1000+. Панель региона — 310px, fixed справа от карты.

## 8. Карта файлов UI

| Область | Файлы |
|---|---|
| Токены/резет | ui/styles/base.css |
| Шапка | ui/styles/top.css, ui/clepsydra.js, ui/ambient.js |
| Панели/модалки | ui/styles/panels.css, ui/panels.js, ui/panel_resize.js |
| Карта | ui/styles/map.css, ui/map.js, ui/map_armies.js, ui/map_events.js, ui/map_event_feed.js, ui/map_ai_indicators.js |
| Регион | ui/styles/regions.css, ui/region_build_tab.js, ui/region_compare.js |
| Экономика | ui/styles/economy.css, ui/economy_react.jsx (⚠ inline-стили, чужая палитра — R1), ui/economy_tab.js |
| Дипломатия | ui/styles/diplomacy.css, ui/diplomacy_tab.js, ui/diplo_graph.js, ui/peace_panel.js |
| Правительство | ui/styles/government.css, ui/government_tab.js |
| Население | ui/styles/population.css, ui/population_tab.js |
| Персонажи | ui/styles/characters.css, ui/portrait*.js |
| Бой | ui/styles/battle.css, ui/battle_map_pixi.js, ui/battle_pixi_render.js, ui/tactical_map.js |
| Низ/лог | ui/styles/bottom.css, ui/log.js, ui/input.js |
| Splash | ui/styles/splash.css, ui/boot.js (initSplash) |

Новые стили — в соответствующий `.css`, НЕ инлайном и НЕ в index.html.
Новый модуль: `import * as _x` + `_reg(_x)` в ui/boot.js; вызовы между модулями через `window.X`.

## 9. Инварианты движка (для UI-работ с данными)

- Казна мутируется только через `mutateTreasury(nation, delta, source)`; товары — `recordMaterialFlow(..., bucket)`.
- `region.connections` есть ТОЛЬКО в `MAP_REGIONS`, не в `GAME_STATE.regions`.
- 1 ед. товара = 1 кг (`CONFIG.UNIT_KG`); лошади/скот — головы; рабы — люди. Ход = месяц; 12 ходов = год.
- Порядок тика: turn.js → processTurn(): договоры → стройка → контроль провинций → **runEconomyTick()** →
  займы → правительство → … → аудит денег/товаров → сейв → renderAll.
- runEconomyTick: pop_eff → капзакупки (local→province→national→world) → рабы → производство
  (рецепты→выпуск→роутинг×спец×цикл×tech) → провинц. рынок → потребление (голод!) → порча →
  финансы зданий → зарплаты → цены (3 зоны) → классовые капиталы → автостройка → торговля+казна → законы → ext.
- ~600 stub-наций пропускаются в тяжёлых шагах — не ломать `_isStubNation`.

## 10. Чек-лист нового экрана

1. Палитра — только токены base.css; никакого своего золота/зелени.
2. Числа — JetBrains Mono; заголовок — Cinzel uppercase с трекингом; лор-текст — IM Fell italic.
3. Оверлей: bg-overlay + blur, панель bg-panel + border-gold, закрытие ✕ и Esc.
4. Семантические цвета только для смысла; позитив/негатив — приглушённые фоны, светлый текст.
5. Ховеры: `rgba(212,168,83,.08–.25)`; transition .15s.
6. Скроллбары thin gold; шкала радиусов 2/3/4/6/8 (R5).
7. Эмодзи — только контент; иконки хрома — монетный штамп.
8. Тексты интерфейса — по-русски; латынь — для антуража (TABVLAE, Iube Stratege…).
9. Не перекрывать карту без нужды; панели складные; z-index по таблице (тултипы 9000+, модалки 1100–2000).
10. Пурпур — не трогать.
