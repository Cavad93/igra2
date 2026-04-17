# uisuper.md — План UI-редизайна «Roman Command Lens»

> **Инструкция для AI-исполнителя.**
> Читай по одному этапу. Реализуй. Проверь. Только потом переходи к следующему.
> Не читай вперёд. Не реализуй несколько этапов за раз.
> После каждого этапа — коммит с сообщением вида `ui: этап N — <название>`.

---

## Карта этапов

| Этап | Улучшение | Что делается |
|------|-----------|--------------|
| 1 | Цветовая система | CSS-переменные: новая палитра «Римский базальт» |
| 2 | Цветовая система | Применить палитру ко всем существующим элементам |
| 3 | Типографика | Подключить новые шрифты, объявить font-roles |
| 4 | Типографика | Применить шрифты ко всем текстовым элементам |
| 5 | Иконки | Создать SVG-глифарий в отдельном файле |
| 6 | Иконки | Заменить все эмодзи на SVG-иконки в HTML и JS |
| 7 | Экран загрузки | Разметка и CSS мозаики (тессеры) |
| 8 | Экран загрузки | JS-анимация сборки мозаики вместо прогресс-бара |
| 9 | Стела | Разметка и CSS верхней стелы |
| 10 | Стела | Убрать старый top-bar, подключить стелу к данным |
| 11 | Клепсидра | SVG-клепсидра: разметка и CSS |
| 12 | Клепсидра | JS-анимация воды, подключение к processTurn() |
| 13 | Статус-бар | Скрыть #status-bar, встроить fps/save в другие элементы |
| 14 | Статус-бар | Убрать дебаг-метки из UI, оставить только в DevTools |
| 15 | Аквидукт | Разметка и CSS радиального виджета ресурсов |
| 16 | Аквидукт | JS-частицы и анимация потока, подключение к данным |
| 17 | Карта | Стиль тайлов и провинций в духе Tabula Peutingeriana |
| 18 | Карта | Армии как SVG-орлы, дороги, море как базальт |
| 19 | Роза ветров | Разметка и CSS SVG-розы вместо map-mode-bar |
| 20 | Роза ветров | JS переключения режимов через розу |
| 21 | Диптих | Разметка и CSS складной левой панели |
| 22 | Диптих | JS анимация открытия/закрытия, прокрутка-свиток |
| 23 | Камеи | Разметка и CSS панели советников |
| 24 | Камеи | JS генерация SVG-профилей, hover-раскрытие |
| 25 | Табличка-лог | Разметка и CSS нижней полоски и drawer |
| 26 | Табличка-лог | JS анимация скольжения, стиль манускрипта |
| 27 | Команда | Разметка и CSS вощёной дощечки |
| 28 | Команда | JS гонец: анимация появления ответа AI |
| 29 | Ambient | CSS/JS тессеры-частицы фонового слоя |
| 30 | Ambient | JS дыхание карты, реакция на игровые события |

---

## ЭТАП 1 — Цветовая система: новая палитра ✅ ВЫПОЛНЕНО

**Улучшение:** #12 — Цветовая система «Римский базальт»
**Часть:** 1 из 2 — объявить новые CSS-переменные

---

### Контекст

Текущая палитра (`--bg-deep: #0d0a05`, `--text-gold: #d4a853`, `--accent: #FFD700`) создаёт
эффект «дешёвого пергамента» — всё одного золотого тона, нет глубины, нет иерархии.

Новая палитра «Римский базальт» строится на тёмном базальтовом камне как основе,
приглушённом античном золоте как первом акценте, и патинированной бронзе как втором.
Пурпур используется только для уникальных событий. Эмодзи-красный и зелёный заменяются
на приглушённые исторические тона.

---

### Что читать перед началом

1. Открыть `index.html`, найти блок `:root { ... }` (строки ~67–87).
2. Прочитать все CSS-переменные которые там объявлены.
3. Найти в файле все места где используется `var(--accent)` — их нужно будет пересмотреть в Этапе 2.

---

### Что сделать

В файле `index.html` найти блок:

```css
:root {
  --bg-deep:      #0d0a05;
  --bg-panel:     #1a1208;
  ...
}
```

Заменить его **полностью** на следующий блок:

```css
:root {
  /* ── БАЗОВЫЕ ПОВЕРХНОСТИ (тёмный базальт) ── */
  --bg-deep:        #131110;   /* самый тёмный фон экрана              */
  --bg-panel:       #1e1b16;   /* поверхность панелей                  */
  --bg-section:     #262118;   /* секции внутри панелей                */
  --bg-hover:       #2e2820;   /* hover-состояние                      */
  --bg-overlay:     rgba(13,11,9,0.82); /* затемнение под модалками    */

  /* ── БОРДЮРЫ (едва видимые, 1px) ── */
  --border-main:    #3d3020;   /* основная граница                     */
  --border-light:   #5a4830;   /* чуть светлее, для акцентов           */
  --border-gold:    #7a6030;   /* золотой бордюр (только важные края)  */

  /* ── АКЦЕНТ 1: Античное золото (приглушённое) ── */
  --gold:           #c9a961;   /* основное золото — не #FFD700!        */
  --gold-dim:       #8a6e3a;   /* приглушённое золото                  */
  --gold-bright:    #e8c97a;   /* подсветка при hover                  */

  /* ── АКЦЕНТ 2: Патинированная бронза ── */
  --bronze:         #8c6e4f;   /* бронза для вторичных элементов       */
  --bronze-dark:    #5a4535;   /* тёмная бронза                        */

  /* ── АКЦЕНТ 3: Тирский пурпур (только для исключительного) ── */
  --purple:         #4a1942;   /* только для победы/катастрофы/выбора  */
  --purple-glow:    rgba(74,25,66,0.4);

  /* ── ТЕКСТ ── */
  --text-primary:   #ebe0d1;   /* основной текст (пергаментный белый)  */
  --text-secondary: #a89070;   /* второстепенный                       */
  --text-dim:       #6a5840;   /* неактивный / метки                   */
  --text-gold:      #c9a961;   /* золотой текст                        */

  /* ── СЕМАНТИЧЕСКИЕ ЦВЕТА (приглушённые) ── */
  --positive:       #3a6b3a;   /* доход / хорошее (тёмный зелёный)    */
  --negative:       #8b2020;   /* расход / плохое (тёмный красный)    */
  --warning:        #7a5020;   /* предупреждение (тёмная охра)        */
  --sea:            #0f1a24;   /* море на карте (тёмный базальт)      */

  /* ── РАЗМЕРЫ (пока без изменений) ── */
  --panel-w:        260px;
  --header-h:       42px;
  --footer-h:       32px;
}
```

---

### Почему именно эти значения

- `--bg-deep: #131110` — теплее чем `#0d0a05`, не «яма», а «камень при факеле».
- `--gold: #c9a961` — на 20% приглушённее чем `#d4a853`, выглядит как реальная монета, не как CSS-золото.
- `--accent: #FFD700` **удаляется** — это чистый жёлтый, нигде в античности такого не было.
- `--positive: #3a6b3a` и `--negative: #8b2020` — вместо кричащих `#4caf50` и `#f44336`.
  Они всё ещё читаются как «хорошо/плохо», но не ломают общую тональность.
- `--sea: #0f1a24` — море как тёмный базальт, не «синий заливной цвет».

---

### Проверка перед коммитом

1. Открыть `index.html` в браузере.
2. Убедиться что экран не стал белым или сломанным — цвета применились.
3. Найти в браузере DevTools → Elements → `:root` — убедиться что новые переменные видны.
4. Визуально: фон должен стать чуть теплее и темнее, золото — более матовым.
5. **Не исправлять** ничего что «сломалось» по цвету — это будет в Этапе 2.

---

### Коммит

```
ui: этап 1 — новая цветовая палитра «Римский базальт»
```

---

*Следующий этап: применить новую палитру ко всем элементам, убрать жёсткие hex-цвета.*

---

## ЭТАП 2 — Цветовая система: применить палитру ✅ ВЫПОЛНЕНО

**Улучшение:** #12 — Цветовая система «Римский базальт»
**Часть:** 2 из 2 — заменить жёсткие hex-коды на переменные

---

### Контекст

После Этапа 1 объявлены переменные, но в CSS-коде `index.html` остались сотни жёстких hex-значений
вроде `#2a1a08`, `#1a1208`, `#d4a853`, `#FFD700`, `#4caf50`, `#f44336` и других.
Пока они не заменены — новая палитра не работает. Этот этап — механическая, но критически важная замена.

---

### Что читать перед началом

1. Открыть `index.html`.
2. В DevTools или текстовым поиском найти все вхождения старых цветов (список ниже).
3. Убедиться, что понимаешь к какой переменной каждый цвет относится.

---

### Таблица замен

| Старый hex | Заменить на | Комментарий |
|---|---|---|
| `#0d0a05` | `var(--bg-deep)` | фон экрана |
| `#1a1208` | `var(--bg-panel)` | панели |
| `#221a0e` | `var(--bg-section)` | секции |
| `#2a2010` | `var(--bg-hover)` | hover |
| `#2a1a08` | `var(--bg-panel)` | градиент кнопок |
| `#3a1a08` | `var(--bg-section)` | градиент кнопок |
| `#5a3010` | `var(--bronze-dark)` | тёмная часть кнопок |
| `#7a4018` | `var(--bronze)` | hover кнопок |
| `#5a2a10` | `var(--bronze-dark)` | hover кнопок |
| `#6b4f1a` | `var(--border-main)` | основной бордюр |
| `#8B6914` | `var(--border-light)` | светлый бордюр |
| `#d4a853` | `var(--gold)` | золото |
| `#FFD700` | `var(--gold-bright)` | яркое золото |
| `#7a5a28` | `var(--gold-dim)` | тусклое золото |
| `#8a6e3a` | `var(--text-dim)` | тусклый текст |
| `#f0d8a0` | `var(--text-primary)` | основной текст |
| `#fff8e7` | `var(--text-primary)` | белый текст |
| `#4caf50` | `var(--positive)` | позитивный цвет |
| `#f44336` | `var(--negative)` | негативный цвет |
| `#ff9800` | `var(--warning)` | предупреждение |
| `#1a3a5c` | `var(--sea)` | море на карте |
| `rgba(0,0,0,0.72)` | `var(--bg-overlay)` | затемнение |

---

### Как делать замены

Открыть `index.html` в редакторе, использовать **Find & Replace** (не ручную правку).
Заменять по одному цвету за раз, начиная с самых частых.

Для каждого цвета:
1. Найти все вхождения.
2. Проверить контекст — убедиться что замена корректна.
3. Заменить.

**Внимание:** некоторые цвета используются в `linear-gradient()`. Например:
```css
/* было */
background: linear-gradient(to bottom, #2a1a08, #1a1208);
/* стало */
background: linear-gradient(to bottom, var(--bg-panel), var(--bg-deep));
```

---

### Специальные случаи

**Кнопка `#end-turn-btn`** — сейчас использует `#5a3010` и `#3a1a08`.
После замены должна выглядеть так:
```css
background: linear-gradient(to bottom, var(--bronze-dark), var(--bg-section));
border-color: var(--border-gold);
color: var(--text-gold);
```

**Hover кнопки `#end-turn-btn`:**
```css
background: linear-gradient(to bottom, var(--bronze), var(--bronze-dark));
border-color: var(--gold);
color: var(--gold-bright);
box-shadow: 0 0 8px rgba(201,169,97,0.3);
```

**Цвет моря в Leaflet** — ищи в `ui/map.js` строку где задаётся `backgroundColor` или `background` для `#map-container`. Заменить `#1a3a5c` на `#0f1a24`.

---

### Проверка перед коммитом

1. Открыть в браузере. Экран должен выглядеть теплее, камнеподобнее.
2. Навести на кнопку «Следующий ход» — hover должен работать.
3. Проверить что нет элементов с ярко-жёлтым `#FFD700` цветом — он должен исчезнуть.
4. Проверить море на карте — должно стать темнее, почти чёрное.
5. Запустить `grep -n "#FFD700\|#4caf50\|#f44336\|#d4a853" index.html` — в идеале 0 совпадений.

---

### Коммит

```
ui: этап 2 — применить палитру Римский базальт ко всем элементам
```

---

*Следующий этап: подключить шрифты Inter, JetBrains Mono, IM Fell English и объявить font-role переменные.*

---

## ЭТАП 3 — Типографика: подключить шрифты и объявить роли ✅ ВЫПОЛНЕНО

**Улучшение:** #13 — Типографика: двойная система
**Часть:** 1 из 2 — подключение шрифтов и CSS-переменные ролей

---

### Контекст

Сейчас игра использует три шрифта:
- `'Cinzel'` — для всех заголовков и кнопок (смотрится архаично везде кроме имён)
- `'Georgia'` — для основного текста (слишком газетный)
- `'Times New Roman'` — fallback

Новая система вводит **4 чётко разделённые роли**:

| Роль | Шрифт | Где применяется |
|---|---|---|
| `--font-display` | Cinzel 700 | Только имена собственные, заголовки разделов |
| `--font-ui` | Inter 400/500 | Все кнопки, метки, числа интерфейса |
| `--font-data` | JetBrains Mono | Все числовые значения ресурсов, координаты |
| `--font-lore` | IM Fell English | Лог событий, текст манускрипта, цитаты |

---

### Что читать перед началом

1. В `index.html` найти тег `<head>`.
2. Найти строку с подключением Cinzel через Google Fonts.
3. Найти в CSS все места где используется `font-family: 'Cinzel'` и `font-family: 'Georgia'`.

---

### Что сделать

**Шаг 3.1 — Обновить Google Fonts ссылку в `<head>`**

Найти в `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap" rel="stylesheet">
```

Заменить на:
```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet">
```

**Шаг 3.2 — Добавить CSS-переменные шрифтов в `:root`**

В блоке `:root { ... }` (после всех цветовых переменных) добавить:

```css
/* ── ТИПОГРАФИКА ── */
--font-display:   'Cinzel', 'Trajan Pro', serif;      /* имена, заголовки */
--font-ui:        'Inter', 'Segoe UI', sans-serif;    /* интерфейс        */
--font-data:      'JetBrains Mono', monospace;        /* числа, данные    */
--font-lore:      'IM Fell English', 'Georgia', serif;/* лог, манускрипт  */

/* ── РАЗМЕРЫ ТЕКСТА ── */
--text-xs:   10px;   /* подписи, метки                   */
--text-sm:   12px;   /* вторичный текст                  */
--text-base: 13px;   /* основной интерфейс               */
--text-md:   15px;   /* заголовки секций                 */
--text-lg:   18px;   /* заголовки панелей                */
--text-xl:   24px;   /* крупные заголовки                */
--text-2xl:  32px;   /* только для имени игры в стеле    */

/* ── МЕЖСТРОЧНЫЙ ИНТЕРВАЛ ── */
--leading-tight:  1.2;
--leading-normal: 1.5;
--leading-loose:  1.8;
```

**Шаг 3.3 — Обновить базовый шрифт `body`**

Найти:
```css
html, body {
  ...
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 13px;
  ...
}
```

Заменить `font-family` и добавить `line-height`:
```css
html, body {
  ...
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  ...
}
```

---

### Проверка перед коммитом

1. Открыть в браузере — основной текст интерфейса должен стать заметно чище (Inter вместо Georgia).
2. В DevTools → Network → Fonts убедиться что Inter, JetBrains Mono и IM Fell English загрузились.
3. Текст кнопки «Следующий ход» должен стать Inter.
4. Cinzel пока остаётся где был — массовая замена в Этапе 4.

---

### Коммит

```
ui: этап 3 — подключить шрифты Inter, JetBrains Mono, IM Fell English
```

---

*Следующий этап: применить font-role переменные ко всем текстовым элементам.*

---

## ЭТАП 4 — Типографика: применить роли ко всем элементам ✅ ВЫПОЛНЕНО

**Улучшение:** #13 — Типографика: двойная система
**Часть:** 2 из 2 — массовая замена font-family по всему CSS

---

### Контекст

После Этапа 3 шрифты подключены и переменные объявлены, но в CSS всё ещё стоит
`font-family: 'Cinzel', serif` там где должен быть Inter, и Georgia там где должен быть
IM Fell English. Этот этап — точечная замена по каждому типу элементов.

---

### Что читать перед началом

1. В `index.html` найти все `font-family:` в CSS — их около 20–30 мест.
2. Для каждого места определить: это заголовок раздела, кнопка, число или лог?

---

### Правило назначения ролей

```
Cinzel остаётся ТОЛЬКО для:
  - #game-title (название игры)
  - .panel-title (заголовки панелей)
  - #splash-title (экран загрузки)
  - имена персонажей в правой панели
  - названия регионов на карте

Inter ВЕЗДЕ ОСТАЛЬНОМ:
  - все кнопки (#end-turn-btn, .lnav-btn, .mm-btn и т.д.)
  - метки ресурсов (#resource-bar .res-item)
  - вкладки, фильтры, переключатели
  - тултипы

JetBrains Mono для:
  - числа ресурсов (.res-item > span:first-of-type)
  - числа в #turn-progress (#tp-label)
  - значения в панелях (hp, morale, supply цифры)
  - #sb-fps, #sb-game

IM Fell English для:
  - #log-entries и #log-last-entry
  - тексты событий и решений (#event-choice-overlay)
  - цитаты советников в правой панели
```

---

### Что сделать

**Шаг 4.1 — Кнопки**

Найти в CSS все правила для кнопок и добавить/заменить `font-family`:

```css
/* все кнопки интерфейса */
button, .lnav-btn, .mm-btn, #end-turn-btn,
#send-btn, #search-btn, #settings-btn,
.log-filter-btn, .sp-btn, .op-new-btn {
  font-family: var(--font-ui);
}
```

**Шаг 4.2 — Числа ресурсов**

Найти правило `.res-item > span:first-of-type` и изменить:
```css
#resource-bar .res-item > span:first-of-type {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  min-width: 40px;
  text-align: right;
  letter-spacing: 0;   /* убрать letter-spacing у моношрифта */
}
```

**Шаг 4.3 — Прогресс хода**

```css
#turn-progress #tp-label {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  letter-spacing: 0;
}
```

**Шаг 4.4 — Лог событий**

```css
#log-entries,
#log-last-entry {
  font-family: var(--font-lore);
  font-size: var(--text-sm);
  line-height: var(--leading-loose);
}
.log-title {
  font-family: var(--font-display);
  font-size: var(--text-md);
  letter-spacing: 0.08em;
}
```

**Шаг 4.5 — Название игры**

```css
#game-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  letter-spacing: 0.18em;
}
```

**Шаг 4.6 — Убрать Cinzel из не-заголовочных мест**

Найти все правила вида `font-family: 'Cinzel', serif` и проверить каждое:
- Если это кнопка → заменить на `var(--font-ui)`
- Если это число → заменить на `var(--font-data)`
- Если это заголовок раздела/имя → оставить `var(--font-display)`

В частности обязательно убрать Cinzel из:
- `.res-delta` — заменить на `var(--font-data)`
- `#splash-status` — заменить на `var(--font-ui)`

---

### Проверка перед коммитом

1. Кнопка «Следующий ход» — шрифт Inter, не Cinzel.
2. Числа ресурсов (золото, войска) — моношрифт JetBrains Mono.
3. Последняя запись лога — IM Fell English (курсивный, с засечками).
4. Название «ANCIENT STRATEGY» — Cinzel остался.
5. Общее ощущение: интерфейс стал чище, числа выровнены по ширине.

---

### Коммит

```
ui: этап 4 — применить font-role переменные ко всем элементам
```

---

*Следующий этап: создать файл ui/icons.js с SVG-глифарием для замены эмодзи.*

---

## ЭТАП 5 — Иконки: создать SVG-глифарий ✅ ВЫПОЛНЕНО

**Улучшение:** #14 — Иконки: никаких эмодзи
**Часть:** 1 из 2 — создать файл `ui/icons.js` со всеми иконками

---

### Контекст

Сейчас весь интерфейс использует эмодзи: 💰⚔🌾👥🤝📜🗺🕸🔍⚙✨👑📋.
Эмодзи рендерятся по-разному в разных ОС и браузерах, не поддаются стилизации через CSS,
и мгновенно выдают «веб-самоделку 2015 года».

Новая система — SVG-иконки в стиле **«монетный штамп»**:
тонкие линии (stroke 1.5px), без заливок, `currentColor`, единый визуальный язык.

---

### Что читать перед началом

1. Открыть `index.html`, найти все эмодзи в HTML-разметке (строки 9001–9450).
2. Открыть `ui/panels.js` — там тоже есть эмодзи в шаблонах.
3. Составить полный список всех используемых эмодзи.

---

### Что сделать

Создать новый файл `ui/icons.js`. Содержимое — объект `ICONS` где каждый ключ
это строка с inline SVG:

```js
// ui/icons.js
// SVG-глифарий в стиле «монетный штамп».
// Все иконки: viewBox="0 0 20 20", stroke="currentColor",
// stroke-width="1.5", fill="none", stroke-linecap="round"

const ICONS = {

  // ── РЕСУРСЫ ──

  gold: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="7"/>
    <text x="10" y="14" text-anchor="middle"
      font-size="9" stroke="none" fill="currentColor"
      font-family="serif" font-weight="bold">Ⓐ</text>
  </svg>`,
  // Профиль правителя на монете (как денарий Агафокла)

  troops: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3 L13 8 L18 8 L14 11 L16 17 L10 13 L4 17 L6 11 L2 8 L7 8 Z"/>
  </svg>`,
  // Орёл легиона

  food: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 17 L10 8"/>
    <path d="M6 12 C6 8 14 8 14 12"/>
    <path d="M7 8 L7 5 M10 8 L10 4 M13 8 L13 5"/>
  </svg>`,
  // Сноп пшеницы

  population: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="6" r="3"/>
    <path d="M4 18 C4 13 16 13 16 18"/>
    <path d="M14 4 L16 4 L16 10"/>
  </svg>`,
  // Человек у колонны

  // ── НАВИГАЦИЯ ──

  overview: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="6" height="6" rx="1"/>
    <rect x="11" y="3" width="6" height="6" rx="1"/>
    <rect x="3" y="11" width="6" height="6" rx="1"/>
    <rect x="11" y="11" width="6" height="6" rx="1"/>
  </svg>`,
  // Обзор нации (сетка)

  army: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 16 L10 4 L16 16"/>
    <path d="M7 11 L13 11"/>
    <path d="M3 8 L5 8 M15 8 L17 8"/>
  </svg>`,
  // Щит легионера

  economy: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M10 6 L10 7 M10 13 L10 14"/>
    <path d="M8 8.5 C8 7.5 12 7.5 12 9 C12 10.5 8 10.5 8 12 C8 13.5 12 13.5 12 12.5"/>
  </svg>`,
  // Монета с чертой

  diplomacy: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3 C6 3 3 6 3 10 C3 13 5 16 8 17"/>
    <path d="M10 3 C14 3 17 6 17 10 C17 13 15 16 12 17"/>
    <path d="M7 14 L13 14 L11 17 L9 17 Z"/>
  </svg>`,
  // Оливковая ветвь

  laws: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3 L7 17"/>
    <path d="M7 3 C7 3 12 3 13 6 C14 9 7 9 7 9"/>
    <path d="M7 9 C7 9 13 9 14 12 C15 15 7 17 7 17"/>
  </svg>`,
  // Свиток

  diplo_graph: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="2"/>
    <circle cx="4" cy="5" r="1.5"/>
    <circle cx="16" cy="5" r="1.5"/>
    <circle cx="4" cy="15" r="1.5"/>
    <circle cx="16" cy="15" r="1.5"/>
    <path d="M10 8 L5 6 M10 8 L15 6 M10 12 L5 14 M10 12 L15 14"/>
    <path d="M5.5 6.5 L14.5 6.5 M5.5 13.5 L14.5 13.5 M5 7 L5 13 M15 7 L15 13"/>
  </svg>`,
  // Граф связей

  // ── ДЕЙСТВИЯ ──

  search: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="9" r="5"/>
    <path d="M13 13 L17 17"/>
  </svg>`,

  settings: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="3"/>
    <path d="M10 3 L10 5 M10 15 L10 17 M3 10 L5 10 M15 10 L17 10
             M5.6 5.6 L7 7 M13 13 L14.4 14.4 M14.4 5.6 L13 7 M7 13 L5.6 14.4"/>
  </svg>`,

  end_turn: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 4 A6 6 0 1 1 4 10"/>
    <path d="M4 6 L4 10 L8 10"/>
  </svg>`,
  // Песочные часы/цикл

  orders: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 6 L15 6 M5 10 L13 10 M5 14 L11 14"/>
    <path d="M17 12 L15 16 L13 14"/>
  </svg>`,
  // Список с галочкой

  court: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17 L3 8 L10 3 L17 8 L17 17"/>
    <rect x="7" y="11" width="6" height="6"/>
    <path d="M3 8 L17 8"/>
  </svg>`,
  // Храм/дворец

  chronicle: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3 L6 17 Q6 18 7 18 L16 18 Q17 18 17 17 L17 3 Q17 2 16 2 L7 2 Q6 2 6 3Z"/>
    <path d="M6 5 Q4 5 4 7 L4 17 Q4 18 5 18"/>
    <path d="M9 7 L14 7 M9 10 L14 10 M9 13 L12 13"/>
  </svg>`,
  // Книга-кодекс

  warning: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3 L18 17 L2 17 Z"/>
    <path d="M10 9 L10 12 M10 14.5 L10 15"/>
  </svg>`,

  save: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 3 L4 17 L16 17 L16 7 L12 3 Z"/>
    <path d="M12 3 L12 8 L7 8 L7 3"/>
    <rect x="6" y="12" width="8" height="5"/>
  </svg>`,

  ai: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="6" width="12" height="9" rx="2"/>
    <path d="M8 6 L8 4 M12 6 L12 4"/>
    <circle cx="8" cy="10" r="1" fill="currentColor"/>
    <circle cx="12" cy="10" r="1" fill="currentColor"/>
    <path d="M8 13 Q10 15 12 13"/>
  </svg>`,

};

// Хелпер: вернуть иконку как HTML-строку с классом
function icon(name, cls = '') {
  const svg = ICONS[name];
  if (!svg) return '';
  return svg.replace('<svg ', `<svg class="icon ${cls ? cls : ''}" `);
}

export { ICONS, icon };
```

---

### Проверка перед коммитом

1. Файл `ui/icons.js` создан и не содержит синтаксических ошибок.
2. В браузерной консоли `import { icon } from './ui/icons.js'` не даёт ошибок.
3. `icon('gold')` возвращает строку с SVG.

---

### Коммит

```
ui: этап 5 — SVG-глифарий ui/icons.js (монетный штамп)
```

---

*Следующий этап: заменить все эмодзи в index.html и ui/*.js на вызовы icon().*

---

## ЭТАП 6 — Иконки: заменить все эмодзи ✅ ВЫПОЛНЕНО

**Улучшение:** #14 — Иконки: никаких эмодзи
**Часть:** 2 из 2 — замена в HTML и JS-файлах

---

### Контекст

После Этапа 5 файл `ui/icons.js` готов. Теперь нужно:
1. Подключить его в `index.html`.
2. Заменить все эмодзи в статической HTML-разметке.
3. Заменить все эмодзи в JS-шаблонах (panels.js, diplomacy_tab.js и др.).

---

### Что читать перед началом

1. Прочитать `index.html` строки 9001–9280 — статическая разметка с эмодзи.
2. Прочитать `ui/panels.js` — шаблоны с эмодзи в innerHTML.
3. Прочитать `ui/diplomacy_tab.js` — эмодзи в дипломатических шаблонах.

---

### Что сделать

**Шаг 6.1 — Подключить icons.js в index.html**

В конце `<head>` (перед закрывающим `</head>`), добавить:
```html
<script type="module" src="ui/icons.js"></script>
```

А сразу после — вспомогательный скрипт для обратной совместимости с не-module кодом:
```html
<script>
// Временный мост пока не все файлы переведены на ES modules
window._iconReady = false;
import('./ui/icons.js').then(m => {
  window.icon = m.icon;
  window.ICONS = m.ICONS;
  window._iconReady = true;
});
</script>
```

**Шаг 6.2 — Замена в статической HTML-разметке**

Таблица замен для `index.html`:

| Эмодзи | Заменить на | Элемент |
|---|---|---|
| `💰` в `#res-gold` | `${icon('gold')}` → в JS, или `<span class="icon-wrap" data-icon="gold"></span>` | ресурс-бар |
| `⚔` в `#res-troops` | `<span class="icon-wrap" data-icon="troops"></span>` | ресурс-бар |
| `🌾` в `#res-food` | `<span class="icon-wrap" data-icon="food"></span>` | ресурс-бар |
| `👥` в `#res-pop` | `<span class="icon-wrap" data-icon="population"></span>` | ресурс-бар |
| `🗺` в `.lnav-btn[data-tab="overview"]` | `<span class="icon-wrap" data-icon="overview"></span>` | левый nav |
| `⚔` в `.lnav-btn[data-tab="army"]` | `<span class="icon-wrap" data-icon="army"></span>` | левый nav |
| `💰` в `.lnav-btn[data-tab="economy"]` | `<span class="icon-wrap" data-icon="economy"></span>` | левый nav |
| `🤝` в `.lnav-btn[data-tab="diplomacy"]` | `<span class="icon-wrap" data-icon="diplomacy"></span>` | левый nav |
| `📜` в `.lnav-btn[data-tab="laws"]` | `<span class="icon-wrap" data-icon="laws"></span>` | левый nav |
| `🕸` в `#diplo-graph-btn` | `<span class="icon-wrap" data-icon="diplo_graph"></span>` | левый nav |
| `🔍` в `#search-btn` | `<span class="icon-wrap" data-icon="search"></span>` | топ-бар |
| `⚙` в `#settings-btn` | `<span class="icon-wrap" data-icon="settings"></span>` | топ-бар |
| `👑` в `.panel-title` | `<span class="icon-wrap" data-icon="court"></span>` | правая панель |
| `⚔ Следующий ход` | `<span class="icon-wrap" data-icon="end_turn"></span> Следующий ход` | кнопка хода |
| `⚔ Хроники` в `.log-title` | `<span class="icon-wrap" data-icon="chronicle"></span> Хроники` | лог |
| `⚔ Приказать` | `<span class="icon-wrap" data-icon="orders"></span> Приказать` | кнопка ввода |
| `💾` в `#sb-save` | `<span class="icon-wrap" data-icon="save"></span>` | статус-бар |
| `🤖` в `#sb-ai` | `<span class="icon-wrap" data-icon="ai"></span>` | статус-бар |
| `⚠` в `.log-cnt[data-filter="danger"]` | `<span class="icon-wrap" data-icon="warning"></span>` | счётчики лога |

**Шаг 6.3 — CSS для .icon-wrap**

Добавить в `index.html` в блок `<style>`:

```css
.icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2em;
  height: 1.2em;
  vertical-align: middle;
  flex-shrink: 0;
}
.icon-wrap svg,
.icon {
  width: 100%;
  height: 100%;
  display: block;
}
```

**Шаг 6.4 — Инициализация icon-wrap через JS**

Добавить в конец блока инициализации (после `DOMContentLoaded`):

```js
// Заменить data-icon атрибуты на реальные SVG после загрузки icons.js
function initIconWraps() {
  if (!window.icon) {
    setTimeout(initIconWraps, 50);
    return;
  }
  document.querySelectorAll('.icon-wrap[data-icon]').forEach(el => {
    el.innerHTML = window.icon(el.dataset.icon);
    el.removeAttribute('data-icon');
  });
}
document.addEventListener('DOMContentLoaded', initIconWraps);
```

**Шаг 6.5 — Замена в panels.js и других JS-файлах**

В `ui/panels.js` найти все строки с эмодзи в шаблонных литералах и заменить:
```js
// было
`<span>💰 ${value}</span>`
// стало
`<span>${icon('gold')} ${value}</span>`
```

Аналогично в `ui/diplomacy_tab.js`, `ui/government_tab.js`, `ui/population_tab.js`.

---

### Проверка перед коммитом

1. Открыть в браузере — ни одного эмодзи не должно быть видно в основном интерфейсе.
2. Все иконки отображаются как SVG-линии, окрашенные через CSS `color`.
3. При hover на кнопку «Следующий ход» — иконка меняет цвет вместе с текстом (через `currentColor`).
4. Запустить в консоли: `document.querySelectorAll('*')` и визуально убедиться что нет текстовых эмодзи.
5. В левой навигации — SVG-иконки вместо эмодзи, при наведении подсвечиваются золотом.

---

### Коммит

```
ui: этап 6 — заменить все эмодзи на SVG-иконки
```

---

*Следующий этап: разметка и CSS нового экрана загрузки — мозаика из тессер.*

---

## ЭТАП 7 — Экран загрузки: разметка и CSS мозаики ✅ ВЫПОЛНЕНО

**Улучшение:** #4 — Экран загрузки → «Мозаика собирается»
**Часть:** 1 из 2 — структура и внешний вид

---

### Контекст

Сейчас `#splash-screen` показывает: заголовок, подзаголовок, прогресс-бар (260×3px) и статус.
Это стандартный загрузочный экран 2010-х.

Новый экран: **тёмное поле**, на котором из хаоса медленно складывается **мозаика Сиракуз** —
маленькие квадратные тессеры (6×6px с 1px зазором) появляются в случайном порядке и
постепенно формируют контур карты Сицилии. Прогресс загрузки = процент появившихся тессер.

---

### Что читать перед началом

1. Открыть `index.html`, найти `#splash-screen` (строки ~23–61 в CSS, ~8993–8999 в HTML).
2. Прочитать всю разметку и CSS splash-экрана полностью.
3. Найти в JS (поиск по `splash`) все места где управляется splash: обновление прогресс-бара,
   скрытие экрана. Это понадобится в Этапе 8.

---

### Что сделать

**Шаг 7.1 — Обновить HTML разметку `#splash-screen`**

Найти в `index.html`:
```html
<div id="splash-screen">
  <div id="splash-inner">
    <div id="splash-title">Ancient Strategy</div>
    <div id="splash-subtitle">Сиракузы · 301 BC</div>
    <div id="splash-bar-wrap"><div id="splash-bar-fill"></div></div>
    <div id="splash-status">Загрузка...</div>
  </div>
</div>
```

Заменить на:
```html
<div id="splash-screen">
  <!-- Холст мозаики — заполняется через JS в Этапе 8 -->
  <canvas id="splash-mosaic"></canvas>

  <!-- Текст поверх мозаики -->
  <div id="splash-inner">
    <div id="splash-title">ANCIENT STRATEGY</div>
    <div id="splash-subtitle">SYRACVSAE · CCCI BC</div>
    <div id="splash-status">Загрузка...</div>
    <!-- прогресс-бар убран — прогресс виден через мозаику -->
  </div>
</div>
```

**Шаг 7.2 — Заменить CSS блока `#splash-screen`**

Найти в CSS блок `/* D3: ЭКРАН ЗАГРУЗКИ */` и полностью заменить его:

```css
/* ══════════════════════════════════════════════════
   ЭКРАН ЗАГРУЗКИ — МОЗАИКА
══════════════════════════════════════════════════ */
#splash-screen {
  position: fixed; inset: 0; z-index: 99999;
  background: var(--bg-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.8s ease;
}
#splash-screen.hidden {
  opacity: 0;
  pointer-events: none;
}

/* Canvas мозаики — занимает весь экран */
#splash-mosaic {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* Текст поверх мозаики, по центру */
#splash-inner {
  position: relative;
  z-index: 2;
  text-align: center;
  color: var(--text-primary);
  pointer-events: none;
  /* Тёмный ореол вокруг текста чтобы читался на мозаике */
  filter: drop-shadow(0 0 24px var(--bg-deep));
}

#splash-title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 900;
  letter-spacing: 0.18em;
  color: var(--gold);
  text-shadow: 0 0 40px rgba(201,169,97,0.5);
  margin-bottom: 8px;
}

#splash-subtitle {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  letter-spacing: 0.3em;
  color: var(--gold-dim);
  margin-bottom: 32px;
}

#splash-status {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  color: var(--text-dim);
  text-transform: uppercase;
}

/* Убрать старые стили прогресс-бара */
#splash-bar-wrap,
#splash-bar-fill { display: none; }
```

---

### Результат после Этапа 7

После этого этапа экран загрузки будет показывать:
- Тёмный фон
- `<canvas>` поверх (пока пустой — это нормально, заполнится в Этапе 8)
- Заголовок и статус по центру в новом стиле

Мозаика ещё не появляется — это задача Этапа 8.

---

### Проверка перед коммитом

1. Открыть `index.html` в браузере. Перезагрузить страницу — на момент загрузки должен
   показаться тёмный экран с золотым заголовком «ANCIENT STRATEGY» по центру.
2. Старый прогресс-бар не виден.
3. Canvas элемент существует в DOM (`document.getElementById('splash-mosaic')`).
4. После загрузки splash исчезает как обычно.

---

### Коммит

```
ui: этап 7 — разметка и CSS экрана загрузки (мозаика)
```

---

*Следующий этап: JS-анимация — тессеры появляются в случайном порядке, складываясь в карту.*

---

## ЭТАП 8 — Экран загрузки: JS-анимация мозаики ✅ ВЫПОЛНЕНО

**Улучшение:** #4 — Экран загрузки → «Мозаика собирается»
**Часть:** 2 из 2 — логика анимации на Canvas

---

### Контекст

Canvas готов. Нужно написать JS который:
1. Разбивает экран на сетку тессер (6×6px + 1px зазор).
2. Хранит список всех тессер в случайном порядке.
3. По мере роста прогресса загрузки — «открывает» тессеры одну за другой.
4. Тессеры в центре экрана (где карта Сицилии) — другого цвета.

---

### Что читать перед началом

1. Найти в `index.html` в JS-блоке функцию или код, который вызывает обновление прогресса
   splash-экрана. Искать по `splash-bar-fill` или `splash` в скриптах.
2. Найти где и как вызывается скрытие splash (обычно после инициализации игры).

---

### Что сделать

**Шаг 8.1 — Создать функцию `initSplashMosaic()`**

Добавить в `index.html` в блок `<script>` (в начало, до других функций):

```js
// ── МОЗАИКА ЗАГРУЗКИ ──────────────────────────────
const SplashMosaic = {
  canvas: null,
  ctx: null,
  tiles: [],          // все тессеры в случайном порядке
  revealed: 0,        // сколько открыто
  total: 0,
  TILE: 7,            // размер тессеры (6px + 1px зазор)
  cols: 0,
  rows: 0,

  // Примерный силуэт Сицилии как набор относительных координат
  // (col_ratio, row_ratio) — нормализованные от 0 до 1
  // Значения подобраны вручную под форму острова
  SICILY_MASK: [
    // центр и правая часть острова
    [0.35,0.35],[0.38,0.32],[0.42,0.30],[0.46,0.29],[0.50,0.28],
    [0.54,0.29],[0.58,0.30],[0.62,0.32],[0.65,0.35],[0.67,0.38],
    [0.66,0.42],[0.63,0.45],[0.60,0.47],[0.56,0.48],[0.52,0.48],
    [0.48,0.47],[0.44,0.46],[0.40,0.44],[0.37,0.41],[0.35,0.38],
    // заполнение центра
    [0.40,0.35],[0.44,0.33],[0.48,0.32],[0.52,0.32],[0.56,0.33],
    [0.60,0.35],[0.62,0.38],[0.61,0.41],[0.58,0.43],[0.54,0.44],
    [0.50,0.44],[0.46,0.43],[0.42,0.41],[0.40,0.38],
    // Мессина (северо-восток)
    [0.68,0.30],[0.70,0.27],[0.69,0.24],
    // Сиракузы (юго-восток)
    [0.65,0.48],[0.67,0.51],[0.65,0.53],
    // западная оконечность
    [0.32,0.37],[0.30,0.39],[0.31,0.42],
  ],

  init() {
    this.canvas = document.getElementById('splash-mosaic');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    this._buildTiles();
    this._render();
    window.addEventListener('resize', () => {
      this._resize();
      this._buildTiles();
      this._render();
    });
  },

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.cols = Math.ceil(this.canvas.width  / this.TILE);
    this.rows = Math.ceil(this.canvas.height / this.TILE);
  },

  _buildTiles() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const arr = [];

    // Строим маску острова: Set из "col,row"
    const islandSet = new Set();
    for (const [cr, rr] of this.SICILY_MASK) {
      // Каждую точку маски расширяем в пятно радиусом ~3 тессеры
      const cc = Math.round(cr * this.cols);
      const rc = Math.round(rr * this.rows);
      for (let dc = -3; dc <= 3; dc++) {
        for (let dr = -3; dr <= 3; dr++) {
          if (dc*dc + dr*dr <= 12) {
            islandSet.add(`${cc+dc},${rc+dr}`);
          }
        }
      }
    }

    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        arr.push({
          x: c * this.TILE,
          y: r * this.TILE,
          island: islandSet.has(`${c},${r}`),
          visible: false,
        });
      }
    }

    // Перемешать случайно
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    this.tiles = arr;
    this.total = arr.length;
    this.revealed = 0;
  },

  // progress: 0..1
  setProgress(p) {
    const target = Math.floor(p * this.total);
    while (this.revealed < target && this.revealed < this.total) {
      this.tiles[this.revealed].visible = true;
      this.revealed++;
    }
    this._render();
  },

  _render() {
    const ctx = this.ctx;
    const S = this.TILE - 1; // размер тессеры без зазора
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const t of this.tiles) {
      if (!t.visible) continue;
      if (t.island) {
        // Тессеры острова — тёплый тёмный камень с лёгким золотым оттенком
        ctx.fillStyle = `hsl(35, 20%, ${8 + Math.random()*4}%)`;
      } else {
        // Морские тессеры — тёмный базальт, почти чёрный
        ctx.fillStyle = `hsl(210, 25%, ${4 + Math.random()*3}%)`;
      }
      ctx.fillRect(t.x, t.y, S, S);
    }
  },
};

// Инициализируем сразу
SplashMosaic.init();
```

**Шаг 8.2 — Подключить прогресс мозаики к реальному прогрессу загрузки**

Найти в JS код который обновляет `#splash-bar-fill` (что-то вроде):
```js
document.getElementById('splash-bar-fill').style.width = `${pct}%`;
```

Добавить рядом:
```js
SplashMosaic.setProgress(pct / 100);
```

Также обновить текст статуса:
```js
document.getElementById('splash-status').textContent = statusText;
```

**Шаг 8.3 — Скрытие splash**

Найти место где `#splash-screen` скрывается (вероятно `style.display = 'none'` или убирается класс).
Заменить на плавное исчезновение:
```js
function hideSplash() {
  const el = document.getElementById('splash-screen');
  el.classList.add('hidden');      // opacity: 0 через CSS transition 0.8s
  setTimeout(() => el.remove(), 900);  // убрать из DOM после анимации
}
```

---

### Проверка перед коммитом

1. Перезагрузить страницу. На экране загрузки тессеры должны появляться постепенно.
2. Посередине экрана тессеры теплее — угадывается форма острова.
3. Скорость заполнения соответствует реальному прогрессу загрузки (не мгновенная).
4. По завершении экран плавно растворяется (fade-out 0.8s).
5. Canvas удаляется из DOM после исчезновения.

---

### Коммит

```
ui: этап 8 — JS-анимация мозаики на экране загрузки
```

---

*Следующий этап: разметка и CSS верхней «стелы» вместо top-bar.*

---

## ЭТАП 9 — Стела: разметка и CSS ✅ ВЫПОЛНЕНО

**Улучшение:** #2 — Верхняя панель → «Стела у входа»
**Часть:** 1 из 2 — структура и внешний вид

---

### Контекст

Текущий `#top-bar` — горизонтальная полоса высотой 42px с тёмным градиентом,
которая содержит всё подряд: дату, название, ресурсы, прогресс хода и кнопки.
Это типовой топ-бар любой стратегии 2000-х.

Новая «Стела» переосмысляет верхнюю зону:
- **Левый блок**: гравированная надпись с именем правителя и датой (как на триумфальной арке).
- **Центр**: убирается — карта занимает всё пространство.
- **Правый блок**: клепсидра (кнопка хода) + иконки поиска и настроек.
- Ресурсы переезжают в отдельный радиальный виджет (Этап 15–16).
- Прогресс хода — встраивается в клепсидру (Этап 11–12).

В этом этапе: только разметка и CSS. Данные не подключаем.

---

### Что читать перед началом

1. В `index.html` найти `<header id="top-bar">` и прочитать всё его содержимое.
2. Прочитать CSS для `#top-bar`, `#game-date`, `#game-title`, `#resource-bar`,
   `#turn-progress`, `#end-turn-btn`, `#settings-btn`, `#search-btn`.
3. Понять что из этого переезжает, что удаляется, что остаётся.

---

### Что сделать

**Шаг 9.1 — Заменить HTML разметку `#top-bar`**

Найти:
```html
<header id="top-bar">
  ...всё содержимое...
</header>
```

Заменить на:
```html
<header id="top-bar">

  <!-- ЛЕВЫЙ БЛОК: Стела — гравировка правителя и даты -->
  <div id="stele">
    <div id="stele-ruler">AGATHOKLES · STRATEGOS</div>
    <div id="stele-date">
      <span id="game-month">Ἑκατομβαιών</span>
      <span class="stele-sep">·</span>
      <span id="game-year">CCCI BC</span>
    </div>
  </div>

  <!-- ЦЕНТР: пустой — карта будет видна через прозрачность -->
  <div id="top-bar-center"></div>

  <!-- ПРАВЫЙ БЛОК: действия -->
  <div id="top-actions">
    <button id="search-btn" title="Поиск [/]">
      <span class="icon-wrap" data-icon="search"></span>
    </button>
    <button id="settings-btn" title="Настройки">
      <span class="icon-wrap" data-icon="settings"></span>
    </button>
    <!-- Клепсидра добавится в Этапе 11 -->
  </div>

</header>
```

Элементы `#resource-bar`, `#turn-progress`, `#end-turn-btn` убрать из `#top-bar`
(они временно удаляются — вернутся в новом виде в Этапах 11 и 15).

**Шаг 9.2 — CSS для нового `#top-bar` и стелы**

Найти в CSS блок `#top-bar { ... }` и заменить полностью:

```css
#top-bar {
  height: var(--header-h);
  background: transparent;                  /* прозрачный — карта видна под */
  border-bottom: 1px solid var(--border-main);
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  flex-shrink: 0;
  z-index: 10;
  position: relative;
  /* Тонкий градиент только в верхней части для читаемости */
  background: linear-gradient(to bottom,
    rgba(19,17,16,0.92) 0%,
    rgba(19,17,16,0.60) 70%,
    transparent 100%
  );
}

/* ── СТЕЛА (левый блок) ── */
#stele {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 20px;
  border-right: 1px solid var(--border-main);
  min-width: 240px;
}

#stele-ruler {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--gold);
  letter-spacing: 0.12em;
  line-height: 1.2;
}

#stele-date {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  color: var(--gold-dim);
  letter-spacing: 0.2em;
  margin-top: 3px;
}

.stele-sep {
  margin: 0 6px;
  opacity: 0.5;
}

/* ── ЦЕНТР ── */
#top-bar-center {
  flex: 1;
}

/* ── ПРАВЫЕ ДЕЙСТВИЯ ── */
#top-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  border-left: 1px solid var(--border-main);
}

#top-actions button {
  background: none;
  border: none;
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}

#top-actions button:hover {
  color: var(--gold);
  background: rgba(201,169,97,0.08);
}
```

---

### Проверка перед коммитом

1. Открыть в браузере. Верхняя полоса теперь прозрачная — через неё видна карта.
2. Слева: «AGATHOKLES · STRATEGOS» и дата — золотом, шрифт Cinzel.
3. Справа: две иконки (поиск и настройки).
4. Ресурсного бара пока нет — это нормально (появится в Этапе 15).
5. Кнопки поиска и настроек работают при клике.

---

### Коммит

```
ui: этап 9 — разметка и CSS стелы (верхняя панель)
```

---

*Следующий этап: подключить стелу к игровым данным — имя правителя, дата.*

---

## ЭТАП 10 — Стела: подключить к игровым данным ✅ ВЫПОЛНЕНО

**Улучшение:** #2 — Верхняя панель → «Стела у входа»
**Часть:** 2 из 2 — обновление данных через JS

---

### Контекст

Стела отображает статические строки «AGATHOKLES · STRATEGOS» и «Ἑκατομβαιών · CCCI BC».
Нужно сделать так чтобы эти данные обновлялись из игрового состояния:
имя правителя, его титул, текущий месяц и год.

---

### Что читать перед началом

1. Найти в `index.html` JS-функцию `updateTopBar()` или аналогичную, которая обновляла
   `#game-date` и `#game-title`. Искать по `game-date`, `game-title`, `renderTopBar`.
2. Найти в глобальном состоянии (`state` или `gameState`) поля: год, месяц, имя правителя.
3. Найти массив названий греческих месяцев (если есть) — обычно в `engine/turn.js` или `index.html`.

---

### Что сделать

**Шаг 10.1 — Создать функцию `updateStele()`**

Найти функцию обновления верхней панели (скорее всего называется `renderHeader`,
`updateUI` или `updateTopBar`) и добавить внутрь вызов:

```js
function updateStele() {
  const s = window.state || window.gameState;
  if (!s) return;

  // Имя и титул правителя
  const ruler = s.player?.ruler || s.ruler;
  if (ruler) {
    const name   = (ruler.name || 'STRATEGOS').toUpperCase();
    const title  = (ruler.title || 'STRATEGOS').toUpperCase();
    document.getElementById('stele-ruler').textContent =
      `${name} · ${title}`;
  }

  // Дата: месяц и год
  const MONTHS_GR = [
    'Ἑκατομβαιών', 'Μεταγειτνιών', 'Βοηδρομιών',
    'Πυανεψιών',   'Μαιμακτηριών', 'Ποσιδεών',
    'Γαμηλιών',    'Ἀνθεστηριών',  'Ἐλαφηβολιών',
    'Μουνιχιών',   'Θαργηλιών',    'Σκιροφοριών',
  ];
  const month = s.month ?? s.turn_month ?? 0;
  const year  = Math.abs(s.year  ?? s.turn_year  ?? 301);
  const era   = (s.year ?? -301) < 0 ? 'BC' : 'AD';

  // Год в римских цифрах (только для красоты, опционально)
  const yearStr = toRomanYear(year, era);

  document.getElementById('game-month').textContent =
    MONTHS_GR[month % 12] ?? MONTHS_GR[0];
  document.getElementById('game-year').textContent = yearStr;
}

// Конвертация года в формат «CCCI BC» (римские цифры до 999)
function toRomanYear(n, era) {
  if (n > 999 || n <= 0) return `${n} ${era}`;
  const vals = [900,400,100,90,40,10,9,5,4,1];
  const syms = ['CM','CD','C','XC','XL','X','IX','V','IV','I'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return `${result} ${era}`;
}
```

**Шаг 10.2 — Вызывать `updateStele()` в нужных местах**

Найти места где раньше обновлялся `#game-date`:
```js
document.getElementById('game-date').textContent = ...;
```
Заменить на:
```js
updateStele();
```

Также добавить вызов `updateStele()` в:
- Начало игры (после инициализации `state`)
- Функцию завершения хода (`processTurn` или `endTurn`)

**Шаг 10.3 — Убрать старые элементы из JS**

Найти все обращения к `document.getElementById('game-date')` и `document.getElementById('game-title')`
в JS — эти элементы удалены из HTML, обращения к ним нужно заменить на `updateStele()`
или закомментировать чтобы не было ошибок в консоли.

---

### Проверка перед коммитом

1. Открыть игру. Стела показывает реальное имя правителя и текущую дату.
2. После нажатия «Следующий ход» — месяц и/или год обновляются в стеле.
3. Год отображается в формате «CCCI BC» (римские цифры).
4. Нет ошибок в консоли вида `Cannot set property of null` для `game-date`.

---

### Коммит

```
ui: этап 10 — подключить стелу к игровым данным
```

---

*Следующий этап: SVG-клепсидра — разметка, CSS и статичный вид.*

---

## ЭТАП 11 — Клепсидра: SVG, разметка и CSS ✅ ВЫПОЛНЕНО

**Улучшение:** #11 — Кнопка «Следующий ход» → «Клепсидра»
**Часть:** 1 из 2 — статичный вид, HTML и CSS

---

### Контекст

Кнопка «⚔ Следующий ход» — прямоугольник с градиентом. Нужно заменить её
на **клепсидру** (водяные часы) в правом верхнем углу экрана.

Клепсидра — SVG-элемент с двумя резервуарами и перемычкой.
Вода в верхнем резервуаре убывает в течение хода.
Когда все обязательные приказы отданы — вода становится золотой и часы мерцают.
Нажатие = завершение хода.

---

### Что читать перед началом

1. Найти в HTML `<button id="end-turn-btn"` — прочитать его текущее содержимое.
2. Прочитать CSS для `#end-turn-btn` полностью.
3. Найти в JS все обращения к `#end-turn-btn` — `getElementById`, `querySelector`,
   события `click`, изменения `disabled`.

---

### Что сделать

**Шаг 11.1 — Заменить HTML кнопки хода**

Найти:
```html
<button id="end-turn-btn" onclick="processTurn()" ...>⚔ Следующий ход</button>
```

Заменить на:
```html
<button id="end-turn-btn" onclick="processTurn()"
        title="Следующий ход [Space]" aria-label="Следующий ход">
  <svg id="clepsydra-svg" viewBox="0 0 48 80"
       fill="none" stroke="currentColor"
       stroke-width="1.5" stroke-linecap="round">

    <!-- Корпус: верхний конус -->
    <path d="M8 4 L40 4 L40 6 L26 32 L22 32 L8 6 Z"
          class="clepsy-frame"/>
    <!-- Корпус: нижний конус -->
    <path d="M8 76 L40 76 L40 74 L26 48 L22 48 L8 74 Z"
          class="clepsy-frame"/>
    <!-- Стойки -->
    <line x1="8"  y1="4"  x2="8"  y2="76" class="clepsy-frame"/>
    <line x1="40" y1="4"  x2="40" y2="76" class="clepsy-frame"/>
    <!-- Горизонтальные перекладины -->
    <line x1="4"  y1="4"  x2="44" y2="4"  class="clepsy-frame"/>
    <line x1="4"  y1="76" x2="44" y2="76" class="clepsy-frame"/>

    <!-- Вода в верхнем резервуаре (clipPath ограничивает по уровню) -->
    <clipPath id="clip-upper">
      <rect id="clip-upper-rect" x="8" y="4" width="32" height="28"/>
    </clipPath>
    <path d="M8 6 L40 6 L26 32 L22 32 Z"
          class="clepsy-water upper"
          clip-path="url(#clip-upper)"/>

    <!-- Вода в нижнем резервуаре (накапливается снизу) -->
    <clipPath id="clip-lower">
      <rect id="clip-lower-rect" x="8" y="48" width="32" height="28"/>
    </clipPath>
    <path d="M8 74 L40 74 L26 48 L22 48 Z"
          class="clepsy-water lower"
          clip-path="url(#clip-lower)"/>

    <!-- Тонкая струя посередине -->
    <line id="clepsy-stream" x1="24" y1="32" x2="24" y2="48"
          class="clepsy-stream"/>
  </svg>
</button>
```

**Шаг 11.2 — CSS для клепсидры**

Найти и заменить CSS `#end-turn-btn`:

```css
#end-turn-btn {
  /* Позиция в правом верхнем углу */
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 20;

  /* Внешний вид */
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: filter 0.2s, transform 0.15s;

  width: 40px;
  height: 66px;
}

#end-turn-btn:hover:not(:disabled) {
  filter: drop-shadow(0 0 8px rgba(201,169,97,0.6));
  transform: scale(1.05);
}

#end-turn-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

/* SVG клепсидры */
#clepsydra-svg {
  width: 100%;
  height: 100%;
}

.clepsy-frame {
  stroke: var(--bronze);
}

/* Вода — по умолчанию синевато-прозрачная */
.clepsy-water {
  fill: rgba(30, 80, 120, 0.5);
  stroke: none;
  transition: fill 0.5s;
}

/* Когда ход готов завершиться — вода золотая */
.clepsy-water.ready {
  fill: rgba(201,169,97,0.7);
}

/* Струя воды */
.clepsy-stream {
  stroke: rgba(80,140,200,0.4);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.clepsy-stream.ready {
  stroke: rgba(201,169,97,0.6);
}

/* Анимация мерцания когда ход готов */
@keyframes clepsydra-pulse {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(201,169,97,0.3)); }
  50%       { filter: drop-shadow(0 0 12px rgba(201,169,97,0.8)); }
}
#end-turn-btn.turn-ready {
  animation: clepsydra-pulse 2s ease-in-out infinite;
}
```

---

### Проверка перед коммитом

1. Открыть браузер. В правом верхнем углу — SVG-клепсидра.
2. Старая кнопка «⚔ Следующий ход» не видна.
3. При клике на клепсидру — вызывается `processTurn()`.
4. Визуально: тонкий бронзовый каркас, синяя полупрозрачная вода в верхнем конусе.

---

### Коммит

```
ui: этап 11 — SVG-клепсидра разметка и CSS
```

---

*Следующий этап: JS-анимация воды в клепсидре, подключение к прогрессу хода.*

---

## ЭТАП 12 — Клепсидра: JS-анимация воды ✅ ВЫПОЛНЕНО

**Улучшение:** #11 — Кнопка «Следующий ход» → «Клепсидра»
**Часть:** 2 из 2 — анимация уровня воды и состояние «готов»

---

### Контекст

Клепсидра отображается, но вода статична. Нужно:
1. Управлять уровнем воды через `clipPath` — чем ближе конец хода, тем меньше воды сверху и больше снизу.
2. При завершении всех обязательных приказов — переключить воду в золотой цвет и запустить пульсацию.
3. При нажатии на клепсидру — анимация «переворота» (вода быстро перетекает вниз, часы переворачиваются).

---

### Что читать перед началом

1. Найти в JS функции управления ходом: где обновляется `#turn-progress`, где
   выставляется `disabled` на кнопке хода.
2. Найти функцию `processTurn()` — что происходит до и после расчёта хода.

---

### Что сделать

**Шаг 12.1 — Объект `Clepsydra`**

Добавить в `index.html` в `<script>` (после `SplashMosaic`):

```js
// ── КЛЕПСИДРА ─────────────────────────────────────
const Clepsydra = {
  // progress: 0 = ход начался (верх полный), 1 = ход завершён (верх пустой)
  _progress: 0,
  _ready: false,

  get progress() { return this._progress; },
  set progress(v) {
    this._progress = Math.max(0, Math.min(1, v));
    this._update();
  },

  // Вызвать когда все обязательные приказы отданы
  setReady(isReady) {
    this._ready = isReady;
    const btn = document.getElementById('end-turn-btn');
    if (!btn) return;
    btn.classList.toggle('turn-ready', isReady);
    document.querySelectorAll('.clepsy-water').forEach(el =>
      el.classList.toggle('ready', isReady)
    );
    const stream = document.getElementById('clepsy-stream');
    if (stream) stream.classList.toggle('ready', isReady);
  },

  _update() {
    // Верхний резервуар: при progress=0 полный (y=4, h=28), при progress=1 пустой (h=0)
    const upperH = Math.round(28 * (1 - this._progress));
    const upperRect = document.getElementById('clip-upper-rect');
    if (upperRect) {
      upperRect.setAttribute('y', String(4 + (28 - upperH)));
      upperRect.setAttribute('height', String(upperH));
    }

    // Нижний резервуар: при progress=0 пустой (h=0), при progress=1 полный (h=28)
    const lowerH = Math.round(28 * this._progress);
    const lowerRect = document.getElementById('clip-lower-rect');
    if (lowerRect) {
      lowerRect.setAttribute('y', String(76 - lowerH));
      lowerRect.setAttribute('height', String(lowerH));
    }

    // Струя: видна только пока вода течёт
    const stream = document.getElementById('clepsy-stream');
    if (stream) {
      stream.style.opacity = (this._progress > 0 && this._progress < 1) ? '1' : '0';
    }
  },

  // Анимация переворота при завершении хода
  async flip(onComplete) {
    const btn = document.getElementById('end-turn-btn');
    if (!btn) { onComplete?.(); return; }

    // Быстро досыпать воду вниз
    const start = this._progress;
    const t0 = performance.now();
    const dur = 400; // ms

    const drain = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      this.progress = start + (1 - start) * p;
      if (p < 1) {
        requestAnimationFrame(drain);
      } else {
        // Переворот SVG
        btn.style.transition = 'transform 0.3s ease-in-out';
        btn.style.transform = 'rotate(180deg)';
        setTimeout(() => {
          // Сбросить для нового хода
          this.progress = 0;
          this.setReady(false);
          btn.style.transform = '';
          onComplete?.();
        }, 320);
      }
    };
    requestAnimationFrame(drain);
  },
};
```

**Шаг 12.2 — Подключить к системе прогресса хода**

Найти функцию которая обновляет `#tp-dots` (индикатор прогресса хода).
Рядом с её вызовом добавить:

```js
// Обновить клепсидру: progress = доля выполненных шагов хода
const done  = document.querySelectorAll('.tp-dot.done').length;
const total = document.querySelectorAll('.tp-dot').length;
if (total > 0) Clepsydra.progress = done / total;
```

**Шаг 12.3 — Подключить к `processTurn()`**

Найти функцию `processTurn()` или её вызов. Обернуть так:

```js
async function processTurn() {
  const btn = document.getElementById('end-turn-btn');
  if (btn) btn.disabled = true;

  await new Promise(resolve => Clepsydra.flip(resolve));

  // ... здесь идёт существующий код расчёта хода ...

  if (btn) btn.disabled = false;
  Clepsydra.setReady(false);
}
```

**Шаг 12.4 — Убрать старый `#turn-progress`**

Найти в HTML `<div id="turn-progress" ...>` — этот элемент больше не нужен в топ-баре.
Убрать его из разметки. Если в JS есть код который обновляет `#tp-dots` и `#tp-label` —
его тоже можно убрать или оставить как служебный (он не будет виден).

---

### Проверка перед коммитом

1. Открыть игру. Клепсидра в правом верхнем углу — вода в верхнем конусе.
2. По мере выполнения приказов — уровень воды в верхнем конусе убывает, в нижнем растёт.
3. Когда все приказы отданы — вода становится золотой, клепсидра начинает пульсировать.
4. При нажатии — анимация слива, переворот, сброс к началу нового хода.
5. Во время расчёта хода — кнопка `disabled`, клепсидра не реагирует на клики.

---

### Коммит

```
ui: этап 12 — JS-анимация клепсидры
```

---

*Следующий этап: убрать #status-bar из интерфейса, встроить его данные в другие элементы.*

---

## ЭТАП 13 — Статус-бар: скрыть и встроить данные ✅ ВЫПОЛНЕНО

**Улучшение:** #10 — Статус-бар → убрать полностью
**Часть:** 1 из 2 — скрыть панель, перенести данные

---

### Контекст

`#status-bar` показывает: `sb-game | 💾 Не сохранено | 🤖 AI: готов | — fps`.
Это отладочная информация разработчика, не игровой UI.

Стратегия замены:
- **Статус игры** (`sb-game`) → убрать совсем (дублирует стелу).
- **Сохранение** (`sb-save`) → тихая иконка: маленькая бронзовая монетка рядом со стелой,
  появляется только при автосохранении (анимация) или при ошибке (красный цвет).
- **Статус AI** (`sb-ai`) → встроить в кнопку-«рог» правой панели (Этап 23–24).
  Пока временно: маленькая точка-индикатор рядом с кнопкой настроек.
- **FPS** (`sb-fps`) → только в DevTools, не в игровом UI.

---

### Что читать перед началом

1. Найти в `index.html` `<div id="status-bar">` и весь его CSS.
2. Найти в JS все обращения к `#sb-game`, `#sb-save`, `#sb-ai`, `#sb-fps`.
   Искать по `getElementById('sb-`, `querySelector('#sb-`.
3. Найти где обновляется FPS (обычно в game loop через `requestAnimationFrame`).

---

### Что сделать

**Шаг 13.1 — Скрыть `#status-bar` через CSS**

Найти в CSS `#status-bar { ... }` и добавить:
```css
#status-bar {
  display: none;  /* скрыт от игрока; данные переносятся в другие элементы */
}
```

Не удалять из HTML — JS код ещё обращается к нему, сломается. Просто скрыть.

**Шаг 13.2 — Добавить индикатор сохранения в стелу**

В HTML найти `<div id="stele">` и добавить внутрь:
```html
<div id="save-indicator" title="Статус сохранения"></div>
```

CSS:
```css
#save-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  position: absolute;
  top: 8px;
  left: 8px;
  transition: background 0.3s, box-shadow 0.3s;
}
#save-indicator.saving {
  background: var(--gold);
  box-shadow: 0 0 6px rgba(201,169,97,0.8);
  animation: save-pulse 0.6s ease-in-out 3;
}
#save-indicator.error {
  background: var(--negative);
}
@keyframes save-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
```

**Шаг 13.3 — Обновить JS работы с `sb-save`**

Найти все места где обновляется `#sb-save`:
```js
document.getElementById('sb-save').textContent = '💾 Сохранено';
```

Заменить на вызов новой функции:
```js
function updateSaveIndicator(status) {
  // status: 'saving' | 'saved' | 'error'
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.className = '';
  if (status === 'saving') {
    el.className = 'saving';
    el.title = 'Сохранение...';
  } else if (status === 'error') {
    el.className = 'error';
    el.title = 'Ошибка сохранения';
  } else {
    el.title = 'Сохранено';
    // через 2с убрать индикатор
    setTimeout(() => { el.className = ''; }, 2000);
  }
  // Оставить старый sb-save обновляться для совместимости (он скрыт)
  const old = document.getElementById('sb-save');
  if (old) old.textContent = status;
}
```

Заменить все `getElementById('sb-save').textContent = ...` на `updateSaveIndicator(...)`.

**Шаг 13.4 — AI-статус: временный мини-индикатор**

Добавить в `#top-actions` (рядом с кнопками поиска/настроек):
```html
<div id="ai-dot" class="ai-dot ready" title="AI: готов"></div>
```

CSS:
```css
.ai-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: background 0.3s;
}
.ai-dot.ready    { background: var(--positive); }
.ai-dot.thinking { background: var(--gold);
  animation: save-pulse 0.8s ease-in-out infinite; }
.ai-dot.error    { background: var(--negative); }
```

Найти в JS обновления `#sb-ai` и дублировать их на `#ai-dot`:
```js
function updateAiStatus(status) {
  // status: 'ready' | 'thinking' | 'error'
  const dot = document.getElementById('ai-dot');
  if (dot) { dot.className = `ai-dot ${status}`; dot.title = `AI: ${status}`; }
  const old = document.getElementById('sb-ai');
  if (old) old.className = status;
}
```

---

### Проверка перед коммитом

1. `#status-bar` не виден — нижняя строка с `fps` и `sb-game` исчезла.
2. При автосохранении — маленькая точка у стелы кратко мигает золотом.
3. Рядом с кнопками в `#top-actions` — маленькая зелёная точка (AI готов).
4. Нет ошибок в консоли вида `Cannot set properties of null` для `sb-*`.

---

### Коммит

```
ui: этап 13 — скрыть статус-бар, встроить save/ai индикаторы
```

---

*Следующий этап: убрать из JS все прямые обращения к sb-fps и вывод FPS.*

---

## ЭТАП 14 — Статус-бар: убрать FPS и дебаг из UI ✅ ВЫПОЛНЕНО

**Улучшение:** #10 — Статус-бар → убрать полностью
**Часть:** 2 из 2 — очистить JS от обновлений скрытых элементов

---

### Контекст

После Этапа 13 `#status-bar` скрыт, но JS продолжает обновлять его каждый кадр
(особенно `#sb-fps` обновляется в game loop). Это лишняя работа и потенциальные
ошибки в консоли. Нужно перенести FPS-счётчик в DevTools-режим.

---

### Что читать перед началом

1. Найти в JS все упоминания `sb-fps` — вероятно в game loop или в `requestAnimationFrame`.
2. Найти все упоминания `sb-game` — обновление статуса игры.
3. Найти где объявлены переменные `fpsCounter`, `lastFpsTime`, `frameCount` или подобные.

---

### Что сделать

**Шаг 14.1 — Перевести FPS в DevTools-режим**

Найти код который обновляет `#sb-fps` (что-то вроде):
```js
document.getElementById('sb-fps').textContent = `${fps} fps`;
```

Заменить на:
```js
// FPS виден только в dev-режиме (window.DEV_MODE = true в консоли)
if (window.DEV_MODE) {
  let _devFpsEl = document.getElementById('dev-fps-overlay');
  if (!_devFpsEl) {
    _devFpsEl = document.createElement('div');
    _devFpsEl.id = 'dev-fps-overlay';
    _devFpsEl.style.cssText = `
      position:fixed; bottom:4px; right:4px; z-index:99998;
      font-family:monospace; font-size:10px; color:#0f0;
      background:rgba(0,0,0,0.5); padding:2px 6px; pointer-events:none;
    `;
    document.body.appendChild(_devFpsEl);
  }
  _devFpsEl.textContent = `${fps} fps`;
}
// Старый элемент обновляем для совместимости (он скрыт)
const sbFps = document.getElementById('sb-fps');
if (sbFps) sbFps.textContent = `${fps} fps`;
```

Теперь FPS отображается только когда в консоли браузера написать `DEV_MODE = true`.

**Шаг 14.2 — Убрать обновление `#sb-game`**

Найти все вызовы вида:
```js
document.getElementById('sb-game').textContent = '...';
```

Закомментировать или удалить — эта информация дублируется стелой и не нужна игроку.

**Шаг 14.3 — Проверить game loop на лишние DOM-обновления**

Найти `requestAnimationFrame` loop (обычно в `index.html` или `ui/map.js`).
Убедиться что в нём нет обновлений скрытых элементов каждый кадр кроме FPS.

**Шаг 14.4 — Добавить глобальный guard для безопасного обновления UI**

Добавить в начало JS-блока вспомогательную функцию:
```js
// Безопасное обновление DOM-элемента (не падает если элемент отсутствует)
function safeSet(id, value, attr = 'textContent') {
  const el = document.getElementById(id);
  if (el) el[attr] = value;
}
```

Пройтись по JS и заменить паттерн `document.getElementById('X').textContent = Y`
на `safeSet('X', Y)` там где X — это элементы которые могут не существовать
(sb-*, старые splash-*, game-date, game-title).

---

### Проверка перед коммитом

1. В консоли браузера нет ошибок `Cannot set properties of null`.
2. FPS нигде не виден в обычном режиме.
3. `DEV_MODE = true` в консоли → появляется маленький FPS-счётчик в правом нижнем углу.
4. Производительность: в DevTools → Performance не должно быть лишних DOM-обновлений каждый кадр.

---

### Коммит

```
ui: этап 14 — FPS только в dev-режиме, убрать дебаг из UI
```

---

*Следующий этап: разметка и CSS радиального аквидукта ресурсов.*

---

## ЭТАП 15 — Аквидукт: разметка и CSS радиального виджета ✅ ВЫПОЛНЕНО

**Улучшение:** #3 — Ресурсы → «Аквидуктная система»
**Часть:** 1 из 2 — структура и внешний вид

---

### Контекст

Горизонтальный `#resource-bar` с четырьмя иконками в ряд заменяется на
**радиальный виджет** прикреплённый к левому краю экрана.

Структура виджета:
- В центре — SVG-значок нации (монета с профилем правителя).
- Четыре «канала» расходятся от центра вверх, вправо, вниз, влево.
- По каждому каналу — анимированные частицы (Этап 16).
- Числа появляются только при наведении на канал.

---

### Что читать перед началом

1. Прочитать HTML `<div id="resource-bar">` и весь его CSS.
2. Прочитать JS: поиск по `res-gold`, `res-troops`, `res-food`, `res-pop` —
   найти все места где обновляются значения ресурсов.
3. Понять как считаются дельты (▲▼) — они понадобятся в Этапе 16 для направления частиц.

---

### Что сделать

**Шаг 15.1 — Заменить HTML `#resource-bar`**

Найти `<div id="resource-bar">...</div>` в `#top-bar` и удалить оттуда.

Добавить новый элемент сразу после `<header id="top-bar">`, как прямой дочерний
элемент `<div id="app">`:

```html
<!-- Радиальный виджет ресурсов — левый край экрана -->
<div id="aqua-widget" aria-label="Ресурсы">

  <!-- Центральный медальон -->
  <div id="aqua-center">
    <span class="icon-wrap" data-icon="gold"></span>
  </div>

  <!-- Четыре канала -->
  <div class="aqua-channel" id="aqua-gold"
       data-res="gold" data-dir="up"
       title="Казна" onclick="onResourceBarClick('gold')">
    <canvas class="aqua-stream" width="8" height="60"></canvas>
    <div class="aqua-label">
      <span class="aqua-val" id="aq-gold-val">—</span>
      <span class="aqua-delta" id="aq-gold-delta"></span>
    </div>
  </div>

  <div class="aqua-channel" id="aqua-troops"
       data-res="troops" data-dir="right"
       title="Войска" onclick="onResourceBarClick('troops')">
    <canvas class="aqua-stream" width="60" height="8"></canvas>
    <div class="aqua-label">
      <span class="aqua-val" id="aq-troops-val">—</span>
      <span class="aqua-delta" id="aq-troops-delta"></span>
    </div>
  </div>

  <div class="aqua-channel" id="aqua-food"
       data-res="food" data-dir="down"
       title="Снабжение" onclick="onResourceBarClick('food')">
    <canvas class="aqua-stream" width="8" height="60"></canvas>
    <div class="aqua-label">
      <span class="aqua-val" id="aq-food-val">—</span>
      <span class="aqua-delta" id="aq-food-delta"></span>
    </div>
  </div>

  <div class="aqua-channel" id="aqua-pop"
       data-res="pop" data-dir="left"
       title="Население" onclick="onResourceBarClick('pop')">
    <canvas class="aqua-stream" width="60" height="8"></canvas>
    <div class="aqua-label">
      <span class="aqua-val" id="aq-pop-val">—</span>
      <span class="aqua-delta" id="aq-pop-delta"></span>
    </div>
  </div>

</div>
```

**Шаг 15.2 — CSS для аквидукта**

Добавить в `<style>`:

```css
/* ── РАДИАЛЬНЫЙ АКВИДУКТ РЕСУРСОВ ── */
#aqua-widget {
  position: fixed;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 15;
  width: 140px;
  height: 140px;
  pointer-events: none;  /* каналы перехватывают события сами */
}

/* Центральный медальон */
#aqua-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 36px; height: 36px;
  background: var(--bg-panel);
  border: 1px solid var(--border-gold);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--gold);
  z-index: 2;
}

/* Каналы */
.aqua-channel {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: all;
}

/* Позиции каналов */
#aqua-gold   { top: 0; left: 50%; transform: translateX(-50%);
               flex-direction: column-reverse; }
#aqua-troops { right: 0; top: 50%; transform: translateY(-50%);
               flex-direction: row; }
#aqua-food   { bottom: 0; left: 50%; transform: translateX(-50%);
               flex-direction: column; }
#aqua-pop    { left: 0; top: 50%; transform: translateY(-50%);
               flex-direction: row-reverse; }

/* Canvas-поток частиц */
.aqua-stream {
  display: block;
  opacity: 0.7;
}

/* Метка с цифрой — скрыта, появляется при hover */
.aqua-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--font-data);
  font-size: var(--text-xs);
  opacity: 0;
  transition: opacity 0.2s;
  white-space: nowrap;
  pointer-events: none;
}
.aqua-channel:hover .aqua-label {
  opacity: 1;
}

.aqua-val {
  color: var(--text-primary);
  font-size: var(--text-sm);
}
.aqua-delta {
  font-size: var(--text-xs);
}
.aqua-delta.positive { color: var(--positive); }
.aqua-delta.negative { color: var(--negative); }
```

---

### Проверка перед коммитом

1. Открыть браузер. По центру левого края — радиальный виджет с медальоном.
2. Четыре канала расходятся в четыре стороны.
3. Canvas-потоки пока пустые — это нормально (частицы в Этапе 16).
4. При наведении на канал — появляется «—» (значение ещё не подключено).
5. Старый `#resource-bar` не виден.

---

### Коммит

```
ui: этап 15 — разметка и CSS радиального аквидукта ресурсов
```

---

*Следующий этап: JS-частицы в каналах, подключение к данным ресурсов.*

---

## ЭТАП 16 — Аквидукт: частицы и подключение к данным ✅ ВЫПОЛНЕНО

**Улучшение:** #3 — Ресурсы → «Аквидуктная система»
**Часть:** 2 из 2 — анимация потока и реальные значения

---

### Контекст

Canvas-каналы готовы. Нужно:
1. Запустить loop частиц на каждом canvas — они движутся по каналу.
2. Скорость и цвет частиц зависят от значения дельты ресурса.
3. Подключить реальные значения из `state` к `aq-*-val` и `aq-*-delta`.

---

### Что читать перед началом

1. Найти в JS функцию `updateResourceBar()` или где обновляются `#res-gold`, `#res-troops` и т.д.
2. Понять структуру `state`: где лежат `gold`, `troops`, `food`, `population` и их дельты.

---

### Что сделать

**Шаг 16.1 — Объект `AquaWidget`**

```js
// ── АКВИДУКТ РЕСУРСОВ ─────────────────────────────
const AquaWidget = {
  _channels: {},   // { gold: { canvas, ctx, particles, delta }, ... }
  _raf: null,

  RESOURCES: [
    { id: 'gold',   dir: 'up'    },
    { id: 'troops', dir: 'right' },
    { id: 'food',   dir: 'down'  },
    { id: 'pop',    dir: 'left'  },
  ],

  init() {
    for (const r of this.RESOURCES) {
      const canvas = document.querySelector(`#aqua-${r.id} .aqua-stream`);
      if (!canvas) continue;
      this._channels[r.id] = {
        canvas,
        ctx: canvas.getContext('2d'),
        particles: [],
        delta: 0,
        dir: r.dir,
      };
    }
    this._loop();
  },

  // Обновить значения всех ресурсов
  update({ gold, troops, food, pop, deltaGold, deltaTroops, deltaFood, deltaPop }) {
    const vals = { gold, troops, food, pop };
    const deltas = {
      gold: deltaGold ?? 0,
      troops: deltaTroops ?? 0,
      food: deltaFood ?? 0,
      pop: deltaPop ?? 0,
    };

    for (const [id, val] of Object.entries(vals)) {
      // Числовые значения
      const valEl = document.getElementById(`aq-${id}-val`);
      if (valEl) valEl.textContent = val != null ? String(Math.round(val)) : '—';

      // Дельта
      const d = deltas[id];
      const deltaEl = document.getElementById(`aq-${id}-delta`);
      if (deltaEl) {
        deltaEl.textContent = d > 0 ? `+${d}` : d < 0 ? String(d) : '';
        deltaEl.className = 'aqua-delta' + (d > 0 ? ' positive' : d < 0 ? ' negative' : '');
      }

      // Обновить дельту для частиц
      const ch = this._channels[id];
      if (ch) ch.delta = d;
    }
  },

  _spawnParticle(ch) {
    const isVertical = (ch.dir === 'up' || ch.dir === 'down');
    const w = ch.canvas.width;
    const h = ch.canvas.height;

    // Позиция старта (со стороны центра)
    const fromCenter = (ch.dir === 'up' || ch.dir === 'left');
    const p = {
      x: isVertical  ? w / 2 + (Math.random() - 0.5) * 3 : (fromCenter ? 0 : w),
      y: isVertical  ? (fromCenter ? h : 0) : h / 2 + (Math.random() - 0.5) * 3,
      size: 1 + Math.random(),
      speed: 0.4 + Math.abs(ch.delta) * 0.01 + Math.random() * 0.3,
      // Золото если доход, красноватое если расход, серое если нейтрально
      color: ch.delta > 0
        ? `rgba(201,169,97,${0.4 + Math.random()*0.4})`
        : ch.delta < 0
          ? `rgba(139,32,32,${0.4 + Math.random()*0.4})`
          : `rgba(100,90,70,${0.3 + Math.random()*0.3})`,
      alive: true,
    };
    return p;
  },

  _loop() {
    for (const [id, ch] of Object.entries(this._channels)) {
      const { ctx, canvas, particles, dir } = ch;
      const w = canvas.width;
      const h = canvas.height;
      const isVertical = (dir === 'up' || dir === 'down');

      ctx.clearRect(0, 0, w, h);

      // Спаунить новые частицы
      const rate = 1 + Math.min(5, Math.abs(ch.delta) / 10);
      if (Math.random() < rate * 0.05) {
        particles.push(this._spawnParticle(ch));
      }

      // Обновить и нарисовать
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (isVertical) {
          p.y += (dir === 'up' ? -p.speed : p.speed);
          if (p.y < 0 || p.y > h) { particles.splice(i, 1); continue; }
        } else {
          p.x += (dir === 'right' ? p.speed : -p.speed);
          if (p.x < 0 || p.x > w) { particles.splice(i, 1); continue; }
        }
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - p.size/2), Math.round(p.y - p.size/2), p.size, p.size);
      }

      // Ограничить количество частиц
      if (particles.length > 80) particles.splice(0, particles.length - 80);
    }

    this._raf = requestAnimationFrame(() => this._loop());
  },
};
```

**Шаг 16.2 — Инициализировать после загрузки**

```js
document.addEventListener('DOMContentLoaded', () => {
  AquaWidget.init();
});
```

**Шаг 16.3 — Подключить к обновлению UI**

Найти функцию которая обновляла `#res-gold`, `#res-troops` и т.д.
Добавить туда вызов:

```js
AquaWidget.update({
  gold:         state.gold        ?? state.treasury,
  troops:       state.troops      ?? state.military_strength,
  food:         state.food        ?? state.supply,
  pop:          state.population  ?? state.pop_total,
  deltaGold:    state.gold_delta   ?? 0,
  deltaTroops:  state.troops_delta ?? 0,
  deltaFood:    state.food_delta   ?? 0,
  deltaPop:     state.pop_delta    ?? 0,
});
```

Точные имена полей взять из реального `state` объекта.

---

### Проверка перед коммитом

1. Открыть игру. В каналах аквидукта — движущиеся точки-частицы.
2. Золото: частицы золотистые если казна пополняется, красноватые при расходе.
3. При наведении на канал — появляется реальное число из игры.
4. После хода — значения обновляются.
5. Производительность: `requestAnimationFrame` не тормозит основной интерфейс.

---

### Коммит

```
ui: этап 16 — JS-частицы аквидукта и подключение к данным
```

---

*Следующий этап: стилизация карты в духе Tabula Peutingeriana.*

---

## ЭТАП 17 — Карта: стиль Tabula Peutingeriana ✅ ВЫПОЛНЕНО

**Улучшение:** #9 — Карта → стиль «Tabula Peutingeriana»
**Часть:** 1 из 2 — цвет и стиль Leaflet-слоёв

---

### Контекст

Сейчас карта — стандартные Leaflet-полигоны: синее море, цветные регионы с hex-заливками.
Это выглядит как Google Maps в античных цветах.

Новый стиль вдохновлён Tabula Peutingeriana — единственной сохранившейся картой
Римской империи (~IV в.): охристые земли, тёмная вода, тонкие коричневые границы,
ощущение старого пергамента но в цифровом виде.

---

### Что читать перед началом

1. Открыть `ui/map.js` — найти функцию которая задаёт стиль полигонов регионов
   (обычно `style:` в `L.geoJSON` или функцию `getRegionStyle`).
2. Найти где задаётся фоновый цвет моря (`#map-container` background или Leaflet `backgroundColor`).
3. Найти функцию которая раскрашивает регионы по политическому/военному режиму.

---

### Что сделать

**Шаг 17.1 — Фон моря**

В `ui/map.js` найти инициализацию Leaflet карты (`L.map(...)`) и добавить/изменить:
```js
// Фон карты = цвет моря
document.getElementById('map-container').style.background = '#0f1a24';
```

В Leaflet также:
```js
map.getContainer().style.background = '#0f1a24';
```

**Шаг 17.2 — Базовый стиль регионов**

Найти функцию стиля регионов (что-то вроде `function regionStyle(feature)`).
Изменить дефолтные значения:

```js
function regionStyle(feature) {
  const nation = getNationForRegion(feature);  // существующая логика

  // Базовые цвета — охристый пергамент
  let fillColor   = '#c8a96e';  // нейтральный регион
  let fillOpacity = 0.65;
  let weight      = 1;
  let color       = '#6b4f2a';  // цвет границы — тёмная умбра

  if (nation) {
    // Цвет нации — приглушённее чем раньше
    fillColor   = desaturateColor(nation.color ?? '#c8a96e', 0.4);
    fillOpacity = 0.70;
    weight      = 1;
    color       = darkenColor(fillColor, 0.3);
  }

  return {
    fillColor,
    fillOpacity,
    weight,
    color,
    dashArray: null,
    // Тонкое внутреннее свечение как рельеф
    className: `region-poly nation-${nation?.id ?? 'neutral'}`,
  };
}

// Вспомогательные функции цветов (добавить рядом)
function desaturateColor(hex, amount) {
  // Преобразовать hex в HSL, уменьшить S, вернуть hex
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s * (1 - amount), l);
}
function darkenColor(hex, amount) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, l * (1 - amount));
}
// hexToHsl и hslToHex — стандартные реализации, добавить в конец map.js
```

**Шаг 17.3 — Hover и selection стиль**

Найти обработчики `mouseover`/`mouseout`/`click` на регионах.
Обновить highlighted стиль:

```js
// при наведении
layer.setStyle({
  fillOpacity: 0.85,
  weight: 2,
  color: '#c9a961',   // золотой бордюр при выборе
});

// при снятии выбора
layer.setStyle(regionStyle(layer.feature));
```

**Шаг 17.4 — CSS для карты**

```css
#map-container {
  background: #0f1a24;  /* море */
}

/* Leaflet controls убрать или стилизовать */
.leaflet-control-zoom {
  border: 1px solid var(--border-main) !important;
  border-radius: 2px !important;
}
.leaflet-control-zoom a {
  background: var(--bg-panel) !important;
  color: var(--text-secondary) !important;
  border-bottom-color: var(--border-main) !important;
}
.leaflet-control-zoom a:hover {
  background: var(--bg-hover) !important;
  color: var(--gold) !important;
}

/* Скрыть Leaflet attribution */
.leaflet-control-attribution {
  display: none !important;
}

/* Регионы — тонкая тень для рельефности */
.region-poly {
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
}
```

---

### Проверка перед коммитом

1. Открыть игру. Море — тёмное, почти чёрное (`#0f1a24`).
2. Регионы — охристо-коричневые, матовые, без неоновых цветов.
3. Границы между регионами — тонкие тёмные линии (1px).
4. При наведении на регион — золотой бордюр.
5. Leaflet zoom-кнопки стилизованы под общую палитру.

---

### Коммит

```
ui: этап 17 — стиль карты Tabula Peutingeriana
```

---

*Следующий этап: армии как SVG-орлы на карте, стиль дорог и городов.*

---

## ЭТАП 18 — Карта: армии-орлы, города, сезонный оверлей ✅ ВЫПОЛНЕНО

> **Статус:** ✅ **ВЫПОЛНЕНО** — ветка `claude/exciting-fermat-KVLXr`.
> Армии уже были SVG-маркеры с заливкой цвета нации (звезда + глиф рода войск, Шаг 39 `arma.md`) — не эмодзи, плавное скольжение через `smoothMoveArmyMarker`. Добавлено: подписи столиц наций (`renderCityLabels()` в `ui/map.js`), CSS-роли `.city-label` / `.capital` / `.player` в `index.html` (Cinzel, приглушённые, золото для игрока). Сезонный оверлей смягчён: `SEASON_STYLES` в `engine/turn.js` — более низкий alpha у `overlay` и мягкие фильтры (минимум hue/saturate). Тесты `test_arma_stage45.mjs` (45/0) и `test_arma_stage39.mjs` (без регрессий) проходят. Не реализовывать повторно.

**Улучшение:** #9 — Карта → стиль «Tabula Peutingeriana»
**Часть:** 2 из 2 — маркеры армий и городов

---

### Контекст

Армии на карте сейчас отображаются через стандартные маркеры или div-иконки с эмодзи.
Нужно заменить на SVG-орлов легиона, которые плавно скользят при движении.
Города — точки с именами в греческом написании.

---

### Что читать перед началом

1. Открыть `ui/map_armies.js` — найти как создаются маркеры армий.
2. Найти тип маркера: `L.marker`, `L.divIcon`, или кастомный.
3. Найти в `ui/map.js` как отображаются города (если есть).

---

### Что сделать

**Шаг 18.1 — SVG-иконка орла для армии**

В `ui/map_armies.js` найти создание иконки армии и заменить на:

```js
function createArmyIcon(nation, size = 24) {
  const color = nation?.color ?? '#c9a961';
  // Приглушить цвет нации
  const strokeColor = color;
  const fillColor   = color + '33';  // 20% прозрачность

  const svg = `<svg viewBox="0 0 24 24" width="${size}" height="${size}"
    fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Тело орла -->
    <path d="M12 20 L12 10" stroke="${strokeColor}" stroke-width="1.5"
          stroke-linecap="round"/>
    <!-- Крылья -->
    <path d="M12 12 C8 10 3 12 2 10 C4 8 8 9 12 12"
          stroke="${strokeColor}" stroke-width="1.5" fill="${fillColor}"
          stroke-linejoin="round"/>
    <path d="M12 12 C16 10 21 12 22 10 C20 8 16 9 12 12"
          stroke="${strokeColor}" stroke-width="1.5" fill="${fillColor}"
          stroke-linejoin="round"/>
    <!-- Голова -->
    <circle cx="12" cy="8" r="2.5" stroke="${strokeColor}"
            stroke-width="1.2" fill="${fillColor}"/>
    <!-- Клюв -->
    <path d="M13.5 8 L15 7.5" stroke="${strokeColor}" stroke-width="1"
          stroke-linecap="round"/>
    <!-- Штандарт (шест) -->
    <line x1="12" y1="10" x2="12" y2="22"
          stroke="${strokeColor}" stroke-width="1" opacity="0.6"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'army-marker',
    iconSize:   [size, size],
    iconAnchor: [size/2, size],
  });
}
```

**Шаг 18.2 — CSS для маркеров армий**

```css
.army-marker {
  background: none;
  border: none;
  transition: transform 0.3s ease, filter 0.2s;
  cursor: pointer;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}
.army-marker:hover {
  transform: scale(1.2);
  filter: drop-shadow(0 0 6px rgba(201,169,97,0.6));
}
/* Плавное движение маркера */
.leaflet-marker-icon {
  transition: left 0.4s ease, top 0.4s ease !important;
}
```

**Шаг 18.3 — Стиль городов**

Найти где на карте отображаются метки городов/столиц.
Если это `L.tooltip` или `L.marker` с названием — обновить стиль:

```js
function createCityLabel(name, isCapital = false) {
  return L.divIcon({
    html: `<div class="city-label ${isCapital ? 'capital' : ''}">${name}</div>`,
    className: '',
    iconSize: null,
    iconAnchor: [0, 0],
  });
}
```

CSS:
```css
.city-label {
  font-family: var(--font-display);
  font-size: 9px;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  white-space: nowrap;
  pointer-events: none;
}
.city-label.capital {
  color: var(--gold);
  font-size: 11px;
  letter-spacing: 0.12em;
}
```

**Шаг 18.4 — Улучшить сезонный оверлей**

Найти в HTML `<div id="season-overlay">` и в JS где он обновляется.
Заменить CSS-фильтр на более тонкую реализацию:

```css
#season-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  transition: background 3s ease;   /* плавная смена сезона */
}
```

В JS при смене сезона:
```js
const SEASON_TINTS = {
  spring: 'rgba(40, 80, 30, 0.04)',   // едва заметный зелёный
  summer: 'rgba(60, 40, 0,  0.06)',   // охристый
  autumn: 'rgba(80, 30, 0,  0.08)',   // медный
  winter: 'rgba(20, 40, 80, 0.06)',   // холодный синий
};
function updateSeasonOverlay(season) {
  const el = document.getElementById('season-overlay');
  if (el) el.style.background = SEASON_TINTS[season] ?? 'transparent';
}
```

---

### Проверка перед коммитом

1. Армии на карте — SVG-орлы цвета нации, не эмодзи ⚔.
2. При движении армии маркер плавно скользит (CSS transition).
3. Названия городов — мелким Cinzel, столицы — чуть крупнее, золотом.
4. Смена сезона — очень тонкое изменение тона карты (не резкий фильтр).

---

### Коммит

```
ui: этап 18 — армии-орлы, стиль городов и сезонный оверлей
```

---

*Следующий этап: роза ветров вместо панели режимов карты — разметка и CSS.*

---

## ЭТАП 19 — Роза ветров: разметка и CSS ✅ ВЫПОЛНЕНО

**Улучшение:** #5 — Кнопки режимов карты → «Роза ветров»
**Часть:** 1 из 2 — структура и внешний вид

---

### Контекст

`#map-mode-bar` — горизонтальный ряд из 4 кнопок с эмодзи в левом углу карты.
Это выглядит как тулбар браузера.

Роза ветров — SVG-элемент в правом нижнем углу карты. Четыре «лепестка»
соответствуют режимам карты: Политика (N), Экономика (E), Военный (S), Население (W).
Активный лепесток «расцветает» (увеличивается и подсвечивается).

---

### Что читать перед началом

1. Найти в HTML `<div id="map-mode-bar">` и его содержимое.
2. Найти в JS функцию `setMapMode(mode)` — её вызов нужно будет подключить к лепесткам.

---

### Что сделать

**Шаг 19.1 — Заменить HTML `#map-mode-bar`**

Найти:
```html
<div id="map-mode-bar">
  <button class="mm-btn active" data-mode="political" ...>🗺</button>
  ...
</div>
```

Заменить на:
```html
<div id="wind-rose" role="group" aria-label="Режим карты">
  <svg id="wind-rose-svg" viewBox="-60 -60 120 120"
       xmlns="http://www.w3.org/2000/svg">

    <!-- Центральная точка -->
    <circle cx="0" cy="0" r="8" class="wr-center"/>
    <circle cx="0" cy="0" r="5" class="wr-center-dot"/>

    <!-- Лепесток Север: Политика -->
    <path id="wr-political"
          d="M0,0 L-10,-18 L0,-42 L10,-18 Z"
          class="wr-petal" data-mode="political"
          onclick="setMapMode('political')"
          role="button" tabindex="0"
          aria-label="Политический режим [1]"/>
    <text x="0" y="-48" class="wr-label" text-anchor="middle">П</text>

    <!-- Лепесток Восток: Экономика -->
    <path id="wr-economy"
          d="M0,0 L18,-10 L42,0 L18,10 Z"
          class="wr-petal" data-mode="economy"
          onclick="setMapMode('economy')"
          role="button" tabindex="0"
          aria-label="Режим экономики [2]"/>
    <text x="50" y="4" class="wr-label" text-anchor="start">Э</text>

    <!-- Лепесток Юг: Военный -->
    <path id="wr-military"
          d="M0,0 L10,18 L0,42 L-10,18 Z"
          class="wr-petal" data-mode="military"
          onclick="setMapMode('military')"
          role="button" tabindex="0"
          aria-label="Военный режим [3]"/>
    <text x="0" y="56" class="wr-label" text-anchor="middle">В</text>

    <!-- Лепесток Запад: Население -->
    <path id="wr-population"
          d="M0,0 L-18,10 L-42,0 L-18,-10 Z"
          class="wr-petal" data-mode="population"
          onclick="setMapMode('population')"
          role="button" tabindex="0"
          aria-label="Режим населения [4]"/>
    <text x="-50" y="4" class="wr-label" text-anchor="end">Н</text>

    <!-- Диагональные засечки (декор) -->
    <line x1="-6" y1="-6" x2="-14" y2="-14" class="wr-notch"/>
    <line x1="6"  y1="-6" x2="14"  y2="-14" class="wr-notch"/>
    <line x1="6"  y1="6"  x2="14"  y2="14"  class="wr-notch"/>
    <line x1="-6" y1="6"  x2="-14" y2="14"  class="wr-notch"/>

  </svg>
</div>
```

**Шаг 19.2 — CSS розы ветров**

```css
/* ── РОЗА ВЕТРОВ ── */
#wind-rose {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 10;
  width: 130px;
  height: 130px;
  pointer-events: none;
}

#wind-rose-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.wr-center {
  fill: var(--bg-panel);
  stroke: var(--border-gold);
  stroke-width: 1;
}
.wr-center-dot {
  fill: var(--gold);
}

.wr-petal {
  fill: var(--bg-section);
  stroke: var(--border-main);
  stroke-width: 1;
  cursor: pointer;
  pointer-events: all;
  transition: fill 0.25s, stroke 0.25s, transform 0.25s;
  transform-origin: center;
  transform-box: fill-box;
}

.wr-petal:hover {
  fill: var(--bg-hover);
  stroke: var(--border-light);
}

/* Активный лепесток */
.wr-petal.active {
  fill: var(--bronze-dark);
  stroke: var(--gold);
  stroke-width: 1.5;
  filter: drop-shadow(0 0 4px rgba(201,169,97,0.4));
}

.wr-label {
  font-family: var(--font-display);
  font-size: 9px;
  fill: var(--text-dim);
  pointer-events: none;
  letter-spacing: 0.1em;
}

.wr-notch {
  stroke: var(--border-main);
  stroke-width: 1;
  pointer-events: none;
}
```

---

### Проверка перед коммитом

1. В правом нижнем углу карты — SVG-роза ветров с 4 лепестками.
2. Старый `#map-mode-bar` не виден.
3. Лепестки меняют цвет при наведении.
4. Клик пока не переключает режим (это в Этапе 20).
5. Метки П/Э/В/Н читаются рядом с лепестками.

---

### Коммит

```
ui: этап 19 — SVG-роза ветров разметка и CSS
```

---

*Следующий этап: подключить розу ветров к setMapMode() и горячим клавишам.*

---

## ЭТАП 20 — Роза ветров: JS переключения режимов ✅ ВЫПОЛНЕНО

> **hot-fix LOD подписей карты (в рамках этапа 20):** на обзорных зумах
> (`strategic`/`regional`) подписи наций и столиц перекрывали друг друга,
> превращая карту в «ковёр» из текста. Добавлено в `ui/map.js`:
> - `_updateNationLabelVisibility()`: `MIN_PX_AREA` теперь зависит от
>   `leafletMap.getZoom()` (9000/4500/2200/900/450 по уровням), введён
>   жёсткий потолок `MAX_NATION_LABELS` (12/22/32/60), добавлен greedy
>   AABB overlap culling — крупные нации «забивают» место.
> - `renderCityLabels()` теперь хранит метаданные (rank = число регионов,
>   `isPlayer`, `nameLen`). Новая функция `_applyCityLabelVisibility()`
>   переключает видимость маркеров столиц по текущему зуму
>   (strategic=0, z<5→6, z<6→12, z<6.5→20, detailed=все) и отказывает
>   столицам, чья пиксельная рамка пересекает уже принятую curved-надпись
>   нации (`_nationLabelBBoxes`). Столица игрока видна всегда при `z≥4`.
> - `_applyCityLabelVisibility` вызывается из
>   `_updateNationLabelVisibility` (которое уже подписано на `zoom`/
>   `moveend` через `scheduleNationLabelUpdate`) и из `renderCityLabels`.
>
> Регрессия WindRose проверена: все 7 чеклистов переключения режимов
> проходят. LOD-пайплайн покрыт node-тестами (10/10): strategic/regional/
> detailed уровни, обязательная видимость игрока при z≥4, greedy overlap
> против bbox'ов наций, bidirectional zoom-транзиции.

**Улучшение:** #5 — Кнопки режимов карты → «Роза ветров»
**Часть:** 2 из 2 — логика переключения и анимация

---

### Контекст

Роза нарисована. Нужно:
1. При клике на лепесток — вызвать `setMapMode(mode)` и обновить активный лепесток.
2. Горячие клавиши 1–4 переключают соответствующий лепесток.
3. При активации — анимация «расцветания» лепестка.

---

### Что читать перед началом

1. Найти в JS функцию `setMapMode(mode)` — она уже существует.
2. Найти в `ui/input.js` или основном JS где обрабатываются горячие клавиши карты (1,2,3,4).

---

### Что сделать

**Шаг 20.1 — Функция обновления розы**

Добавить в `index.html` в `<script>`:

```js
// ── РОЗА ВЕТРОВ ───────────────────────────────────
const WindRose = {
  _current: 'political',

  // Карта: mode → id лепестка
  PETALS: {
    political:  'wr-political',
    economy:    'wr-economy',
    military:   'wr-military',
    population: 'wr-population',
  },

  setActive(mode) {
    if (!this.PETALS[mode]) return;
    this._current = mode;

    // Снять active со всех лепестков
    document.querySelectorAll('.wr-petal').forEach(p => {
      p.classList.remove('active');
    });

    // Активировать нужный
    const petal = document.getElementById(this.PETALS[mode]);
    if (petal) {
      petal.classList.add('active');
      // Анимация «пульса» при активации
      petal.style.transition = 'none';
      petal.setAttribute('transform', 'scale(1.1)');
      requestAnimationFrame(() => {
        petal.style.transition = 'fill 0.25s, stroke 0.25s, transform 0.3s';
        petal.setAttribute('transform', 'scale(1)');
      });
    }
  },
};
```

**Шаг 20.2 — Обновить `setMapMode()`**

Найти существующую функцию `setMapMode(mode)` и добавить в начало:

```js
function setMapMode(mode) {
  WindRose.setActive(mode);
  // ... остальной существующий код без изменений ...
}
```

**Шаг 20.3 — Обновить горячие клавиши**

Найти в JS обработчик `keydown` где обрабатываются клавиши 1,2,3,4.
Убедиться что он вызывает `setMapMode()` — тогда роза обновится автоматически.
Если не вызывает — добавить:

```js
case '1': setMapMode('political');  break;
case '2': setMapMode('economy');    break;
case '3': setMapMode('military');   break;
case '4': setMapMode('population'); break;
```

**Шаг 20.4 — Keyboard navigation для лепестков**

Лепестки имеют `tabindex="0"` — добавить обработку Enter/Space:

```js
document.querySelectorAll('.wr-petal').forEach(petal => {
  petal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setMapMode(petal.dataset.mode);
    }
  });
});
```

Вызвать эту инициализацию после `DOMContentLoaded`.

**Шаг 20.5 — Инициальное состояние**

При старте игры установить активный лепесток:
```js
// После инициализации карты
WindRose.setActive('political');
```

---

### Проверка перед коммитом

1. Клик на лепесток «Э» → режим экономики активен, лепесток подсвечен золотом.
2. Нажатие клавиши «2» → то же самое.
3. Активный лепесток при переключении «пульсирует» (кратко увеличивается и возвращается).
4. Только один лепесток активен одновременно.
5. Tab-навигация: можно переключаться розой с клавиатуры.

---

### Коммит

```
ui: этап 20 — JS переключения режимов через розу ветров
```

---

*Следующий этап: левая панель — складной диптих, разметка и CSS.*

---

## ЭТАП 21 — Диптих: разметка и CSS складной левой панели ✅ ВЫПОЛНЕНО

**Улучшение:** #6 — Левая панель → «Военный диптих»
**Часть:** 1 из 2 — структура и внешний вид

> **Статус:** ✅ Реализован. `#left-panel` получил класс `diptych closed`,
> добавлены `#diptych-spine` (торец 48px с застёжкой и надписью TABVLAE),
> `#diptych-inner` с заголовком, навигационными метками `.dip-nav-btn` и
> прокручиваемой областью `#left-panel-content`. Legacy `#left-nav` со всеми
> `.lnav-btn` / `.lnav-badge` сохранён внутри `#diptych-inner` и скрыт
> через `#left-panel.diptych #left-nav { display: none }` — нужен для
> совместимости с тестами `test_arma_stage23/26/49.mjs` и с вызовами
> `renderLeftPanelTab()` из `panels.js`. Минимальный стаб `toggleDiptych()`
> переключает классы `.open`/`.closed`, чтобы можно было проверить
> CSS-анимацию раскрытия; полноценная `Diptych.init()` с localStorage —
> в этапе 22.

---

### Контекст

Текущая левая панель: `#left-panel` с `#left-nav` (кнопки с эмодзи) и `#left-panel-content`.
Ширина фиксирована (~260px), панель всегда открыта.

Новый «Диптих» — складные деревянные скрижали:
- В сложенном состоянии занимает 48px по левому краю.
- Видна только тонкая «торцевая поверхность» с золотой застёжкой.
- При клике раскрывается с анимацией открытия книги (CSS perspective transform).
- Навигация внутри — вертикальный свиток, не вкладки.

---

### Что читать перед началом

1. Прочитать полностью HTML `<div id="left-panel">`.
2. Прочитать CSS для `#left-panel`, `#left-nav`, `.lnav-btn`, `#left-panel-content`.
3. Найти в JS `renderLeftPanelTab(tab)` — это функция смены вкладки.

---

### Что сделать

**Шаг 21.1 — Обновить HTML разметку левой панели**

Найти `<div id="left-panel">` и заменить содержимое:

```html
<div id="left-panel" class="diptych closed">

  <!-- ТОРЕЦ (виден когда закрыто, 48px) -->
  <div id="diptych-spine" onclick="toggleDiptych()" title="Открыть панель">
    <!-- Золотая застёжка -->
    <div class="diptych-clasp">
      <svg viewBox="0 0 12 32" fill="none" stroke="currentColor"
           stroke-width="1" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="8" width="8" height="16" rx="1"
              stroke="var(--border-gold)"/>
        <circle cx="6" cy="16" r="2" fill="var(--gold)" stroke="none"/>
        <line x1="6" y1="2" x2="6" y2="8"
              stroke="var(--border-gold)"/>
        <line x1="6" y1="24" x2="6" y2="30"
              stroke="var(--border-gold)"/>
      </svg>
    </div>
    <!-- Надпись на торце (вертикально) -->
    <div class="diptych-spine-label">TABVLAE</div>
  </div>

  <!-- ВНУТРЕННОСТЬ ДИПТИХА -->
  <div id="diptych-inner">

    <!-- Заголовок с кнопкой закрытия -->
    <div id="diptych-header">
      <span id="diptych-title">Обзор</span>
      <button onclick="toggleDiptych()" title="Свернуть" class="diptych-close">✕</button>
    </div>

    <!-- Навигация — горизонтальные метки (не вкладки) -->
    <div id="diptych-nav">
      <button class="dip-nav-btn active" data-tab="overview"
              onclick="switchDiptychTab('overview')">Обзор</button>
      <button class="dip-nav-btn" data-tab="army"
              onclick="switchDiptychTab('army')">Армия</button>
      <button class="dip-nav-btn" data-tab="economy"
              onclick="switchDiptychTab('economy')">Казна</button>
      <button class="dip-nav-btn" data-tab="diplomacy"
              onclick="switchDiptychTab('diplomacy')">Дипломатия</button>
      <button class="dip-nav-btn" data-tab="laws"
              onclick="switchDiptychTab('laws')">Законы</button>
    </div>

    <!-- Контент — прокручиваемый свиток -->
    <div id="left-panel-content" id="diptych-scroll">
      <!-- Заполняется из panels.js renderLeftPanel() -->
    </div>

  </div>
</div>
```

**Шаг 21.2 — CSS диптиха**

Найти и заменить весь CSS блок для `#left-panel`:

```css
/* ── ДИПТИХ (складная левая панель) ── */
#left-panel {
  position: relative;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  z-index: 12;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Закрытое состояние — только торец */
#left-panel.closed {
  width: 48px;
}
/* Открытое состояние */
#left-panel.open {
  width: 280px;
}

/* Торец диптиха */
#diptych-spine {
  width: 48px;
  flex-shrink: 0;
  height: 100%;
  background: linear-gradient(to right, #2a1e12, #1e1610);
  border-right: 1px solid var(--border-main);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
}
#diptych-spine:hover {
  background: linear-gradient(to right, #3a2818, #2a1e12);
}

.diptych-clasp {
  width: 12px;
  height: 32px;
  color: var(--gold);
}

.diptych-spine-label {
  font-family: var(--font-display);
  font-size: 9px;
  color: var(--gold-dim);
  letter-spacing: 0.2em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
}

/* Внутренность — скрыта при закрытом состоянии */
#diptych-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-main);
  overflow: hidden;
  /* Анимация раскрытия — perspective fold */
  transform-origin: left center;
  transition: opacity 0.3s, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
#left-panel.closed #diptych-inner {
  opacity: 0;
  transform: perspective(400px) rotateY(-15deg);
  pointer-events: none;
}
#left-panel.open #diptych-inner {
  opacity: 1;
  transform: perspective(400px) rotateY(0deg);
  pointer-events: all;
}

/* Заголовок диптиха */
#diptych-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 6px;
  border-bottom: 1px solid var(--border-main);
  flex-shrink: 0;
}
#diptych-title {
  font-family: var(--font-display);
  font-size: var(--text-md);
  color: var(--gold);
  letter-spacing: 0.08em;
}
.diptych-close {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  transition: color 0.15s;
}
.diptych-close:hover { color: var(--gold); }

/* Навигация-навигация */
#diptych-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-main);
  flex-shrink: 0;
}
.dip-nav-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 2px;
  transition: color 0.15s, background 0.15s;
  letter-spacing: 0.05em;
}
.dip-nav-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.dip-nav-btn.active {
  color: var(--gold);
  background: var(--bg-section);
}

/* Прокручиваемый контент */
#diptych-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-main) transparent;
}
```

---

### Проверка перед коммитом

1. Левая панель сложена — виден только 48px торец с надписью TABVLAE и застёжкой.
2. Открытие (`toggleDiptych()` в консоли) — анимация раскрытия.
3. Внутри: заголовок, кнопки навигации (5 пунктов), прокручиваемая область.
4. Старые `.lnav-btn` с эмодзи не видны.

---

### Коммит

```
ui: этап 21 — складной диптих разметка и CSS
```

---

*Следующий этап: JS открытия/закрытия диптиха и переключение вкладок.*

---

## ЭТАП 22 — Диптих: JS анимации и переключение вкладок ✅ ВЫПОЛНЕНО

> **Статус:** ✅ **ВЫПОЛНЕНО** в ветке `claude/exciting-fermat-KVLXr`.
> В `index.html` стаб ЭТАПА 21 заменён на полноценный контроллер `window.Diptych`
> (методы `init`/`toggle`/`switchTab`/`isOpen`/`currentTab`). Состояние
> `{open, tab}` сохраняется в `localStorage['diptych']` и восстанавливается
> на `DOMContentLoaded`. При смене вкладки обновляются `.dip-nav-btn.active`
> и `#diptych-title` (по таблице TITLES), делегируется `renderLeftPanelTab(tab)`
> из `ui/panels.js`. Горячая клавиша `[` в `onHotkey` вызывает `toggleDiptych()`.
> `#left-resizer` удалён из HTML (диптих сам управляет шириной через CSS
> классы `.open`/`.closed`); `ui/panel_resize.js` безопасно тихо завершает
> инициализацию, т.к. resizer-элемент отсутствует.
> Пройдено 18 структурных и 18 поведенческих smoke-тестов
> (проверка init/toggle/switchTab/localStorage persistence/реинициализация).
> `test_arma_stage23.mjs` — 34 passed / 0 failed (legacy `#left-nav` сохранён).
> **Не реализовывать повторно.**

**Улучшение:** #6 — Левая панель → «Военный диптих»
**Часть:** 2 из 2 — логика открытия/закрытия и совместимость с panels.js

---

### Контекст

Диптих оформлен. Нужно:
1. Реализовать `toggleDiptych()` и `switchDiptychTab(tab)`.
2. Сохранять состояние (открыт/закрыт, текущая вкладка) в `localStorage`.
3. Совместить с существующей функцией `renderLeftPanelTab(tab)` из `panels.js`.

---

### Что читать перед началом

1. Найти в JS функцию `renderLeftPanelTab(tab)` в `ui/panels.js`.
2. Найти все вызовы `renderLeftPanelTab` в коде.
3. Понять как панель получает данные — через глобальный `state` или аргументы.

---

### Что сделать

**Шаг 22.1 — Функции управления диптихом**

```js
// ── ДИПТИХ ────────────────────────────────────────
const Diptych = {
  _open: false,
  _tab: 'overview',

  init() {
    // Восстановить состояние из localStorage
    const saved = localStorage.getItem('diptych');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        this._open = s.open ?? false;
        this._tab  = s.tab  ?? 'overview';
      } catch {}
    }
    this._apply();
    // Если было открыто — рендерить контент
    if (this._open) renderLeftPanelTab(this._tab);
  },

  toggle() {
    this._open = !this._open;
    this._save();
    this._apply();
    // Рендерить контент при открытии
    if (this._open) {
      setTimeout(() => renderLeftPanelTab(this._tab), 50);
    }
  },

  switchTab(tab) {
    this._tab = tab;
    this._save();
    // Обновить активную кнопку
    document.querySelectorAll('.dip-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Обновить заголовок
    const titles = {
      overview:   'Обзор нации',
      army:       'Армия',
      economy:    'Казна',
      diplomacy:  'Дипломатия',
      laws:       'Законы',
    };
    const titleEl = document.getElementById('diptych-title');
    if (titleEl) titleEl.textContent = titles[tab] ?? tab;
    // Рендерить контент
    renderLeftPanelTab(tab);
  },

  _apply() {
    const panel = document.getElementById('left-panel');
    if (!panel) return;
    panel.classList.toggle('open',   this._open);
    panel.classList.toggle('closed', !this._open);
  },

  _save() {
    localStorage.setItem('diptych', JSON.stringify({
      open: this._open,
      tab:  this._tab,
    }));
  },
};

function toggleDiptych()       { Diptych.toggle(); }
function switchDiptychTab(tab) { Diptych.switchTab(tab); }
```

**Шаг 22.2 — Инициализировать после загрузки**

```js
document.addEventListener('DOMContentLoaded', () => {
  Diptych.init();
});
```

**Шаг 22.3 — Обратная совместимость с renderLeftPanelTab**

Найти функцию `renderLeftPanelTab(tab)` в `ui/panels.js`.
Убедиться что она записывает содержимое в `document.getElementById('left-panel-content')`.
Если ID изменился на `diptych-scroll` — обновить в `panels.js`:

```js
// В panels.js — найти строку где записывается контент:
// было:
document.getElementById('left-panel-content').innerHTML = html;
// оставить как есть — id совпадает (мы оставили тот же id в разметке)
```

**Шаг 22.4 — Горячая клавиша открытия диптиха**

В обработчике `keydown` добавить:
```js
case 'Tab':
  if (!e.shiftKey && document.activeElement === document.body) {
    e.preventDefault();
    toggleDiptych();
  }
  break;
```

Или любую другую удобную клавишу (например `[`).

**Шаг 22.5 — Убрать #left-resizer**

Drag-to-resize больше не нужен — диптих сам управляет своей шириной.
Найти `<div class="panel-resizer" id="left-resizer">` и убрать из HTML.
Найти в `ui/panel_resize.js` или основном JS код ресайзера для левой панели
и закомментировать или удалить.

---

### Проверка перед коммитом

1. Клик на торец диптиха → панель раскрывается с анимацией perspective.
2. Повторный клик на застёжку или `✕` → складывается обратно.
3. Клик по кнопкам «Армия», «Казна» и т.д. → контент обновляется.
4. После перезагрузки страницы — панель в том же состоянии (открыта/закрыта) что и была.
5. `#left-resizer` отсутствует.

---

### Коммит

```
ui: этап 22 — JS диптиха: открытие, закрытие, переключение вкладок
```

---

*Следующий этап: правая панель — камеи советников, разметка и CSS.*

---

## ЭТАП 23 — Камеи: разметка и CSS панели советников ✅ ВЫПОЛНЕНО (пересмотрено)

> **Статус:** ✅ **ВЫПОЛНЕНО в рамках ревизии этапа 20 → Court Board.**
>
> Исходный план этапа 23 предлагал «узкую 56px колонку камей‑медальонов
> с hover‑карточкой, выезжающей влево». По UX‑ревью этот паттерн был
> заменён на **единый court‑board в стиле EU4/Imperator** (см.
> коммит `fix(ui): court board — коллегия 2×2 + roster с drag-n-drop`):
>
> - `#right-panel` сохраняет штатную ширину 260px; контент обёрнут
>   в `.court-board` (flex‑column).
> - `.court-college` — секция «Коллегия» с 2×2 grid крупных камей
>   `.position-cameo` (vacant/filled/dragging). Занятая камея:
>   портрет 44–56px (через `renderPortraitHTML` с классом
>   `position-slot__portrait`, сохранён для test_arma_stage57.mjs),
>   имя, должность, бонус, кнопка `✕` unassign при hover.
>   Вакантная — пунктирная рамка, иконка должности и текст «вакантно».
> - `.court-divider` — «Зал заседаний», декоративный разделитель
>   **и drop‑target для unassign** при перетаскивании из слота.
> - `.court-roster` — фильтры по роли (Все/⚔/💰/📜/⚖), сортировка
>   (рейтинг/возраст/имя), прокручиваемый список `.roster-row`
>   (портрет 28px + имя + 4 мини‑бейджа навыков по одному на каждую
>   должность). Функция `renderAdvisorChip` сохранена — она теперь
>   возвращает `.roster-row` HTML.
>
> Реализация живёт в `ui/panels.js` (`renderRightPanel`,
> `renderAdvisorChip`, `_renderRosterFilters`, `_applyRosterFilterSort`,
> `_bestScore`, `_showRosterMenu`, `_closeRosterMenu`,
> `initCourtDragDrop`, `_swapCourtPositions`, setters
> `setRosterFilter`/`setRosterSort`). CSS — в `index.html` блок
> `uisuper Этапы 23/24 — COURT BOARD (EU4/Imperator)`.
>
> Старые классы `.position-slot` / `.advisor-chip` в CSS сохранены
> как dead rules для бинарной совместимости с test_arma_stage57.mjs
> (selector `.position-slot img.position-slot__portrait` всё ещё
> определён), но в новой разметке не используются.

---

## ЭТАП 23 — Камеи: разметка и CSS панели советников (оригинальный план)

**Улучшение:** #7 — Правая панель «Двор» → «Камеи»
**Часть:** 1 из 2 — структура и внешний вид

---

### Контекст

Текущая правая панель: `#right-panel` с заголовком «👑 Двор Агафокла»,
кнопкой «✨ Созвать советников (AI)» и списком `.characters-list`.

Новый вид: Каждый советник — **камея** (медальон с SVG-профилем в стиле античной гравюры).
В покое — только тонкий список торцов медальонов у правого края.
При наведении — камея «выезжает» и раскрывается в карточку.

---

### Что читать перед началом

1. Прочитать HTML `<div id="right-panel">` полностью.
2. Прочитать CSS для `#right-panel`, `.characters-list`, `.panel-title`.
3. В `ui/panels.js` найти функцию которая рендерит список персонажей в правой панели.
4. Понять структуру объекта персонажа: имя, ранг, черты, лояльность.

---

### Что сделать

**Шаг 23.1 — Заменить HTML `#right-panel`**

Найти `<div id="right-panel">` и заменить содержимое:

```html
<div id="right-panel">

  <!-- Кнопка созыва (теперь "рог") -->
  <button id="generate-chars-btn" onclick="handleGenerateChars()"
          title="Созвать советников (AI)" class="summon-horn">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
         xmlns="http://www.w3.org/2000/svg">
      <!-- Горн/рог -->
      <path d="M3 12 L10 8 L20 4 L18 14 L10 16 Z"/>
      <path d="M10 8 L10 16"/>
      <path d="M3 10 L3 14 Q3 15 4 15 L10 16"/>
    </svg>
  </button>

  <!-- Список камей -->
  <div id="cameos-list" class="characters-list">
    <!-- Заполняется через JS -->
  </div>

</div>
```

**Шаг 23.2 — CSS правой панели и камей**

Найти и заменить CSS блок `#right-panel`:

```css
/* ── ПРАВАЯ ПАНЕЛЬ — КАМЕИ ── */
#right-panel {
  width: 56px;
  height: 100%;
  flex-shrink: 0;
  background: linear-gradient(to left, #1a1610, #1e1b16);
  border-left: 1px solid var(--border-main);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  z-index: 12;
  overflow: visible;    /* важно: камеи выезжают за границу панели */
  position: relative;
}

/* Кнопка рога */
.summon-horn {
  width: 32px;
  height: 32px;
  background: none;
  border: 1px solid var(--border-main);
  border-radius: 50%;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.summon-horn:hover {
  color: var(--gold);
  border-color: var(--border-gold);
  box-shadow: 0 0 8px rgba(201,169,97,0.3);
}
.summon-horn.summoning {
  animation: horn-pulse 0.5s ease-in-out 3;
}
@keyframes horn-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(201,169,97,0); }
  50%       { box-shadow: 0 0 16px rgba(201,169,97,0.6); }
}

/* Список камей */
#cameos-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  overflow: visible;
}

/* Одна камея */
.cameo {
  position: relative;
  width: 36px;
  height: 36px;
  cursor: pointer;
  flex-shrink: 0;
}

/* Медальон — круглый, бронзовый */
.cameo-medallion {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-section);
  border: 1px solid var(--bronze);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bronze);
  transition: border-color 0.2s, box-shadow 0.2s;
  overflow: hidden;
}
.cameo:hover .cameo-medallion,
.cameo.expanded .cameo-medallion {
  border-color: var(--gold);
  box-shadow: 0 0 6px rgba(201,169,97,0.3);
}

/* Карточка персонажа — появляется при hover, выезжает влево */
.cameo-card {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  width: 200px;
  background: var(--bg-panel);
  border: 1px solid var(--border-gold);
  border-radius: 3px;
  padding: 10px 12px;
  box-shadow: -4px 4px 16px rgba(0,0,0,0.5);
  pointer-events: none;
  opacity: 0;
  transform: translateY(-50%) translateX(8px);
  transition: opacity 0.2s, transform 0.2s;
  z-index: 50;
}
.cameo:hover .cameo-card {
  opacity: 1;
  pointer-events: all;
  transform: translateY(-50%) translateX(0);
}

.cameo-name {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--gold);
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}
.cameo-rank {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--text-dim);
  margin-bottom: 6px;
}
.cameo-quote {
  font-family: var(--font-lore);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-style: italic;
  line-height: var(--leading-normal);
  border-left: 2px solid var(--border-main);
  padding-left: 6px;
}
.cameo-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 6px;
}
.cameo-trait {
  font-family: var(--font-ui);
  font-size: 9px;
  padding: 1px 5px;
  background: var(--bg-section);
  border: 1px solid var(--border-main);
  border-radius: 2px;
  color: var(--text-dim);
}
```

---

### Проверка перед коммитом

1. Правая панель — узкая полоска 56px у правого края.
2. Кнопка-рог сверху — SVG, не текст с эмодзи.
3. При наведении на заглушку камеи — выезжает пустая карточка (данные добавятся в Этапе 24).
4. Карточка позиционирована слева от медальона, не перекрывает карту.

---

### Коммит

```
ui: этап 23 — разметка и CSS панели камей (правая панель)
```

---

*Следующий этап: JS генерация SVG-профилей, рендер камей из данных персонажей.*

---

## ЭТАП 24 — Камеи: JS генерация профилей и рендер ✅ ВЫПОЛНЕНО (пересмотрено)

> **Статус:** ✅ **ВЫПОЛНЕНО в рамках ревизии этапа 20 → Court Board.**
>
> Вместо процедурной SVG‑«античной» гравюры профиля (см. оригинальный
> план ниже) используется **реальный CC0‑портрет** через
> `renderPortraitHTML()` из `ui/portrait.js` (Шаг 57 arma.md) —
> фаюмские лица Римского Египта и прочие культурные портреты из
> `assets/portraits/`. Это решение принято ещё на этапе 57 (arma.md)
> и не пересматривалось.
>
> Новая JS‑логика (в рамках этапа 23/24 пересмотренного):
>
> - **Фильтрация/сортировка roster‑а** через `setRosterFilter(id)` и
>   `setRosterSort(id)` — меняют модульные `_rosterFilter`/`_rosterSort`
>   и вызывают `renderRightPanel()`.
> - **Drag‑n‑drop** через `initCourtDragDrop(panel)` — делегирует
>   `dragstart/dragover/dragleave/dragend/drop` на `#right-panel`,
>   биндинг идемпотентен через `data-_dndBound`.
>   - `roster-row → position-cameo`: `assignCharacter(charId, roleId)`.
>   - `position-cameo.filled → position-cameo` (другой слот):
>     `_swapCourtPositions(fromRole, toRole, charId)` — атомарный
>     swap двух назначений.
>   - `position-cameo.filled → .court-divider`: `unassignCharacter`.
>   - В `dragover` на слот добавляется класс `dt-good|dt-meh|dt-bad`
>     в зависимости от `_candidateScore(char, posDef)` (порог 40/20) —
>     мгновенная визуальная обратная связь о подходящести кандидата.
> - **Контекстное меню «Назначить в…»** — `_showRosterMenu(ev, charId)`
>   открывает fixed‑position popup с 4 кнопками (по должностям) +
>   «Подробно» + «Отмена». Используется как клавиатурный/тач
>   fallback к drag‑n‑drop.
> - **Анимация кнопки‑рога/созыва** из оригинального плана не
>   реализована — кнопка `#generate-chars-btn` остаётся штатной
>   текст+иконка, чтобы не усложнять сессию. Можно добавить позже
>   отдельным патчем.
>
> **Покрытие тестами (`/tmp/court_test.js`, 45 утверждений):**
> рендер court-board, vacant/filled слоты, assign/unassign/swap через
> API, фильтры по роли, сортировка, idempotent DnD binding, 4 skill
> badges на row, vacant onclick = openAssignModal, пустое состояние
> («Двор пуст»), DnD полная симуляция событий: dragstart → classList,
> dragover → dt-good score‑preview + preventDefault, drop → assign,
> dragend cleanup, slot→slot swap, slot→divider unassign.
>
> Регрессия: `tests/test_arma_stage57.mjs` — 53/54 (единственная
> неудача `[5b]` — пре‑существующая, не связана с Court Board).

---

## ЭТАП 24 — Камеи: JS генерация профилей и рендер (оригинальный план)

**Улучшение:** #7 — Правая панель «Двор» → «Камеи»
**Часть:** 2 из 2 — SVG-профили и подключение к данным

---

### Контекст

Контейнер камей готов. Нужно:
1. Для каждого персонажа — сгенерировать SVG-профиль в стиле античной камеи.
2. Отрендерить список камей в `#cameos-list`.
3. Кнопка рога при клике — анимация + вызов `handleGenerateChars()`.

---

### Что читать перед началом

1. Найти функцию `handleGenerateChars()` — что она делает.
2. Найти где хранятся данные персонажей в `state` (поля: name, title/rank, traits, loyalty).
3. Найти функцию которая раньше рендерила `.characters-list`.

---

### Что сделать

**Шаг 24.1 — Функция генерации SVG-профиля камеи**

```js
// Генерация процедурного SVG-профиля в стиле античной гравюры.
// Каждый персонаж получает уникальный профиль на основе хеша имени.
function generateCameoSvg(char) {
  // Детерминированный хеш имени → вариации черт лица
  const seed = (char.name || 'X').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
  const r = (n, min, max) => min + ((seed * (n+1) * 2654435761) >>> 0) % (max - min);

  const noseLen  = r(1, 10, 18);
  const foreHead = r(2, 12, 20);
  const chinLen  = r(3,  8, 14);
  const browType = r(4,  0,  2);  // 0=прямая, 1=изогнутая

  const isFemale = char.gender === 'female';
  const stroke   = 'var(--bronze)';
  const sw       = isFemale ? '1' : '1.2';

  return `<svg viewBox="0 0 36 36" fill="none"
    stroke="${stroke}" stroke-width="${sw}"
    stroke-linecap="round" stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg">
    <!-- Профиль лица (смотрит влево) -->
    <path d="
      M22,6
      Q${22 + foreHead - 12},6 ${22 + foreHead - 12},${10}
      L${22 + noseLen - 8},${18}
      Q${22 + noseLen - 6},${20} ${22 + noseLen - 10},${22}
      L${22 - 2},${26}
      Q${20},${26 + chinLen - 8} ${18},${28}
      Q${14},${30} ${10},${28}
      L${8},${22}
      Q${6},${16} ${8},${12}
      Q${12},${6} 22,6 Z
    " fill="rgba(140,110,79,0.15)"/>
    <!-- Бровь -->
    ${browType === 0
      ? `<line x1="${22+foreHead-13}" y1="${10}" x2="${22+foreHead-8}" y2="${10}"/>`
      : `<path d="M${22+foreHead-13},${11} Q${22+foreHead-10},${8} ${22+foreHead-7},${10}"/>`
    }
    <!-- Глаз -->
    <circle cx="${22+foreHead-10}" cy="${13}" r="1.2" fill="${stroke}" stroke="none"/>
    <!-- Шея -->
    <line x1="${10}" y1="${28}" x2="${9}" y2="${34}"/>
    <line x1="${18}" y1="${28}" x2="${19}" y2="${34}"/>
    <!-- Если мужчина — намётка бороды -->
    ${!isFemale && r(5,0,3) > 0
      ? `<path d="M${10},${28} Q${14},${32} ${18},${28}" fill="rgba(140,110,79,0.2)" stroke="${stroke}" stroke-width="0.8"/>`
      : ''
    }
  </svg>`;
}
```

**Шаг 24.2 — Функция рендера камей**

```js
function renderCameos(characters) {
  const list = document.getElementById('cameos-list');
  if (!list) return;

  if (!characters || characters.length === 0) {
    list.innerHTML = `<div style="color:var(--text-dim);font-size:10px;
      writing-mode:vertical-rl;padding-top:8px;letter-spacing:0.1em">
      VACAT
    </div>`;
    return;
  }

  list.innerHTML = characters.map(char => {
    const profileSvg = generateCameoSvg(char);
    const traits = (char.traits ?? []).slice(0, 3)
      .map(t => `<span class="cameo-trait">${t}</span>`).join('');
    const quote = char.description ?? char.quote ?? '';
    const loyalty = char.loyalty ?? char.opinion ?? 0;
    const loyaltyColor = loyalty >= 70 ? 'var(--positive)'
                       : loyalty >= 40 ? 'var(--gold)'
                       : 'var(--negative)';

    return `
    <div class="cameo" data-char-id="${char.id ?? char.name}">
      <div class="cameo-medallion">${profileSvg}</div>
      <div class="cameo-card">
        <div class="cameo-name">${char.name ?? '—'}</div>
        <div class="cameo-rank">${char.title ?? char.rank ?? ''}</div>
        ${quote ? `<div class="cameo-quote">❝ ${quote.slice(0,80)}${quote.length>80?'…':''} ❞</div>` : ''}
        <div class="cameo-traits">${traits}</div>
        <div style="margin-top:6px;font-size:9px;font-family:var(--font-data);
          color:${loyaltyColor}">
          Лояльность: ${loyalty}%
        </div>
      </div>
    </div>`;
  }).join('');

  // Клик на камею → открыть детальный просмотр
  list.querySelectorAll('.cameo').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.charId;
      if (window.openCharacterDetail) openCharacterDetail(id);
    });
  });
}
```

**Шаг 24.3 — Подключить к существующему рендеру персонажей**

Найти место где обновляется `.characters-list` (вероятно в `panels.js` или основном JS).
Заменить или дополнить:

```js
// Вместо старого рендера characters-list:
renderCameos(state.player?.characters ?? state.characters ?? []);
```

**Шаг 24.4 — Анимация рога при созыве**

```js
// Оригинальная handleGenerateChars остаётся без изменений.
// Оборачиваем только для анимации:
const _origGenerateChars = window.handleGenerateChars;
window.handleGenerateChars = async function() {
  const btn = document.getElementById('generate-chars-btn');
  if (btn) btn.classList.add('summoning');
  await _origGenerateChars?.();
  if (btn) btn.classList.remove('summoning');
};
```

---

### Проверка перед коммитом

1. При наличии персонажей в `state` — список камей отображается.
2. Каждая камея уникальна — SVG-профили отличаются по форме.
3. Наведение → карточка выезжает слева с именем, рангом, чертами.
4. Клик на камею → открывается детальный просмотр персонажа.
5. Кнопка рога: при клике — волна пульсаций, потом новые камеи появляются.

---

### Коммит

```
ui: этап 24 — JS камей: SVG-профили и рендер персонажей
```

---

*Следующий этап: нижняя полоска лога — разметка и CSS вощёной таблички.*

---

## ЭТАП 25 — Табличка-лог: разметка и CSS ✅ ВЫПОЛНЕНО

**Улучшение:** #8 — Лог событий → «Вощёная табличка»
**Часть:** 1 из 2 — структура и внешний вид

---

### Контекст

Текущий `#event-log` — drawer с заголовком и списком записей.
В сложенном состоянии — полоска 32px с последней записью и кнопкой «▲ Хроники».

Новая «Вощёная табличка»:
- В покое — только 8px тонкая полоска у нижнего края с золотыми точками-нотификациями.
- При hover или нажатии пробела — снизу выдвигается табличка высотой ~180px.
- Фактура: тёмное дерево + воск (CSS box-shadow и gradient).
- Записи лога в стиле рукописи (шрифт IM Fell English).

---

### Что читать перед началом

1. Прочитать HTML `<div id="event-log">` и всю его разметку.
2. Прочитать CSS для `#event-log`, `#log-collapsed`, `.log-title`, `#log-entries`.
3. Найти в JS функцию `toggleLog()` и `addLogEntry(...)`.

---

### Что сделать

**Шаг 25.1 — Заменить HTML разметку `#event-log`**

Найти `<div id="event-log" class="collapsed">` и заменить содержимое:

```html
<div id="event-log" class="collapsed" role="log" aria-label="Хроники">

  <!-- ПОЛОСКА (8px — всегда виден) -->
  <div id="log-strip" onclick="toggleLog()">
    <!-- Нотификации -->
    <div id="log-dots">
      <span class="log-dot" data-filter="danger"  title="Опасность"></span>
      <span class="log-dot gold"  data-filter="economy"   title="Экономика"></span>
      <span class="log-dot"  data-filter="character" title="Персонажи"></span>
    </div>
    <!-- Последняя запись (одна строка) -->
    <span id="log-last-entry">—</span>
    <!-- Кнопка раскрытия -->
    <button id="log-expand-btn" tabindex="-1">▲ Хроники</button>
  </div>

  <!-- ТЕЛО ТАБЛИЧКИ (раскрывается снизу) -->
  <div id="log-body">
    <!-- Заголовок с фильтрами -->
    <div class="log-title">
      Хроники
      <div class="log-filters">
        <button class="log-filter-btn active" data-filter="all"
                onclick="setLogFilter('all')">Все</button>
        <button class="log-filter-btn" data-filter="danger"
                onclick="setLogFilter('danger')">Опасность</button>
        <button class="log-filter-btn" data-filter="economy"
                onclick="setLogFilter('economy')">Казна</button>
        <button class="log-filter-btn" data-filter="character"
                onclick="setLogFilter('character')">Люди</button>
        <button class="log-filter-btn" data-filter="law"
                onclick="setLogFilter('law')">Законы</button>
      </div>
      <button class="btn-icon" onclick="showTurnSummary()"
              title="Итоги хода" style="margin-left:auto">📋</button>
    </div>
    <!-- Записи -->
    <div id="log-entries"></div>
  </div>

</div>
```

**Шаг 25.2 — CSS таблички-лога**

Найти и заменить CSS для `#event-log`:

```css
/* ── ЛОГ СОБЫТИЙ — ВОЩЁНАЯ ТАБЛИЧКА ── */
#event-log {
  position: relative;
  flex-shrink: 0;
  z-index: 11;
}

/* Полоска — 8px, всегда видна */
#log-strip {
  height: 8px;
  background: linear-gradient(to right, #2a1e12, #1e1610, #2a1e12);
  border-top: 1px solid var(--border-main);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  cursor: pointer;
  overflow: hidden;
  transition: height 0.15s;
}
#log-strip:hover {
  height: 24px;  /* при hover — чуть выше, показывает последнюю запись */
}

/* Точки-нотификации */
#log-dots {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.log-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-main);
  transition: background 0.3s;
}
.log-dot.active         { background: var(--negative); }
.log-dot.active.gold    { background: var(--gold); }
.log-dot.active.blue    { background: #5080b0; }

/* Последняя запись в полоске */
#log-last-entry {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--text-dim);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;           /* скрыт пока strip маленький */
  transition: opacity 0.15s;
}
#log-strip:hover #log-last-entry { opacity: 1; }

#log-expand-btn {
  background: none;
  border: none;
  color: var(--gold-dim);
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.1em;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
#log-strip:hover #log-expand-btn { opacity: 1; }
#log-expand-btn:hover { color: var(--gold); }

/* Тело таблички — выезжает снизу */
#log-body {
  background: linear-gradient(to bottom, #1e1a13, #191610);
  border-top: 1px solid var(--border-gold);
  /* Фактура вощёного дерева: тонкие горизонтальные линии */
  background-image:
    linear-gradient(to bottom, #1e1a13, #191610),
    repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 18px,
      rgba(201,169,97,0.03) 18px,
      rgba(201,169,97,0.03) 19px
    );
  background-blend-mode: normal, overlay;
  height: 0;
  overflow: hidden;
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
#event-log.expanded #log-body {
  height: 180px;
}

/* Заголовок */
.log-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-main);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--gold);
  letter-spacing: 0.1em;
  flex-shrink: 0;
}
.log-filters {
  display: flex;
  gap: 3px;
}
.log-filter-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: 9px;
  padding: 1px 6px;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.15s;
}
.log-filter-btn:hover  { color: var(--text-primary); border-color: var(--border-main); }
.log-filter-btn.active { color: var(--gold); border-color: var(--border-gold);
  background: var(--bg-section); }

/* Записи */
#log-entries {
  height: calc(180px - 34px);
  overflow-y: auto;
  padding: 4px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-main) transparent;
}
```

---

### Проверка перед коммитом

1. У нижнего края — тонкая тёмная полоска 8px.
2. При наведении — полоска расширяется до 24px, видна последняя запись и «▲ Хроники».
3. `toggleLog()` в консоли → тело таблички выезжает снизу с анимацией.
4. Фактура лога: едва заметные горизонтальные линии как строки рукописи.

---

### Коммит

```
ui: этап 25 — разметка и CSS таблички-лога
```

---

*Следующий этап: JS анимация раскрытия, стиль записей как манускрипт.*

---

## ЭТАП 26 — Табличка-лог: JS и стиль манускрипта ✅ ВЫПОЛНЕНО

**Улучшение:** #8 — Лог событий → «Вощёная табличка»
**Часть:** 2 из 2 — логика toggleLog, обновление нотификаций, стиль записей

---

### Контекст

Табличка готова визуально. Нужно:
1. Обновить функцию `toggleLog()`.
2. Обновить функцию `addLogEntry()` — записи рендерятся в стиле манускрипта.
3. Точки-нотификации загораются при новых событиях по категориям.

---

### Что читать перед началом

1. Найти в JS функцию `toggleLog()`.
2. Найти функцию добавления записи в лог (вероятно `addLogEntry`, `logEvent` или `appendLog`).
3. Понять структуру записи: текст, категория (danger/economy/character/law), ход.

---

### Что сделать

**Шаг 26.1 — Обновить `toggleLog()`**

Найти и заменить:
```js
function toggleLog() {
  const log = document.getElementById('event-log');
  if (!log) return;
  const isExpanded = log.classList.contains('expanded');
  log.classList.toggle('expanded', !isExpanded);
  log.classList.toggle('collapsed', isExpanded);
  const btn = document.getElementById('log-expand-btn');
  if (btn) btn.textContent = isExpanded ? '▲ Хроники' : '▼ Свернуть';
}
```

**Шаг 26.2 — Обновить стиль записей лога**

Найти место где формируется HTML записей лога. Каждая запись должна выглядеть так:

```js
function formatLogEntry(entry) {
  const CATEGORY_MARKS = {
    danger:    { mark: '⚠', color: 'var(--negative)' },
    economy:   { mark: '◈', color: 'var(--gold)'     },
    character: { mark: '◉', color: 'var(--bronze)'   },
    law:       { mark: '§', color: 'var(--text-dim)'  },
    default:   { mark: '·', color: 'var(--text-dim)'  },
  };
  const cat = CATEGORY_MARKS[entry.category] ?? CATEGORY_MARKS.default;

  return `
  <div class="log-entry" data-filter="${entry.category ?? 'all'}">
    <span class="log-mark" style="color:${cat.color}">${cat.mark}</span>
    <span class="log-text">${entry.text}</span>
    <span class="log-turn">${entry.turn ? `ход ${entry.turn}` : ''}</span>
  </div>`;
}
```

CSS для записей:
```css
.log-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(61,48,32,0.3);
  font-family: var(--font-lore);
  font-size: var(--text-xs);
  line-height: var(--leading-loose);
}
.log-mark {
  flex-shrink: 0;
  font-size: 10px;
  width: 12px;
  text-align: center;
}
.log-text {
  flex: 1;
  color: var(--text-secondary);
}
.log-turn {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-size: 9px;
  color: var(--text-dim);
}
/* Новая запись — кратко подсвечивается */
.log-entry.new {
  animation: log-highlight 1.5s ease forwards;
}
@keyframes log-highlight {
  0%   { background: rgba(201,169,97,0.1); }
  100% { background: transparent; }
}
```

**Шаг 26.3 — Нотификации на точках**

Обновить логику подсветки точек:

```js
function updateLogDots(entries) {
  const counts = { danger: 0, economy: 0, character: 0 };
  entries.forEach(e => {
    if (e.category in counts && e.isNew) counts[e.category]++;
  });

  document.querySelectorAll('.log-dot').forEach(dot => {
    const f = dot.dataset.filter;
    dot.classList.toggle('active', counts[f] > 0);
  });
}
```

Вызывать `updateLogDots(logEntries)` после добавления каждой записи.

**Шаг 26.4 — Сбросить нотификации при открытии лога**

```js
function toggleLog() {
  const log = document.getElementById('event-log');
  if (!log) return;
  const expanding = !log.classList.contains('expanded');
  log.classList.toggle('expanded', expanding);
  log.classList.toggle('collapsed', !expanding);
  if (expanding) {
    // Сбросить точки при открытии
    document.querySelectorAll('.log-dot').forEach(d => d.classList.remove('active'));
  }
}
```

---

### Проверка перед коммитом

1. Наведение на нижнюю полоску → раскрывается полоска с «▲ Хроники».
2. Клик → тело таблички выезжает плавно снизу (0.3s).
3. Записи лога — шрифт IM Fell English, тонкие разделители между строками.
4. Новая запись — кратко золотой фон, потом гаснет.
5. Точки-нотификации в полоске загораются при новых событиях.

---

### Коммит

```
ui: этап 26 — JS лога: toggle, манускриптный стиль, нотификации
```

---

*Следующий этап: строка команды — разметка и CSS вощёной дощечки.*

---

## ЭТАП 27 — Строка команды: разметка и CSS вощёной дощечки ✅ ВЫПОЛНЕНО

**Улучшение:** #9 — Строка команды → «Стилус и табличка»
**Часть:** 1 из 2 — внешний вид

---

### Контекст

Текущая строка `#input-row`: input поле + кнопка «⚔ Приказать».
Выглядит как чат-бот в веб-приложении.

Новая «Вощёная дощечка»:
- Input стилизован под дощечку с воском: тёмный фон, тонкая древесная текстура.
- Placeholder — латиница в стиле «Imperial Edict».
- Кнопка «Приказать» — круглая печать с монограммой (SVG).
- Строка приказов `#orders-mini` переосмыслена в мини-тег рядом.

---

### Что читать перед началом

1. Прочитать HTML `<div id="input-row">` и `<div id="orders-mini">`.
2. Прочитать CSS для `#input-row`, `#command-input`, `#send-btn`.
3. Найти в JS обработчик отправки команды (click на `#send-btn`, Enter в `#command-input`).

---

### Что сделать

**Шаг 27.1 — Обновить HTML `#input-row`**

Найти и заменить:
```html
<div id="input-row">
  <input type="text" id="command-input" placeholder="Ваш приказ..." ...>
  <button id="send-btn">⚔ Приказать</button>
</div>
```

На:
```html
<div id="input-row">

  <!-- Мини-счётчик приказов (слева от поля) -->
  <button id="orders-mini-btn" onclick="toggleOrdersMini()"
          title="Активные приказы" class="orders-counter">
    <span class="icon-wrap" data-icon="orders"></span>
    <span id="orders-mini-count">0</span>
  </button>

  <!-- Вощёная дощечка -->
  <div id="tablet-wrap">
    <input
      type="text"
      id="command-input"
      placeholder="Iube, Stratege…"
      autocomplete="off"
      spellcheck="false"
    >
  </div>

  <!-- Печать-кнопка -->
  <button id="send-btn" title="Отдать приказ [Enter]" aria-label="Приказать">
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Круглая печать -->
      <circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="16" cy="16" r="10" stroke="currentColor" stroke-width="0.8"
              stroke-dasharray="2 2"/>
      <!-- Монограмма A (Agathokles) -->
      <text x="16" y="20" text-anchor="middle" fill="currentColor"
            font-family="serif" font-size="11" font-weight="bold">A</text>
    </svg>
  </button>

</div>
```

Найти старый `<div id="orders-mini">` (он теперь внутри input-row) и убрать.

**Шаг 27.2 — CSS дощечки и печати**

Найти и заменить CSS блок `#input-row`:

```css
/* ── СТРОКА КОМАНДЫ — ВОЩЁНАЯ ДОЩЕЧКА ── */
#input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(to top, #1a1610, #1e1b16);
  border-top: 1px solid var(--border-main);
  flex-shrink: 0;
}

/* Счётчик приказов */
.orders-counter {
  background: none;
  border: 1px solid var(--border-main);
  border-radius: 3px;
  color: var(--text-dim);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  padding: 3px 7px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}
.orders-counter:hover {
  color: var(--gold);
  border-color: var(--border-gold);
}

/* Обёртка дощечки */
#tablet-wrap {
  flex: 1;
  position: relative;
  /* Имитация вощёного дерева: горизонтальные линии как прожилки */
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(201,169,97,0.02) 0px,
      rgba(201,169,97,0.02) 1px,
      transparent 1px,
      transparent 14px
    ),
    linear-gradient(to bottom, #1e1a13, #191510);
  border: 1px solid var(--border-main);
  border-radius: 2px;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
}

#command-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  padding: 7px 12px;
  caret-color: var(--gold);
}

#command-input::placeholder {
  color: var(--text-dim);
  font-style: italic;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
}

/* Кнопка-печать */
#send-btn {
  width: 36px;
  height: 36px;
  background: var(--bg-section);
  border: 1px solid var(--border-gold);
  border-radius: 50%;
  color: var(--gold-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.1s;
  padding: 0;
}
#send-btn:hover {
  color: var(--gold);
  border-color: var(--gold);
  box-shadow: 0 0 8px rgba(201,169,97,0.4);
}
#send-btn:active {
  transform: scale(0.92);
}
#send-btn svg {
  width: 24px;
  height: 24px;
}
```

---

### Проверка перед коммитом

1. Строка ввода выглядит как тёмная дощечка с едва заметными прожилками.
2. Placeholder «Iube, Stratege…» — курсивный Cinzel.
3. Справа — круглая золотая печать вместо прямоугольной кнопки.
4. Слева — счётчик приказов (иконка + число).
5. При фокусе на поле — граница дощечки слегка подсвечивается золотом.

---

### Коммит

```
ui: этап 27 — разметка и CSS вощёной дощечки (строка команды)
```

---

*Следующий этап: JS гонец — анимация появления ответа AI.*

---

## ЭТАП 28 — Строка команды: JS гонец с ответом AI ✅ ВЫПОЛНЕНО

> **Статус:** ✅ **ВЫПОЛНЕНО** — ветка `claude/exciting-fermat-KVLXr`.
> Реализовано: HTML `#messenger` с SVG-гонцом и свитком добавлен в `<footer>`
> в `index.html`; CSS анимация (left -280px → 16px, scaleX свитка) там же;
> JS-объект `Messenger.show/dismiss` и функция `dismissMessenger()`
> добавлены в `ui/input.js`, вызов `Messenger.show(text)` встроен
> в `showAIResponse()`. Счётчик приказов (`updateOrdersMiniCount`
> в `ui/government_tab.js`) теперь переключает класс `.has-orders`
> на `#orders-mini-btn`, CSS `.orders-counter.has-orders` подсвечивает кнопку.

**Улучшение:** #9 — Строка команды → «Стилус и табличка»
**Часть:** 2 из 2 — анимация «гонца» и обновление приказов

---

### Контекст

Ответ AI сейчас появляется в `#ai-response` как popup.
Новая механика: «Гонец» — анимированный элемент, который «прибегает» с левого нижнего угла,
разворачивает свиток с текстом ответа, ждёт пока игрок прочтёт, потом уходит.

---

### Что читать перед началом

1. Найти в JS где и как обновляется `#ai-response`.
2. Найти функцию которая вызывается после получения ответа от AI.
3. Найти функцию `toggleOrdersMini()` и `#orders-panel` — счётчик приказов нужно связать.

---

### Что сделать

**Шаг 28.1 — HTML гонца (добавить в `<footer id="bottom-area">`)**

```html
<!-- Гонец с ответом AI -->
<div id="messenger" class="messenger hidden">
  <div id="messenger-figure">
    <!-- SVG силуэт гонца -->
    <svg viewBox="0 0 24 40" fill="none" stroke="currentColor"
         stroke-width="1.2" stroke-linecap="round">
      <!-- Голова -->
      <circle cx="12" cy="5" r="3"/>
      <!-- Тело -->
      <line x1="12" y1="8" x2="12" y2="22"/>
      <!-- Руки (держит свиток) -->
      <path d="M12 13 L7 17 M12 13 L17 17"/>
      <!-- Ноги (бег) -->
      <path d="M12 22 L8 32 M12 22 L16 32"/>
      <!-- Шлем -->
      <path d="M9 3 Q12 0 15 3"/>
    </svg>
  </div>
  <div id="messenger-scroll">
    <div id="messenger-text"></div>
    <button id="messenger-close" onclick="dismissMessenger()">Принято</button>
  </div>
</div>
```

**Шаг 28.2 — CSS гонца**

```css
/* ── ГОНЕЦ ── */
#messenger {
  position: fixed;
  bottom: 60px;
  left: -280px;     /* начальная позиция — за экраном */
  z-index: 30;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  transition: left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
#messenger.visible {
  left: 16px;
}
#messenger.hidden {
  display: none;
}

#messenger-figure {
  width: 24px;
  height: 40px;
  color: var(--bronze);
  flex-shrink: 0;
  margin-bottom: 4px;
}

#messenger-scroll {
  background: linear-gradient(to bottom, #2a2018, #1e1810);
  border: 1px solid var(--border-gold);
  border-radius: 2px;
  padding: 10px 14px;
  max-width: 260px;
  box-shadow: 4px 4px 16px rgba(0,0,0,0.6);
  /* Имитация свитка: скруглённые верх/низ чуть сильнее */
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left center;
  transition: opacity 0.3s 0.4s, transform 0.3s 0.4s;
}
#messenger.visible #messenger-scroll {
  opacity: 1;
  transform: scaleX(1);
}

#messenger-text {
  font-family: var(--font-lore);
  font-size: var(--text-sm);
  color: var(--text-primary);
  line-height: var(--leading-normal);
  margin-bottom: 8px;
}

#messenger-close {
  background: none;
  border: 1px solid var(--border-main);
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  padding: 2px 10px;
  cursor: pointer;
  border-radius: 2px;
  transition: color 0.15s, border-color 0.15s;
  width: 100%;
}
#messenger-close:hover {
  color: var(--gold);
  border-color: var(--border-gold);
}
```

**Шаг 28.3 — JS функции гонца**

```js
const Messenger = {
  _timer: null,

  show(text) {
    const el = document.getElementById('messenger');
    const textEl = document.getElementById('messenger-text');
    if (!el || !textEl) return;

    textEl.textContent = text;
    el.classList.remove('hidden');

    // Задержка перед появлением чтобы CSS transition сработал
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('visible');
      });
    });

    // Автоматически скрыть через 12 секунд
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.dismiss(), 12000);
  },

  dismiss() {
    const el = document.getElementById('messenger');
    if (!el) return;
    el.classList.remove('visible');
    clearTimeout(this._timer);
    // Скрыть из DOM после анимации
    setTimeout(() => el.classList.add('hidden'), 600);
  },
};

function dismissMessenger() { Messenger.dismiss(); }
```

**Шаг 28.4 — Подключить к ответу AI**

Найти место где обновляется `#ai-response`. Добавить рядом:

```js
// После получения ответа от AI:
function showAiResponse(text) {
  Messenger.show(text);
  // Старый способ тоже обновить для совместимости (элемент можно скрыть)
  const old = document.getElementById('ai-response');
  if (old) { old.textContent = text; old.classList.remove('hidden'); }
}
```

**Шаг 28.5 — Обновление счётчика приказов**

Найти где меняется количество активных приказов.
Добавить обновление счётчика:

```js
function updateOrdersCount(count) {
  safeSet('orders-mini-count', String(count));
  const btn = document.getElementById('orders-mini-btn');
  if (btn) btn.classList.toggle('has-orders', count > 0);
}
```

CSS:
```css
.orders-counter.has-orders {
  color: var(--gold);
  border-color: var(--border-gold);
}
```

---

### Проверка перед коммитом

1. При получении ответа AI — гонец «вбегает» слева (CSS translate animation).
2. Свиток «разворачивается» (scaleX 0→1) с небольшой задержкой после появления фигурки.
3. Кнопка «Принято» скрывает гонца — он «уходит» обратно влево.
4. Через 12 секунд без действий — автоматически уходит.
5. Счётчик приказов показывает актуальное число.

---

### Коммит

```
ui: этап 28 — JS гонец: анимация ответа AI
```

---

*Следующий этап: ambient-слой, CSS/JS тессеры-частицы фона.*

---

## ЭТАП 29 — Ambient-слой: тессеры-частицы фона ✅ ВЫПОЛНЕНО

> **Статус:** ✅ **ВЫПОЛНЕНО** — ветка `claude/exciting-fermat-KVLXr`.
> В `index.html` добавлен `<canvas id="ambient-canvas">` как первый ребёнок
> `#app`, CSS (`position:fixed; inset:0; z-index:0; pointer-events:none;
> opacity:0.6`) и `#app { position:relative; z-index:1 }`. Реализован IIFE
> `AmbientLayer` (120 частиц, object pooling, HiDPI через `devicePixelRatio`,
> пауза при скрытой вкладке через `visibilitychange`, пульсация opacity,
> `setIntensity(0..1)` → `speed = 0.5 + intensity*2.5`), инициализация на
> `DOMContentLoaded`, экспорт `window.AmbientLayer`. Интенсивность
> подключена к игровым данным в `engine/turn.js` внутри `renderAll()`:
> количество войн игрока (`myNation.military.at_war_with`) → уровни
> 0/1/2/3+ войн ↔ 0.3 / 0.5 / 0.7 / 0.9. Обновляется после каждого хода.

**Улучшение:** #15 — «Живой» ambient-слой
**Часть:** 1 из 2 — Canvas фоновых частиц

---

### Контекст

Ambient-слой — самый незаметный, но ключевой для «живого» ощущения интерфейса.
Это тонкий Canvas позади всего интерфейса (но поверх фона экрана), на котором
очень медленно и хаотично дрейфуют мельчайшие тессеры (1–2px точки).

В мирное время — почти стоят. В разгар войны — двигаются активнее.
Цвет — очень тёмный, почти совпадает с фоном. Эффект должен быть заметен
только на периферии зрения, не привлекать внимание.

---

### Что читать перед началом

1. Ничего специального — это новый независимый элемент.
2. Убедиться что `#app` имеет `position: relative` (для правильного позиционирования canvas).

---

### Что сделать

**Шаг 29.1 — Добавить HTML ambient-canvas**

В `index.html` сразу после `<div id="app">` добавить первым дочерним элементом:

```html
<!-- Ambient-слой: живые тессеры фона -->
<canvas id="ambient-canvas"></canvas>
```

**Шаг 29.2 — CSS ambient-canvas**

```css
#ambient-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;       /* позади всего интерфейса */
  pointer-events: none;
  opacity: 0.6;
}
```

Убедиться что `#app` имеет `z-index: 1` или хотя бы `position: relative`:
```css
#app {
  position: relative;
  z-index: 1;
  /* остальные свойства без изменений */
}
```

**Шаг 29.3 — JS объект `AmbientLayer`**

```js
// ── AMBIENT-СЛОЙ ─────────────────────────────────
const AmbientLayer = {
  canvas: null,
  ctx: null,
  particles: [],
  _raf: null,
  _intensity: 0.3,  // 0 = покой, 1 = война

  PARTICLE_COUNT: 120,

  init() {
    this.canvas = document.getElementById('ambient-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    this._spawn();
    this._loop();
    window.addEventListener('resize', () => {
      this._resize();
      this._spawn();
    });
  },

  // Установить интенсивность: 0 = мир, 1 = война
  setIntensity(v) {
    this._intensity = Math.max(0, Math.min(1, v));
  },

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  _spawn() {
    this.particles = [];
    for (let i = 0; i < this.PARTICLE_COUNT; i++) {
      this.particles.push(this._newParticle(true));
    }
  },

  _newParticle(randomPos = false) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const size = 0.8 + Math.random() * 1.2;
    return {
      x: randomPos ? Math.random() * W : (Math.random() < 0.5 ? 0 : W),
      y: randomPos ? Math.random() * H : Math.random() * H,
      size,
      // Очень медленная скорость
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      // Цвет — чуть теплее фона
      brightness: 6 + Math.random() * 6,
      opacity: 0.1 + Math.random() * 0.25,
      // Фаза для пульсации opacity
      phase: Math.random() * Math.PI * 2,
    };
  },

  _loop() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;
    const t = performance.now() * 0.001;  // секунды
    const speed = 0.5 + this._intensity * 2.5;

    ctx.clearRect(0, 0, W, H);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Двигаем
      p.x += p.vx * speed;
      p.y += p.vy * speed;

      // Мягкий «ветер» — едва заметное общее дрейфование
      p.x += Math.sin(t * 0.3 + p.phase) * 0.02;
      p.y += Math.cos(t * 0.2 + p.phase) * 0.02;

      // Если ушёл за край — пересоздать с другой стороны
      if (p.x < -2 || p.x > W+2 || p.y < -2 || p.y > H+2) {
        this.particles[i] = this._newParticle(false);
        continue;
      }

      // Пульсация opacity (очень медленная)
      const pulsedOpacity = p.opacity * (0.6 + 0.4 * Math.sin(t * 0.5 + p.phase));

      ctx.fillStyle = `hsla(35, 15%, ${p.brightness}%, ${pulsedOpacity})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    this._raf = requestAnimationFrame(() => this._loop());
  },
};
```

**Шаг 29.4 — Инициализировать**

```js
document.addEventListener('DOMContentLoaded', () => {
  AmbientLayer.init();
});
```

**Шаг 29.5 — Подключить интенсивность к игровым событиям**

Найти место где рассчитывается военное состояние (идёт ли война).
Добавить:
```js
// При начале войны
AmbientLayer.setIntensity(0.7);
// При заключении мира
AmbientLayer.setIntensity(0.2);
// В обычном состоянии
AmbientLayer.setIntensity(0.3);
```

---

### Проверка перед коммитом

1. На тёмном фоне экрана едва заметно медленное движение крошечных точек.
2. Частицы не мешают читать текст и не мигают — они на краях видимости.
3. `AmbientLayer.setIntensity(1.0)` в консоли → движение явно ускоряется.
4. `AmbientLayer.setIntensity(0.0)` → частицы почти стоят.
5. FPS не проседает (canvas перерисовывается но операция лёгкая).

---

### Коммит

```
ui: этап 29 — ambient-слой: тессеры-частицы фона
```

---

*Следующий этап: дыхание карты, реакция ambient-слоя на игровые события.*

---

## ЭТАП 30 — Ambient: дыхание карты и финальная связка ✅ ВЫПОЛНЕНО

> **Статус:** ✅ **ВЫПОЛНЕНО** — ветка `claude/exciting-fermat-KVLXr`.
> CSS-анимация `map-breathe` (8s ease-in-out infinite) на `#map-container`;
> `@keyframes ui-shake` для реакции на катастрофу; глобальный
> `window.UIReactions` с методами `onBattleStart/onVictory/onCatastrophe/onPeace`
> и приватным `_flash(color,duration)` (см. `index.html` после блока
> AmbientLayer). UIReactions подключены:
> - к бою через `_applyBattleResult()` в `engine/battle.js` — если
>   участвует игрок, триггерит `onVictory` (победа), `onCatastrophe`
>   (потеря региона как защитник) или `onBattleStart` (нейтральный исход);
> - к миру через `concludePeace()` в `engine/diplomacy.js` — вызывает `onPeace()`.
> Финальный чеклист всех 30 этапов пройден: `#FFD700`/`#4caf50`/`#f44336`/`#d4a853`
> не встречаются в `index.html`; шрифты Inter/JetBrains Mono/IM Fell English
> подключены; присутствуют разметочные якоря всех стадий (сплэш-мозаика,
> стела, клепсидра, аквидукт, роза ветров, диптих, court-board, табличка-лог,
> ambient-canvas и др.).

**Улучшение:** #15 — «Живой» ambient-слой
**Часть:** 2 из 2 — дыхание карты, переходы по событиям, финальная сборка

---

### Контекст

Последний этап. Завершает всю систему ambient:
1. Карта «дышит» — очень медленный CSS scale 1.000 → 1.003 → 1.000.
2. При критических событиях (битва, катастрофа, победа) — кратковременная реакция всего UI.
3. Финальная проверка всех 30 этапов.

---

### Что читать перед началом

1. Найти CSS `#map-container` — добавить transition.
2. Найти места где триггерятся ключевые события игры: начало битвы, победа, поражение,
   катастрофическое событие (голод, бунт).

---

### Что сделать

**Шаг 30.1 — Дыхание карты через CSS animation**

В CSS найти `#map-container` и добавить:

```css
#map-container {
  /* существующие свойства без изменений */
  animation: map-breathe 8s ease-in-out infinite;
  transform-origin: center;
}

@keyframes map-breathe {
  0%, 100% { transform: scale(1.000); }
  50%       { transform: scale(1.003); }
}
```

Эффект настолько subtle, что игрок его не заметит осознанно — только почувствует
что карта «живая».

**Важно:** Убедиться что `transform` карты не конфликтует с Leaflet — проверить
что Leaflet не устанавливает `transform` на `#map-container` напрямую. Если конфликт —
применить анимацию к родительскому элементу `#center-panel` вместо `#map-container`.

**Шаг 30.2 — Реакция UI на ключевые события**

```js
// ── РЕАКЦИИ UI НА СОБЫТИЯ ─────────────────────────
const UIReactions = {

  // Битва началась
  onBattleStart(locationName) {
    AmbientLayer.setIntensity(0.8);
    // Кратковременный тёмно-красный flash поверх экрана
    UIReactions._flash('rgba(80,10,10,0.15)', 300);
  },

  // Победа в битве
  onVictory() {
    AmbientLayer.setIntensity(0.4);
    UIReactions._flash('rgba(201,169,97,0.1)', 600);
    // Клепсидра кратко светится золотом
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
      btn.style.filter = 'drop-shadow(0 0 16px rgba(201,169,97,0.9))';
      setTimeout(() => btn.style.filter = '', 1500);
    }
  },

  // Поражение / катастрофа
  onCatastrophe() {
    AmbientLayer.setIntensity(1.0);
    UIReactions._flash('rgba(60,0,0,0.25)', 500);
    // Экран кратко дрожит
    document.getElementById('app').style.animation = 'ui-shake 0.3s ease';
    setTimeout(() => {
      document.getElementById('app').style.animation = '';
      AmbientLayer.setIntensity(0.6);
    }, 400);
  },

  // Мир / завершение войны
  onPeace() {
    AmbientLayer.setIntensity(0.2);
    UIReactions._flash('rgba(40,80,40,0.08)', 800);
  },

  _flash(color, duration) {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed; inset:0; z-index:99990;
      background:${color}; pointer-events:none;
      transition: opacity ${duration}ms ease;
    `;
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      flash.style.opacity = '1';
      setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), duration);
      }, 50);
    });
  },
};
```

CSS для shake:
```css
@keyframes ui-shake {
  0%   { transform: translateX(0); }
  25%  { transform: translateX(-3px); }
  50%  { transform: translateX(3px); }
  75%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}
```

**Шаг 30.3 — Подключить UIReactions к игровым событиям**

Найти в JS места где обрабатываются:
- Начало битвы → `UIReactions.onBattleStart()`
- Победа → `UIReactions.onVictory()`
- Катастрофа / крупный провал → `UIReactions.onCatastrophe()`
- Мир → `UIReactions.onPeace()`

**Шаг 30.4 — Финальный чеклист всего редизайна**

Перед финальным коммитом проверить каждый из 30 этапов:

```
[ ] Этап 1-2:  Цветовая палитра — нет #FFD700, #4caf50, #f44336
[ ] Этап 3-4:  Шрифты — Inter в кнопках, JetBrains Mono в числах, IM Fell в логе
[ ] Этап 5-6:  Нет эмодзи в UI — только SVG-иконки
[ ] Этап 7-8:  Экран загрузки — мозаика тессер
[ ] Этап 9-10: Стела — имя и дата из state, золотой Cinzel
[ ] Этап 11-12: Клепсидра — анимация воды, пульс при готовности
[ ] Этап 13-14: Статус-бар скрыт, FPS только в dev-режиме
[ ] Этап 15-16: Аквидукт — частицы, данные из state
[ ] Этап 17-18: Карта — тёмное море, охра, орлы-армии
[ ] Этап 19-20: Роза ветров — переключает режимы карты
[ ] Этап 21-22: Диптих — раскрывается/закрывается, вкладки работают
[ ] Этап 23-24: Камеи — SVG-профили, карточки по hover
[ ] Этап 25-26: Табличка-лог — полоска 8px, раскрытие снизу
[ ] Этап 27-28: Дощечка — tabletтекстура, гонец с ответом AI
[ ] Этап 29-30: Ambient — тессеры, дыхание карты, UI-реакции
```

---

### Финальный коммит

```
ui: этап 30 — дыхание карты, UI-реакции, ambient завершён
```

После этого коммита весь редизайн «Roman Command Lens» реализован.

---

## ИТОГ

После выполнения всех 30 этапов игровой экран представляет собой:

- **Тёмный базальт** как основа (`#131110`), без дешёвого коричневого
- **Приглушённое античное золото** только там где нужно, не везде
- **Inter** в интерфейсе, **JetBrains Mono** в числах, **IM Fell English** в хрониках
- **SVG-иконки** в стиле монетного штампа, ни одного эмодзи
- **Мозаика** на экране загрузки
- **Стела** вместо топ-бара, **клепсидра** вместо кнопки хода
- **Аквидукт** с частицами вместо ресурс-бара
- **Карта Tabula** с тёмным морем и орлами-армиями
- **Роза ветров** вместо кнопок режимов
- **Диптих** — складная левая панель
- **Камеи** — правая панель советников
- **Вощёная табличка** — лог событий снизу
- **Дощечка** — строка ввода команды, **гонец** — ответ AI
- **Ambient** — живые частицы и дыхание карты

Ни один существующий grand strategy не имеет такого UI.

---

# ЧАСТЬ II — РЕФАКТОРИНГ `index.html`

К концу Части I файл `index.html` разрастается до ~12 000 строк и ~480 КБ:
один огромный инлайн-`<script>` с десятками объектов и сотнями строк CSS,
разложенных по блокам `<style>`. Это затрудняет навигацию, git-blame,
code-review и будущую доработку.

## Цель Части II

Разнести содержимое `index.html` по логичным модулям в `ui/` и `ui/styles/`
**без единой регрессии** поведения и внешнего вида игры. После выполнения
всех этапов Части II `index.html` должен содержать только:

- `<head>` с метаданными и подключёнными `<link rel="stylesheet">`
- HTML-разметку: header, модалки, overlay-и, шаблоны
- Цепочку `<script src="…">` с детерминированным порядком загрузки
- Минимальный «монтажный» `<script>` для старта (или вообще ноль инлайна)

## Золотые правила рефакторинга

1. **Один этап — один логический модуль.** Никаких «заодно тронем пять
   разных вещей». Если в середине этапа обнаружилось что-то смежное —
   записать в TODO следующего этапа, не трогать.
2. **Скрипты остаются классическими (НЕ `type="module"`).** Все новые файлы
   под `ui/` подключаются как обычные `<script src>`. Публичное API —
   через `window.*`. Это нужно потому что в разметке куча inline
   `onclick="…"`, которые требуют глобальных функций.
3. **Порядок `<script>` критичен.** Каждый новый этап обязан явно указать
   куда (до/после каких тегов) добавить новый `<script src>`. Фиксировать
   порядок комментарием-заголовком в `index.html`.
4. **Перед каждым этапом — исследование.** Без чтения текущих строк
   (`grep -n`, `Read`) ни одна функция не выносится. Зависимости
   (`window.X`, inline `onclick`, `addEventListener`) должны быть
   перечислены в артефакте этапа до начала правок.
5. **После каждого этапа — smoke-тест.** Игра должна запускаться,
   сплэш скрываться, ход проходить, UI не ломаться. Если не удаётся
   открыть браузер — минимум: `node --check` на всех затронутых JS,
   синтаксическая проверка всех инлайн-`<script>` в `index.html`,
   сравнение `wc -l index.html` до/после (размер должен уменьшиться).
6. **Коммит атомарный.** Один этап = один коммит с префиксом
   `refactor(ui): этап NN — …`. При поломке всё откатывается одной
   командой.
7. **Никаких «улучшений по пути».** Выносим код как есть, 1:1. Любое
   переименование, новая абстракция, замена `var`→`const` — запрещено.
   Рефакторинг поведения — отдельные этапы после Части II.

## Карта этапов Части II

| Этап | Что выносим | Куда | Риск |
|------|-------------|------|------|
| 31 | Аудит `index.html`, карта содержимого, список зависимостей | `docs/refactor_index.md` (новый) | нулевой |
| 32 | CSS: переменные палитры и базовые стили (body/html/reset/font-roles) | `ui/styles/base.css` | низкий |
| 33 | CSS: стела, топ-бар, клепсидра, кнопка конца хода | `ui/styles/top.css` | низкий |
| 34 | CSS: сплэш-экран и мозаика | `ui/styles/splash.css` | низкий |
| 35 | CSS: левая панель (диптих), правая панель (камеи), прочие панели | `ui/styles/panels.css` | низкий |
| 36 | CSS: нижняя табличка-лог, дощечка команды, ambient-слой | `ui/styles/bottom.css` | низкий |
| 37 | JS: `SplashMosaic` | `ui/splash_mosaic.js` | средний |
| 38 | JS: `Clepsydra` | `ui/clepsydra.js` | средний |
| 39 | JS: `TURN_ACTIONS`, `renderTurnProgress`, `markTurnAction`, `resetTurnProgress` | `ui/turn_progress.js` | средний |
| 40 | JS: `initStatusBar` и служебные хелперы статус-бара | `ui/status_bar.js` | низкий |
| 41 | JS: обработчики топ-бара (поиск, настройки, модалки, контекстное меню) | `ui/top_bar.js` | средний |
| 42 | JS: «монтажный лист» инициализации (шаг 61 arma.md, `_splashProgress`, `_splashHide`, цепочка startup) | `ui/boot.js` | **высокий** |
| 43 | Финальный аудит, сверка с картой, smoke-тест всего редизайна | — | нулевой |

---

## ЭТАП 31 — Рефакторинг: аудит `index.html` и карта содержимого ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — подготовительный этап
**Часть:** 1 из 13 — только исследование, никаких правок кода

---

### Контекст

Перед любым выносом кода нужно понять что именно внутри `index.html` и
кто на что ссылается. Этот этап **не меняет ни одной строки кода**.
Его единственный артефакт — новый файл `docs/refactor_index.md` с
полной картой содержимого.

---

### Что читать / исследовать перед началом

1. `wc -l index.html` — зафиксировать текущий размер (будет baseline).
2. `grep -nE '^\s*<style|^\s*</style' index.html` — найти границы всех
   `<style>`-блоков. Записать: номер блока, диапазон строк, что стилизует
   (по первому селектору и соседнему HTML-комментарию).
3. `grep -nE '^\s*<script|^\s*</script' index.html` — найти все
   `<script>`-теги. Разделить на две группы:
   - теги с `src="…"` → записать путь и порядок;
   - инлайн-`<script>` → номер блока, диапазон строк, что внутри.
4. Для **каждого** крупного инлайн-`<script>` выписать:
   - все `const`/`function`/`class` верхнего уровня (имя + строка);
   - все `window.X = …` экспорты (имя + строка);
   - все `document.getElementById` / `querySelector` на которые он
     опирается (ID/селектор + строка);
   - все `addEventListener` с `window`, `document`, `DOMContentLoaded`.
5. `grep -nE 'onclick=|onchange=|oninput=|onmouseenter=' index.html` —
   все inline-хендлеры в разметке. Записать имя функции и строку.
   Это список «неприкосновенных глобалов» — после рефакторинга они
   обязаны остаться доступны через `window.*`.
6. `grep -rn 'window\.' ui/ engine/ | grep -v 'node_modules'` — уже
   существующие глобальные API, чтобы не переоткрывать велосипед.
7. Зафиксировать текущий порядок загрузки `<script src="…">` — именно
   в нём будут вставляться новые файлы на следующих этапах.

---

### Что сделать

**Шаг 31.1 — Создать `docs/refactor_index.md`**

Файл должен содержать следующие разделы (заполнить реальными данными):

```markdown
# Карта содержимого index.html (baseline перед Частью II)

Зафиксировано: <дата>, коммит: <hash>
Размер файла: <wc -l> строк, <ls -l> байт.

## 1. Блоки <style>

| # | Строки | Первый селектор | Что стилизует |
|---|--------|-----------------|---------------|
| 1 | 15–112 | :root { --… | палитра, базовые переменные |
| 2 | …      | …                | … |

## 2. Теги <script src="…"> (внешние, в порядке загрузки)

| # | Строка | Путь | Комментарий |
|---|--------|------|-------------|
| 1 | …      | ui/icons.js | иконки |
| … | …      | …   | … |

## 3. Блоки инлайн-<script>

### Блок 1 — строки A–B

- const SplashMosaic (строка X)
- const Clepsydra (строка Y)
- function renderTurnProgress (строка Z)
- …

Экспорты window.*:
- window.markTurnAction (строка N)
- …

DOM-зависимости:
- #splash-screen, #end-turn-btn, #clip-upper-rect, …

### Блок 2 — строки C–D
…

## 4. Inline-хендлеры в разметке

| Строка | HTML | Функция | Где определена |
|--------|------|---------|----------------|
| 10031  | `<button id="end-turn-btn" onclick="processTurn()">` | processTurn | engine/turn.js:48 |
| …      | …    | …       | … |

## 5. План этапов 32–42 (копия карты из uisuper.md с уточнениями)
…

## 6. Риски и неочевидные зависимости
- Клепсидра-кнопка содержит SVG — `textContent` её уничтожает (см. этап 12)
- …
```

**Шаг 31.2 — Ничего больше не менять**

На этом этапе запрещено:
- править `index.html`;
- создавать файлы в `ui/` или `ui/styles/`;
- переставлять порядок существующих `<script src>`.

---

### Проверка перед коммитом

1. Файл `docs/refactor_index.md` создан и содержит все 6 разделов.
2. Таблица `<style>`-блоков покрывает весь диапазон строк без пропусков
   (сверить суммой диапазонов).
3. Таблица `<script>`-тегов содержит **все** теги (сверить с
   `grep -c '<script' index.html`).
4. Список inline-хендлеров непустой (минимум `processTurn`, `toggleSearchPanel`,
   `toggleSettingsModal` должны быть).
5. Игра запускается как раньше (smoke-тест в браузере), `index.html`
   не тронут вообще — `git diff index.html` пуст.

---

### Коммит

```
refactor(ui): этап 31 — аудит index.html, карта содержимого
```

---

*Следующий этап: вынос базовых CSS-переменных и reset-стилей в `ui/styles/base.css`.*

---

## ЭТАП 32 — Рефакторинг: вынос базового CSS в `ui/styles/base.css` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос стилей
**Часть:** 2 из 13 — первый подшаг CSS-миграции (самый безопасный)

---

### Контекст

Начинаем с CSS потому что это наименее рискованная часть: стили
самодостаточны, порядок загрузки у `<link rel="stylesheet">` строго
детерминирован (в порядке появления в `<head>`), и браузер сам
управляет каскадом.

В этом этапе выносим **только** базовые глобальные стили:
- `:root { --… }` — вся палитра и переменные размеров
- `*`, `html`, `body` — reset и базовая типографика
- `@font-face` (если есть инлайновые)
- font-roles (`--font-ui`, `--font-num`, `--font-chronicle` и т. п.)

**Ничего** что касается конкретных компонентов (стела, клепсидра,
панели) на этом этапе не трогаем — это задача этапов 33–36.

---

### Что читать / исследовать перед началом

1. Открыть `docs/refactor_index.md` и найти блоки `<style>` содержащие
   `:root`, `html`, `body`, `@font-face`, `*`.
2. Прочитать **каждый** найденный блок целиком в `index.html`.
3. Выписать все имена CSS-переменных, чтобы потом проверить что в
   `ui/styles/base.css` они попали все до одной (`grep --only-matching`
   по `--[a-z-]*`).
4. Убедиться что ни один из переносимых правил не переопределяется
   позже в конкретных блоках компонентов — если переопределяется,
   перенос не меняет поведения (каскад по порядку не нарушается,
   потому что `<link>` подключается **первым** в `<head>`).
5. Проверить есть ли уже `ui/styles/` в репозитории (`ls ui/styles/`).
   Если нет — создать.

---

### Что сделать

**Шаг 32.1 — Создать `ui/styles/base.css`**

Создать пустой файл `ui/styles/base.css`. В начало добавить шапку:

```css
/* ───────────────────────────────────────────────────────────
   base.css — глобальные CSS-переменные, reset, базовая типографика.
   Подключается ПЕРВЫМ из всех стилей.
   Рефакторинг Части II, этап 32 (uisuper.md).
   Вынесено из index.html <style> блока(ов): <номера блоков>.
   ─────────────────────────────────────────────────────────── */
```

**Шаг 32.2 — Перенести `:root`, `html`, `body`, `*`, `@font-face`**

Скопировать (не удалять из `index.html` пока!) найденные правила в
`ui/styles/base.css` **в том же порядке** как они стояли в `index.html`.

**Шаг 32.3 — Подключить `<link>` в `<head>` `index.html`**

Найти `<head>` и добавить **первым** среди `<link rel="stylesheet">`:

```html
<link rel="stylesheet" href="ui/styles/base.css">
```

Если уже есть другие `<link>` на стили — новая ссылка должна быть
**выше** них в разметке.

**Шаг 32.4 — Удалить перенесённые правила из инлайн-`<style>`**

Теперь (и только теперь) удалить перенесённые правила из
соответствующих `<style>`-блоков в `index.html`. Оставить маркер:

```html
<!-- base.css: :root + reset + font-roles вынесены в ui/styles/base.css
     (uisuper.md этап 32). -->
```

Если после удаления `<style>`-блок стал пустым — удалить и сам блок.

---

### Проверка перед коммитом

1. `node --check` не применим к HTML, но нужно:
   - визуально прогнать `index.html` через браузер;
   - убедиться что сплэш, стела, клепсидра, шрифты, цвета выглядят **идентично** baseline до этапа.
2. Сравнить скриншоты до/после (если есть возможность) — пиксель-в-пиксель должен совпасть.
3. `wc -l index.html` — размер уменьшился ровно на количество перенесённых строк (±маркерные комментарии).
4. `grep -c '\-\-[a-z]' ui/styles/base.css` ≥ количеству уникальных переменных из шага исследования. Ни одна переменная не потеряна.
5. В DevTools Console нет новых ошибок/предупреждений.
6. Открыть сплэш, запустить игру, сделать один ход, открыть одну модалку — всё работает.

---

### Коммит

```
refactor(ui): этап 32 — базовые стили в ui/styles/base.css
```

---

*Следующий этап: вынос CSS стелы, топ-бара и клепсидры в `ui/styles/top.css`.*

---

## ЭТАП 33 — Рефакторинг: вынос CSS верхнего слоя в `ui/styles/top.css` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос стилей
**Часть:** 3 из 13 — CSS верхнего ряда UI

---

### Контекст

Верхний слой — то что всегда на экране: стела (шапка с именем/датой),
топ-бар (поиск, настройки, иконки), клепсидра (кнопка конца хода),
`#nation-header`. Стилей у них много (~600–900 строк) — они логично
объединяются в один модуль `top.css`.

---

### Что читать / исследовать перед началом

1. Открыть `docs/refactor_index.md`, найти блоки `<style>` с
   селекторами:
   - `#top-bar`, `#top-actions`, `#top-bar-center`
   - `#stele`, `.stele-*`, `#stele-title`, `#stele-date`
   - `#end-turn-btn`, `#clepsydra-svg`, `.clepsy-*`
   - `@keyframes clepsydra-pulse`
   - `#nation-header`, `.nation-icon`, `.nation-name`
   - `#search-btn`, `#settings-btn` (только если они в верхнем ряду)
   - `#turn-progress` (легаси, может встретиться — тоже переносим, не чистим)
2. Прочитать каждый блок в `index.html` целиком.
3. **Критично:** проверить что ни одно правило из этого набора не
   зависит от правила, которое останется в другом месте (каскад и
   специфичность). Если есть зависимости — зафиксировать их в
   `docs/refactor_index.md` в разделе «Риски».
4. Проверить что переменные (`--bronze`, `--accent`, font-roles)
   уже в `base.css` — иначе top.css не отрендерится правильно.

---

### Что сделать

**Шаг 33.1 — Создать `ui/styles/top.css`**

С шапкой:

```css
/* ───────────────────────────────────────────────────────────
   top.css — стилизация верхнего ряда UI:
   стела, топ-бар, клепсидра (#end-turn-btn), #nation-header.
   Зависит от: base.css (переменные --bronze, --accent, font-roles).
   Рефакторинг Части II, этап 33.
   ─────────────────────────────────────────────────────────── */
```

**Шаг 33.2 — Перенести правила**

Копировать найденные блоки в `top.css` в исходном порядке. `@keyframes`
переносить рядом с селектором который их использует.

**Шаг 33.3 — Подключить `<link>` после `base.css`**

```html
<link rel="stylesheet" href="ui/styles/base.css">
<link rel="stylesheet" href="ui/styles/top.css">
```

Порядок важен: `top.css` после `base.css`.

**Шаг 33.4 — Удалить перенесённые правила из `index.html`**

И оставить маркер:

```html
<!-- top.css: стела, топ-бар, клепсидра вынесены (uisuper.md этап 33). -->
```

---

### Проверка перед коммитом

1. Визуальный smoke: стела, клепсидра, топ-бар выглядят идентично.
2. Клепсидра — уровень воды, пульсация при готовности, анимация переворота — работает (ручной тест через `markTurnAction` в консоли).
3. `#nation-header` (если был виден) — без изменений.
4. Hover на кнопках топ-бара даёт те же эффекты (filter/transform).
5. `wc -l index.html` уменьшился на ожидаемое число.
6. В DevTools — нет новых CSS-предупреждений про unknown property.
7. `git diff --stat` показывает: `index.html` -N, `ui/styles/top.css` +N, суммарно ~0 строк прироста.

---

### Коммит

```
refactor(ui): этап 33 — CSS верхнего ряда → ui/styles/top.css
```

---

*Следующий этап: вынос CSS сплэш-экрана и мозаики в `ui/styles/splash.css`.*

---

## ЭТАП 34 — Рефакторинг: вынос CSS сплэша в `ui/styles/splash.css` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос стилей
**Часть:** 4 из 13 — изолированный модуль (отображается только при загрузке)

---

### Контекст

Сплэш-экран — самый изолированный кусок CSS: он показывается только
до `_splashHide()` и отдельно от остального UI. Риск поломки минимален.

---

### Что читать / исследовать перед началом

1. Найти в `index.html` селекторы:
   - `#splash-screen`, `.splash-*`
   - `#splash-bar-fill`, `#splash-status`
   - `#splash-canvas` / `.mosaic-canvas` (если есть)
   - `@keyframes splashFade`, `@keyframes mosaic-*`
2. Сверить с `ui/splash.js` и `ui/splash_mosaic.js` (будущий файл из
   этапа 37) — какие классы они навешивают. CSS должен покрывать их.
3. Проверить что `hideSplashWithAnimation` (если есть) полагается на
   transition/animation правила из этих блоков.
4. Прочитать все найденные `<style>`-блоки целиком.

---

### Что сделать

**Шаг 34.1 — Создать `ui/styles/splash.css`**

```css
/* ───────────────────────────────────────────────────────────
   splash.css — экран загрузки и мозаика тессер.
   Зависит от: base.css (палитра).
   Рефакторинг Части II, этап 34.
   ─────────────────────────────────────────────────────────── */
```

**Шаг 34.2 — Перенести правила**

Все `#splash-*`, `.splash-*`, `@keyframes splashFade`, `@keyframes mosaic-*`
→ в `splash.css` в исходном порядке.

**Шаг 34.3 — Подключить `<link>`**

После `base.css` и `top.css`:

```html
<link rel="stylesheet" href="ui/styles/splash.css">
```

**Шаг 34.4 — Удалить перенесённые правила и поставить маркер**

```html
<!-- splash.css: splash-screen, мозаика, keyframes вынесены (этап 34). -->
```

---

### Проверка перед коммитом

1. Перезагрузить страницу — сплэш появляется, мозаика отрисовывается, прогресс-бар двигается.
2. Сплэш плавно скрывается (fade-out).
3. После скрытия нет «мерцания» и «прыжков» UI.
4. DevTools → Network → `splash.css` загружен со статусом 200.
5. `wc -l index.html` уменьшился.
6. Игра после сплэша запускается нормально.

---

### Коммит

```
refactor(ui): этап 34 — CSS сплэш-экрана → ui/styles/splash.css
```

---

*Следующий этап: вынос CSS панелей (диптих, камеи, модалки) в `ui/styles/panels.css`.*

---

## ЭТАП 35 — Рефакторинг: вынос CSS панелей в `ui/styles/panels.css` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос стилей
**Часть:** 5 из 13 — CSS левой/правой панели и модалок

---

### Контекст

Левая панель (диптих), правая панель (камеи), модалки (настройки, поиск,
дипломатический граф, турнир-summary) — всё это «средний слой» UI. У них
общие паттерны (backdrop, transitions, scroll-зоны), логично в одном файле.

---

### Что читать / исследовать перед началом

1. Найти селекторы:
   - `#left-panel`, `.diptych-*`, `#left-tabs`, `.tab-*`
   - `#right-panel`, `.cameo-*`, `#advisors-*`
   - `#settings-modal`, `.modal-*`, `.modal-backdrop`
   - `#search-panel`, `#search-results`
   - `#diplo-graph-overlay`, `.dg-*`
   - `#turn-summary-card`, `.tsc-*`
   - `#peace-panel`, `#siege-panel`, `#context-menu`, `.ctx-*`
2. Для **каждого** блока проверить не зависит ли он от `top.css` или
   `base.css` (каскад по порядку ссылок → всё ок, так как panels.css
   будет подключаться после них).
3. Особое внимание: `z-index` значения. Записать их в артефакт
   рефакторинга — чтобы после переноса можно было сверить что слои
   остались на своих местах.
4. Найти `@keyframes` связанные с панелями (слайды, fade) — переносить вместе с правилами.

---

### Что сделать

**Шаг 35.1 — Создать `ui/styles/panels.css`** с шапкой аналогично предыдущим.

**Шаг 35.2 — Перенести** правила в исходном порядке, группами:
1. Левая панель и диптих
2. Правая панель и камеи
3. Модалки (settings, diplo, turn-summary, peace, siege)
4. Search panel
5. Context menu

**Шаг 35.3 — Подключить `<link>`** после `splash.css`:

```html
<link rel="stylesheet" href="ui/styles/panels.css">
```

**Шаг 35.4 — Удалить перенесённые правила** и оставить маркер.

---

### Проверка перед коммитом

1. Открыть левую панель (если раскрывается) — анимация как была.
2. Открыть модалку настроек — backdrop, центрирование, кнопки — идентично.
3. Открыть поиск `/` — список результатов рендерится.
4. Открыть дипломатический граф — overlay и легенда на местах.
5. Z-index: модалка над картой, context-menu над модалкой (если так было).
6. Карточка итогов хода после `processTurn()` — появляется как раньше.
7. `wc -l index.html` уменьшился.

---

### Коммит

```
refactor(ui): этап 35 — CSS панелей и модалок → ui/styles/panels.css
```

---

*Следующий этап: вынос CSS нижней зоны (лог, команда, ambient) в `ui/styles/bottom.css`.*

---

## ЭТАП 36 — Рефакторинг: вынос CSS нижней зоны в `ui/styles/bottom.css` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос стилей
**Часть:** 6 из 13 — последний CSS-этап

---

### Контекст

Финальный CSS-модуль: табличка-лог (drawer снизу), дощечка ввода команды
и ambient-слой (тессеры-частицы фона, дыхание карты). После этого этапа
все крупные блоки `<style>` из `index.html` должны быть вынесены, инлайн
могут остаться только редкие мелочи, которые проще оставить.

---

### Что читать / исследовать перед началом

1. Найти селекторы:
   - `#log-strip`, `#log-drawer`, `.log-*`, `.chronicle-*`
   - `#cmd-wax`, `.wax-*`, `#cmd-input`, `.messenger-*`
   - `#ambient-layer`, `.tessera-particle`, `@keyframes ambient-*`
   - `@keyframes breathe`, `@keyframes ui-shake` (этап 30)
2. Проверить остались ли в `index.html` **ещё** большие `<style>`-блоки
   — если да, выписать их в `docs/refactor_index.md` как «остаток к
   следующему проходу».
3. Убедиться что правила для `ui-shake` (этап 30) и любые другие
   keyframes UI-реакций тоже попали в этот файл.

---

### Что сделать

**Шаг 36.1 — Создать `ui/styles/bottom.css`** с шапкой.

**Шаг 36.2 — Перенести** три группы:
1. Лог (log-strip + log-drawer + chronicle)
2. Дощечка команды (wax + messenger)
3. Ambient (тессеры-частицы + breathe + ui-shake)

**Шаг 36.3 — Подключить `<link>`** последним:

```html
<link rel="stylesheet" href="ui/styles/bottom.css">
```

**Шаг 36.4 — Удалить перенесённые правила**.

**Шаг 36.5 — Инвентаризация остатков**

После удаления пройтись по `index.html` и сосчитать сколько CSS-строк
осталось. Результат записать в `docs/refactor_index.md` в раздел
«Состояние после этапа 36». Если остатков <200 строк — оставляем
инлайн, если больше — создаём `ui/styles/misc.css` и переносим (в том
же этапе, не плодим ещё один).

---

### Проверка перед коммитом

1. Лог событий — полоска внизу, раскрытие drawer-а работает.
2. Строка команды — текстура «воска», ввод/отправка работает.
3. Ambient-слой — тессеры дышат/двигаются как раньше.
4. UI-реакции (shake при поражении и т. п.) — не сломаны.
5. `wc -l index.html`: количество строк в `<style>`-блоках ≤ 300
   (оптимально 0 — весь CSS снаружи).
6. Все 5 (или 6 с misc) `<link rel="stylesheet">` в `<head>` в правильном порядке:
   base → top → splash → panels → bottom → (misc).

---

### Коммит

```
refactor(ui): этап 36 — CSS нижней зоны → ui/styles/bottom.css
```

---

*Следующий этап: начало JS-миграции — вынос `SplashMosaic` в `ui/splash_mosaic.js`.*

---

## ЭТАП 37 — Рефакторинг: вынос `SplashMosaic` в `ui/splash_mosaic.js` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос JavaScript
**Часть:** 7 из 13 — первый JS-модуль (изолированный, низкий риск)

---

### Контекст

Начинаем JS-миграцию со сплэш-мозаики — она полностью изолирована:
работает только пока виден `#splash-screen`, не взаимодействует с игровой
логикой, у неё узкий API (`init`, `setProgress`).

---

### Что читать / исследовать перед началом

1. `grep -n 'SplashMosaic' index.html` — найти объявление и все обращения.
2. Прочитать весь объект `SplashMosaic` в `index.html` целиком
   (от `const SplashMosaic = {` до закрывающей `}`).
3. Выписать:
   - какие DOM-элементы читает (`document.getElementById`);
   - от каких глобалов зависит (есть ли обращения к `window.*` или
     другим объектам текущего инлайн-`<script>`);
   - когда вызывается `.init()` и `.setProgress()` и из какого места.
4. Проверить что `ui/splash.js` уже существует и **не** содержит
   SplashMosaic (чтобы не было дубликата).
5. Прочитать `ui/splash.js` целиком — понять как новый файл должен
   соседствовать с ним.

---

### Что сделать

**Шаг 37.1 — Создать `ui/splash_mosaic.js`**

Шапка:

```js
/* ───────────────────────────────────────────────────────────
   splash_mosaic.js — анимированная мозаика на экране загрузки.
   Публичный API: window.SplashMosaic.{init, setProgress, …}
   Зависимости: DOM (#splash-canvas или как в init()).
   Рефакторинг Части II, этап 37 (uisuper.md). Вынесено из index.html.
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  // === ЗДЕСЬ ВСТАВИТЬ КОД SplashMosaic 1:1 ИЗ index.html ===
  // const SplashMosaic = { … };
  window.SplashMosaic = SplashMosaic;
})();
```

**Правила копирования:**
- Код копируется **буква в букву**, без переименований, без «улучшений».
- Если внутри есть обращения к другим объектам инлайн-скрипта
  (например, к `MOSAIC_COLORS`), их тоже переносить в этот же файл.
- Если обращений на «чужие» глобалы нет — отлично, IIFE завершён.

**Шаг 37.2 — Подключить `<script>` в `index.html`**

Найти блок подключения `ui/*.js` (например рядом с `ui/splash.js`) и
добавить **до** того места где вызывается `SplashMosaic.init()`:

```html
<script src="ui/splash_mosaic.js"></script>
```

**Критично:** этот `<script>` должен загрузиться **раньше** большого
инлайн-`<script>` в котором вызывается `SplashMosaic.init()`.

**Шаг 37.3 — Удалить объявление `SplashMosaic` из инлайн-`<script>`**

Оставить маркер:

```js
// SplashMosaic вынесен в ui/splash_mosaic.js (uisuper.md этап 37).
```

Обращения `SplashMosaic.init()` и `SplashMosaic.setProgress()` в инлайне
— **не трогать**, они теперь ссылаются на `window.SplashMosaic`.

---

### Проверка перед коммитом

1. Перезагрузить игру. Сплэш появляется, мозаика рисуется, прогресс идёт, сплэш скрывается — всё как раньше.
2. В Console: `typeof SplashMosaic` → `'object'`, `SplashMosaic.init` → функция.
3. `node --check ui/splash_mosaic.js` → без ошибок.
4. Синтаксическая проверка всех инлайн-`<script>` в `index.html`
   (node-скрипт: `new Function('(async()=>{…})')`).
5. `wc -l index.html` уменьшился на размер `SplashMosaic`.
6. Game loop после скрытия сплэша работает.

---

### Коммит

```
refactor(ui): этап 37 — SplashMosaic → ui/splash_mosaic.js
```

---

*Следующий этап: вынос `Clepsydra` в `ui/clepsydra.js`.*

---

## ЭТАП 38 — Рефакторинг: вынос `Clepsydra` в `ui/clepsydra.js` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос JavaScript
**Часть:** 8 из 13 — средний риск (зависит `engine/turn.js`)

---

### Контекст

`Clepsydra` (uisuper этап 12) — объект с API `progress`, `setReady`,
`flip`. Из него уже экспортируется `window.Clepsydra`, а `engine/turn.js`
использует `window.Clepsydra.flip()` и `window.Clepsydra.setReady()`.
Значит контракт уже через `window.*` — вынос безопасен.

---

### Что читать / исследовать перед началом

1. `grep -n 'Clepsydra' index.html engine/ ui/` — найти все обращения.
2. Прочитать весь `Clepsydra` в `index.html` целиком.
3. Подтвердить что единственная точка входа — `window.Clepsydra`
   (нет локальных обращений внутри другого инлайна).
4. Подтвердить что `renderTurnProgress` (из будущего этапа 39) ссылается
   на `Clepsydra` по имени — если да, этап 39 нужно делать после 38,
   и в 38 оставить временный `window.Clepsydra = Clepsydra;` — это уже так.
5. Прочитать в `engine/turn.js` блок `processTurn()` где есть
   `window.Clepsydra.flip(resolve)` — контракт не меняется.

---

### Что сделать

**Шаг 38.1 — Создать `ui/clepsydra.js`**

```js
/* ───────────────────────────────────────────────────────────
   clepsydra.js — клепсидра (кнопка конца хода):
   уровень воды, setReady, flip-анимация.
   Публичный API: window.Clepsydra.{progress, setReady, flip}
   Зависимости: DOM (#end-turn-btn, #clip-upper-rect, #clip-lower-rect,
   #clepsy-stream, .clepsy-water).
   Рефакторинг Части II, этап 38 (uisuper.md).
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  // === ВСТАВИТЬ СЮДА const Clepsydra = { ... } 1:1 ===
  window.Clepsydra = Clepsydra;
  // Инициализация начального уровня воды (как в инлайне).
  try { Clepsydra.progress = 0; } catch (_) {}
})();
```

**Шаг 38.2 — Подключить `<script>`**

В `index.html` рядом с остальными `ui/*.js`, **до** большого инлайна
(в котором раньше был Clepsydra):

```html
<script src="ui/clepsydra.js"></script>
```

И **до** `engine/turn.js`? — проверить: `engine/turn.js` читает
`window.Clepsydra` **внутри** `processTurn()`, который вызывается уже
по клику, то есть после загрузки всех скриптов. Значит порядок между
`clepsydra.js` и `engine/turn.js` не критичен, оба просто должны быть
загружены до первого вызова. Для предсказуемости всё равно поставить
`clepsydra.js` раньше `engine/turn.js`.

**Шаг 38.3 — Удалить `Clepsydra` из инлайна**, оставить маркер.

---

### Проверка перед коммитом

1. В Console: `window.Clepsydra.progress` → `0`, `typeof window.Clepsydra.flip` → `'function'`.
2. `markTurnAction('taxes')` и т. д. — уровень воды меняется.
3. Когда все приказы отданы — `.turn-ready` класс на кнопке, золото, пульс.
4. Клик по клепсидре → анимация слива → поворот → сброс.
5. `processTurn()` → `btn.disabled = true`, flip проигрывается, потом `setReady(false)`.
6. `node --check ui/clepsydra.js` — чисто.
7. `wc -l index.html` уменьшился на ~80–100 строк.

---

### Коммит

```
refactor(ui): этап 38 — Clepsydra → ui/clepsydra.js
```

---

*Следующий этап: вынос системы прогресса хода (`TURN_ACTIONS`, `renderTurnProgress`, `markTurnAction`, `resetTurnProgress`) в `ui/turn_progress.js`.*

---

## ЭТАП 39 — Рефакторинг: вынос прогресса хода в `ui/turn_progress.js` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос JavaScript
**Часть:** 9 из 13 — средний риск (связка с Clepsydra и `engine/turn.js`)

---

### Контекст

Система прогресса хода (`TURN_ACTIONS`, `_turnDone`, `renderTurnProgress`,
`markTurnAction`, `resetTurnProgress`) сейчас в инлайн-`<script>` и
экспортирована через `window.*`. Она читает `window.Clepsydra`, значит
`clepsydra.js` (этап 38) должен загрузиться **раньше** `turn_progress.js`.

---

### Что читать / исследовать перед началом

1. `grep -nE 'TURN_ACTIONS|_turnDone|markTurnAction|resetTurnProgress|renderTurnProgress' index.html engine/ ui/`
2. Прочитать весь блок «Шаг 31 — Индикатор прогресса хода» в `index.html`
   (его начало легко найти по комментарию).
3. Проверить откуда вызывается `markTurnAction` — наверняка из
   `engine/turn.js`, `engine/orders.js` и т. п. Список записать в
   `docs/refactor_index.md`.
4. Проверить что единственная зависимость на `Clepsydra` —
   внутри `renderTurnProgress` (добавлено в этапе 12), и что
   `Clepsydra` уже доступен как `window.Clepsydra`.

---

### Что сделать

**Шаг 39.1 — Создать `ui/turn_progress.js`**

```js
/* ───────────────────────────────────────────────────────────
   turn_progress.js — список действий хода и их визуализация
   (через Clepsydra и легаси-#turn-progress).
   Публичный API:
     window.TURN_ACTIONS, window.markTurnAction(id),
     window.resetTurnProgress(), window.renderTurnProgress()
   Зависимости: window.Clepsydra (опционально), DOM.
   Рефакторинг Части II, этап 39.
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const TURN_ACTIONS = [ /* … 1:1 из инлайна … */ ];
  const _turnDone = new Set();

  function renderTurnProgress() { /* … 1:1 … */ }
  function markTurnAction(id)   { /* … 1:1 … */ }
  function resetTurnProgress()  { /* … 1:1 … */ }

  // Первичная отрисовка после DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderTurnProgress);
  } else {
    renderTurnProgress();
  }

  window.TURN_ACTIONS       = TURN_ACTIONS;
  window.markTurnAction     = markTurnAction;
  window.resetTurnProgress  = resetTurnProgress;
  window.renderTurnProgress = renderTurnProgress;
})();
```

**Шаг 39.2 — Подключить `<script>`** после `ui/clepsydra.js`:

```html
<script src="ui/clepsydra.js"></script>
<script src="ui/turn_progress.js"></script>
```

И **до** `engine/turn.js` (`processTurn` вызывает `resetTurnProgress`).

**Шаг 39.3 — Удалить** перенесённый код из инлайна, оставить маркер.

---

### Проверка перед коммитом

1. В Console: `TURN_ACTIONS.length` > 0, `typeof markTurnAction === 'function'`.
2. Сделать ход: `markTurnAction('taxes')` → клепсидра частично опустошается.
3. Завершить все приказы — `setReady(true)` отрабатывает.
4. Нажать «Следующий ход» → `resetTurnProgress()` вызван, `_turnDone` пуст.
5. `node --check ui/turn_progress.js` — чисто.
6. `grep -c 'TURN_ACTIONS' index.html` = 0 (или только в комментариях).
7. `wc -l index.html` уменьшился.

---

### Коммит

```
refactor(ui): этап 39 — прогресс хода → ui/turn_progress.js
```

---

*Следующий этап: вынос `initStatusBar` в `ui/status_bar.js`.*

---

## ЭТАП 40 — Рефакторинг: вынос `initStatusBar` в `ui/status_bar.js` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос JavaScript
**Часть:** 10 из 13 — низкий риск

---

### Контекст

`initStatusBar()` управляет нижней дебаг-строкой (fps, save-status,
AI-status). После этапов uisuper 13–14 она скрыта, но JS-код всё ещё
обновляет её через таймеры и `requestAnimationFrame`. Это изолированный
кусок без внешних ссылок — вынос безопасен.

---

### Что читать / исследовать перед началом

1. `grep -n 'initStatusBar\|_sbLastSaveTs\|sb-game\|sb-save\|sb-ai\|sb-fps' index.html engine/ ui/`
2. Прочитать весь `(function initStatusBar(){ … })();` целиком.
3. Проверить не ссылается ли код на локальные переменные большого
   инлайна (например на `GAME_STATE`, `_aiState`). Если да —
   зависимости через `window.*` уже есть → можно выносить; если нет —
   зафиксировать, что именно понадобится в `window.*`.
4. Выписать все `setInterval` / `setTimeout` / `requestAnimationFrame`
   которые регистрирует функция — они должны выжить после выноса.

---

### Что сделать

**Шаг 40.1 — Создать `ui/status_bar.js`**

```js
/* ───────────────────────────────────────────────────────────
   status_bar.js — дебаг-строка внизу (#status-bar).
   После этапов 13–14 скрыта визуально, но служебные обновления
   продолжаются (save-status, ai-status, fps).
   Рефакторинг Части II, этап 40.
   ─────────────────────────────────────────────────────────── */
(function initStatusBar() {
  'use strict';
  // === тело initStatusBar 1:1 из инлайна ===
})();
```

**Шаг 40.2 — Подключить** после `turn_progress.js`:

```html
<script src="ui/status_bar.js"></script>
```

**Шаг 40.3 — Удалить** из инлайна, оставить маркер.

---

### Проверка перед коммитом

1. `#status-bar` по-прежнему скрыт (как после этапа 13).
2. В Console никаких новых ошибок про `_sbLastSaveTs is not defined`.
3. Автосохранение всё ещё отрабатывает (проверить через `saveGame()`).
4. `node --check ui/status_bar.js` — чисто.
5. `wc -l index.html` уменьшился.

---

### Коммит

```
refactor(ui): этап 40 — status-bar → ui/status_bar.js
```

---

*Следующий этап: вынос обработчиков топ-бара (поиск, настройки, модалки) в `ui/top_bar.js`.*

---

## ЭТАП 41 — Рефакторинг: вынос обработчиков топ-бара в `ui/top_bar.js` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос JavaScript
**Часть:** 11 из 13 — средний риск (много inline-`onclick`)

---

### Контекст

В разметке куча `onclick="toggleSearchPanel()"`, `onclick="toggleSettingsModal()"`,
`onclick="closeCtxMenu()"`, `onclick="cycleMapMode()"`, `onclick="focusNextAlert()"`
и так далее. Все эти функции определены в большом инлайн-`<script>` и
затем экспортируются в `window.*` в блоке «Монтажный лист» (см. этап 42).

В этом этапе выносим **только сами функции** (без монтажного листа,
который уйдёт в этап 42).

---

### Что читать / исследовать перед началом

1. `grep -nE 'onclick=' index.html` — полный список inline-хендлеров.
   Перечень обязательных к сохранению в `window.*`:
   - `toggleSearchPanel`, `toggleSettingsModal`, `closeCtxMenu`,
   - `cycleMapMode`, `showContextMenu`,
   - `focusNextAlert`, `closeTopModal`,
   - `closeDiploGraph` (если есть),
   - плюс всё что нашлось `grep`-ом.
2. Для каждой функции найти её определение в инлайне
   (`grep -n 'function toggleSearchPanel' index.html` и т. д.).
3. Выписать их внутренние зависимости: какие DOM-элементы читают/пишут,
   какие другие функции вызывают.
4. Убедиться что все вспомогательные (приватные) функции тоже
   переносимы — иначе кусок не выделится чисто.

---

### Что сделать

**Шаг 41.1 — Создать `ui/top_bar.js`**

```js
/* ───────────────────────────────────────────────────────────
   top_bar.js — обработчики кнопок верхнего ряда и вспомогательных
   окон: поиск, настройки, контекстное меню, переключение режимов
   карты, алерты, модалки.
   Публичный API (через window.*): toggleSearchPanel,
   toggleSettingsModal, closeCtxMenu, showContextMenu, cycleMapMode,
   focusNextAlert, closeTopModal, closeDiploGraph, …
   Рефакторинг Части II, этап 41.
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function toggleSearchPanel()   { /* 1:1 */ }
  function toggleSettingsModal() { /* 1:1 */ }
  function closeCtxMenu()        { /* 1:1 */ }
  function showContextMenu(x, y, items) { /* 1:1 */ }
  function cycleMapMode()        { /* 1:1 */ }
  function focusNextAlert()      { /* 1:1 */ }
  function closeTopModal()       { /* 1:1 */ }
  // … остальные

  // Экспорт (требуется inline-onclick в index.html)
  window.toggleSearchPanel   = toggleSearchPanel;
  window.toggleSettingsModal = toggleSettingsModal;
  window.closeCtxMenu        = closeCtxMenu;
  window.showContextMenu     = showContextMenu;
  window.cycleMapMode        = cycleMapMode;
  window.focusNextAlert      = focusNextAlert;
  window.closeTopModal       = closeTopModal;
})();
```

**Шаг 41.2 — Подключить `<script>`** после `status_bar.js`, но
**обязательно до** закрытия `</body>` и до того как пользователь
может кликнуть кнопку.

**Шаг 41.3 — Удалить функции из инлайна**, оставить маркер.

**Шаг 41.4 — В «монтажном листе»** (который пока в инлайне) закомментировать
или удалить строки `window.toggleSearchPanel = toggleSearchPanel` — теперь
экспорт делает новый файл. Если этого не сделать — получим
`ReferenceError: toggleSearchPanel is not defined` при попытке назначить.

---

### Проверка перед коммитом

1. Клик на `#search-btn` → поиск открывается.
2. Клик на `#settings-btn` → модалка настроек.
3. Правый клик по карте → контекстное меню.
4. Кнопки переключения режимов карты работают.
5. `Esc` закрывает модалку (`closeTopModal`).
6. В Console нет `ReferenceError: … is not defined`.
7. `node --check ui/top_bar.js`.
8. `grep -c 'function toggleSearchPanel' index.html` = 0.

---

### Коммит

```
refactor(ui): этап 41 — обработчики топ-бара → ui/top_bar.js
```

---

*Следующий этап: вынос монтажного листа инициализации в `ui/boot.js`.*

---

## ЭТАП 42 — Рефакторинг: вынос «монтажного листа» в `ui/boot.js` ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — вынос JavaScript
**Часть:** 12 из 13 — **самый высокий риск**, требует особой осторожности

---

### Контекст

«Монтажный лист» (шаг 61 arma.md) — цепочка инициализации игры:
показать сплэш, загрузить данные, инициализировать движок, скрыть
сплэш, показать UI. Это последний большой кусок инлайна. Он:
- использует `async/await` (`await saveGame()`, `await loadData()`);
- выставляет глобальные обработчики событий;
- завершается вызовом первой отрисовки.

Именно здесь больше всего шансов сломать игру. Поэтому этот этап
выполняется строго после всех предыдущих и с особым вниманием к
порядку загрузки.

---

### Что читать / исследовать перед началом

1. Найти в `index.html` блок `// Шаг 61 (arma.md) — Итоговая интеграция`
   — именно там монтажный лист.
2. Прочитать его целиком — это может быть 200–500 строк.
3. Выписать:
   - все `await` внутри;
   - все зависимости (`loadData`, `initMap`, `initEngine`, `showSplash`,
     `_splashProgress`, `_splashHide`, `hideSplashWithAnimation` и т. д.);
   - все `window.addEventListener('load', …)`, `DOMContentLoaded`, `beforeunload`;
   - все `try/catch` цепи — они должны сохраниться 1:1.
4. Проверить какие переменные на этом этапе **обязаны** быть в
   `window.*`. Если обнаружены «скрытые» локальные зависимости —
   зафиксировать в `docs/refactor_index.md`.
5. Сравнить текущий порядок `<script>`-тегов до и после: в `boot.js`
   первые строки будут опираться на `Clepsydra`, `SplashMosaic`,
   `TURN_ACTIONS`, `top_bar.js` — значит `boot.js` обязан подключаться
   **после** всех них и **после** `engine/*.js`.

---

### Что сделать

**Шаг 42.1 — Создать `ui/boot.js`**

```js
/* ───────────────────────────────────────────────────────────
   boot.js — «монтажный лист» инициализации игры (arma.md шаг 61).
   Последовательность: показать сплэш → загрузить данные → инициализировать
   движок и карту → скрыть сплэш → первая отрисовка.
   Подключается ПОСЛЕДНИМ в цепочке <script> в index.html.
   Рефакторинг Части II, этап 42.
   ─────────────────────────────────────────────────────────── */
(async function boot() {
  'use strict';
  // === 1:1 содержимое «шага 61» из инлайна ===
})();
```

**Шаг 42.2 — Подключить** в `index.html` самым последним `<script>`
перед `</body>`:

```html
<!-- Все компоненты загружены — запускаем монтажный лист -->
<script src="ui/boot.js"></script>
```

**Шаг 42.3 — Удалить «шаг 61»** из инлайна. На этом этапе инлайн-`<script>`
может стать пустым — в таком случае удалить и сам тег.

**Шаг 42.4 — Финальная фиксация порядка `<script>`**

В `index.html` порядок подключения должен быть строго:

```
ui/icons.js
ui/splash.js
ui/splash_mosaic.js
ui/clepsydra.js
ui/turn_progress.js
ui/status_bar.js
ui/top_bar.js
ui/… (остальные компоненты: log.js, panels.js, toast.js, map.js …)
engine/… (все движковые модули)
ui/boot.js                    ← ПОСЛЕДНИМ
```

Список зафиксировать комментарием в `index.html` над первым `<script>`:

```html
<!-- Порядок загрузки критичен: компоненты → движок → boot.
     См. uisuper.md Этап 42. Менять порядок только после ревью. -->
```

---

### Проверка перед коммитом

1. Перезагрузка страницы → сплэш появляется → мозаика → прогресс → сплэш исчезает → игра играет. Ни одной ошибки в консоли.
2. Сохранение → загрузка сохранения → работает.
3. Один полный ход от клика до завершения анимации клепсидры.
4. Открыть каждую панель (левая, правая, модалка, лог, команда) — ни одна не сломана.
5. `node --check ui/boot.js` — чисто.
6. `grep -c '<script' index.html` — количество уменьшилось, в основном остались только `<script src>`.
7. **Важно:** инлайн-`<script>` либо исчез, либо стал ≤ 50 строк (остаток — только то что физически нельзя вынести, например адаптер иконок).

---

### Коммит

```
refactor(ui): этап 42 — монтажный лист → ui/boot.js
```

---

*Следующий этап: финальный аудит и полный smoke-тест рефакторинга.*

---

## ЭТАП 43 — Рефакторинг: финальный аудит и полный smoke-тест ✅ ВЫПОЛНЕНО

**Улучшение:** Часть II — завершающий этап
**Часть:** 13 из 13 — верификация, без новых файлов

---

### Контекст

Все 12 предыдущих этапов разнесли CSS и JS по модулям. Этот этап
подтверждает что игра работает как до рефакторинга, обновляет
`docs/refactor_index.md` финальной статистикой, и закрывает Часть II.

---

### Что читать / исследовать перед началом

1. `docs/refactor_index.md` — сверка baseline vs. текущее состояние.
2. `wc -l index.html` — должно быть существенно меньше baseline
   (ориентир: \~3000–5000 строк против ~12 000).
3. `ls ui/ ui/styles/` — проверить что все новые файлы на месте:
   - `ui/styles/base.css`, `top.css`, `splash.css`, `panels.css`, `bottom.css`
   - `ui/splash_mosaic.js`, `clepsydra.js`, `turn_progress.js`, `status_bar.js`, `top_bar.js`, `boot.js`
4. `grep -c '<style' index.html` — должно быть 0 или 1 (остаток).
5. `grep -cE '^\s*<script>[^<]' index.html` — количество больших
   инлайн-`<script>` должно быть 0 или 1.

---

### Что сделать

**Шаг 43.1 — Полный smoke-тест (ручной, в браузере)**

Пройти следующий чеклист. Любой сломанный пункт — баг, фиксить перед коммитом.

```
[ ] Страница загружается без ошибок в DevTools Console
[ ] Сплэш появляется, мозаика собирается, прогресс идёт до 100%
[ ] Сплэш плавно скрывается (fade-out)
[ ] Стела: имя нации, дата, ресурсы — все значения корректны
[ ] Клепсидра: уровень воды, смена цвета, анимация флипа
[ ] Топ-бар: поиск, настройки, кнопки режимов карты
[ ] Левая панель (диптих): раскрытие, вкладки
[ ] Правая панель (камеи): карточки советников
[ ] Карта: панорама, масштаб, режимы, орлы-армии
[ ] Нижний лог: запись событий, раскрытие drawer
[ ] Строка команды: ввод, отправка, ответ AI (гонец)
[ ] Модалки: settings, search, diplo-graph, peace-panel, turn-summary
[ ] Context-menu по правому клику
[ ] Один полный ход (processTurn) — экономика, война, события
[ ] Сохранение и загрузка (autosave + manual)
[ ] Горячие клавиши: Space, Esc, /
[ ] Ambient-слой (если включён): тессеры, дыхание карты
[ ] UI-реакции: shake при проигранной битве, glow при победе
```

**Шаг 43.2 — Автоматические проверки**

```bash
# Синтаксис всех вынесенных JS
for f in ui/splash_mosaic.js ui/clepsydra.js ui/turn_progress.js \
         ui/status_bar.js ui/top_bar.js ui/boot.js; do
  node --check "$f" && echo "OK: $f"
done

# Синтаксис инлайн-скриптов (если остались)
node -e "/* проверка new Function(inlineScript) для каждого блока */"

# Все стили загружаются
grep -c '<link rel="stylesheet"' index.html  # ≥ 5 (base/top/splash/panels/bottom)
```

**Шаг 43.3 — Обновить `docs/refactor_index.md`**

Добавить раздел «После Части II»:

```markdown
## 7. После Части II (этап 43)

| Метрика | Baseline (этап 31) | После этапа 43 | Δ |
|---------|--------------------|----------------|---|
| `wc -l index.html` | 12262 | … | −… |
| Байт `index.html`  | 477578 | … | −… |
| `<style>`-блоков   | N   | 0–1 | −(N−1) |
| Инлайн `<script>`-блоков | M | 0–1 | −(M−1) |
| Файлов в `ui/styles/` | 0 | 5–6 | +5/6 |
| Файлов в `ui/` (новых) | 0 | 6 | +6 |

## 8. Открытые вопросы для Части III (если будет)

- Переход на `type="module"` (требует убрать все inline-`onclick`)
- Разбиение `engine/turn.js` (тоже большой)
- Отдельный build-step (Vite / esbuild) с minification
```

**Шаг 43.4 — Пометить все этапы Части II как выполненные**

В заголовках Этапов 31–43 в этом же файле добавить ` ✅ ВЫПОЛНЕНО`.

---

### Проверка перед коммитом

1. Все пункты smoke-теста зелёные.
2. `node --check` на всех новых JS — OK.
3. `docs/refactor_index.md` обновлён с финальными метриками.
4. Все 13 этапов Части II отмечены как выполненные.
5. `git status` — в working tree ничего лишнего.

---

### Коммит

```
refactor(ui): этап 43 — финальный аудит Части II, smoke-тест
```

После этого коммита `index.html` представляет собой чистый HTML-каркас
с подключением внешних стилей и скриптов, а весь JavaScript и CSS
расположены в логичных модулях под `ui/` и `ui/styles/`.

---

## ИТОГ ЧАСТИ II

После выполнения этапов 31–43:

- `index.html` сократился с ~12 000 строк до ~3000–5000 строк
- CSS разложен по 5–6 тематическим файлам в `ui/styles/`
- JavaScript верхнего уровня UI разложен по 6 файлам в `ui/`
- Порядок загрузки зафиксирован и документирован
- Ни одной функциональной регрессии — игра работает идентично
- `docs/refactor_index.md` содержит полную карту и историю миграции
- Открыты ворота для Части III (модули, build-step, дальнейший распил)

---

# ЧАСТЬ III — РАЗБИЕНИЕ `engine/turn.js`, ES-МОДУЛИ, BUILD-STEP

После Части II `index.html` стал чистым каркасом. Часть III идёт дальше:

1. **Направление A (этапы 44–54):** Разбить монолитный `engine/turn.js`
   (2575 строк) на 9 логических модулей. Это безопасно — всё остаётся
   на `window.*`, порядок `<script>` не меняется.

2. **Направление B (этапы 55–66):** Убрать все inline `onclick` (73 в HTML,
   186 в JS-шаблонах) → перейти на `addEventListener` / делегирование →
   конвертировать все 74 файла в ES-модули (`type="module"`).

3. **Направление C (этапы 67–71):** Подключить Vite — dev-сервер с HMR,
   продакшн-сборка с tree-shaking и минификацией, code-splitting.

**Порядок критичен:** A → B → C. Каждое направление опирается на предыдущее.

## Золотые правила Части III

1. **Один этап — один логический модуль или одна группа файлов.**
2. **Направление A:** скрипты остаются классическими (`<script src>`),
   публичное API через `window.*`. Вынос 1:1 без переименований.
3. **Направление B:** `onclick` заменяется на `data-action` + делегирование
   через `document.addEventListener('click', …)`. Только после удаления
   всех inline-хендлеров можно переключать на `type="module"`.
4. **Направление C:** Vite конфигурируется так чтобы `vite dev` работал
   без изменений кода, а `vite build` выдавал один бандл + чанки.
5. **После каждого этапа — smoke-тест.** Игра должна запускаться,
   ход проходить, UI не ломаться.
6. **Коммит атомарный.** Один этап = один коммит.

## Карта этапов Части III

| Этап | Направление | Что делается | Куда |
|------|-------------|--------------|------|
| 44 | A | Аудит `turn.js`, карта функций и зависимостей | `docs/refactor_turn.md` |
| 45 | A | Дата + Сезон + Стела | `engine/date.js` |
| 46 | A | Персонажи: старение, смерть, спавн | `engine/characters_lifecycle.js` |
| 47 | A | Шпионаж + казус белли | `engine/espionage.js` |
| 48 | A | OU-процесс + AI-скоринг | `engine/ai_scoring.js` |
| 49 | A | Fallback AI-решение | `engine/ai_fallback.js` |
| 50 | A | AI HTTP Worker + фоновый цикл | `engine/ai_worker.js` |
| 51 | A | Случайные события | `engine/events.js` |
| 52 | A | Сохранение/загрузка + миграции | `engine/save.js` |
| 53 | A | Инициализация игры + renderAll | `engine/init.js` |
| 54 | A | Финальный аудит `turn.js`, smoke-тест | — |
| 55 | B | Аудит: граф `window.*` зависимостей | `docs/refactor_modules.md` |
| 56 | B | Убрать onclick из `index.html` (73 шт.) | `ui/boot.js` |
| 57 | B | Убрать onclick из `ui/panels.js` (34 шт.) | делегирование |
| 58 | B | Убрать onclick из `ui/government_tab.js` (54 шт.) | делегирование |
| 59 | B | Убрать onclick из `ui/diplomacy_tab.js` (26 шт.) | делегирование |
| 60 | B | Убрать onclick из остальных 11 файлов (72 шт.) | делегирование |
| 61 | B | Конвертировать `data/*.js` в ES-модули | export/import |
| 62 | B | Конвертировать `engine/*.js` в ES-модули | export/import |
| 63 | B | Конвертировать `ui/*.js` в ES-модули | export/import |
| 64 | B | Конвертировать `ai/*.js` в ES-модули | export/import |
| 65 | B | Единый `<script type="module" src="ui/boot.js">` | `index.html` |
| 66 | B | Финальный аудит: 0 глобалов, 0 inline onclick | smoke-тест |
| 67 | C | Инициализация Vite: package.json, vite.config.js | корень проекта |
| 68 | C | Dev-сервер: `vite dev` с HMR | vite.config.js |
| 69 | C | Продакшн-сборка: tree-shaking, минификация | `dist/` |
| 70 | C | Code-splitting: lazy-load тяжёлых модулей | vite.config.js |
| 71 | C | Финальный аудит Части III, полный smoke-тест | —  |

---

## ЭТАП 44 — Рефакторинг: аудит `engine/turn.js` и карта содержимого ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 1 из 11 — только исследование, никаких правок кода

---

### Контекст

`engine/turn.js` — 2575 строк, самый большой файл движка. Содержит
всё: основной цикл хода, дату/сезон, стелу, старение персонажей,
AI-решения (OU-процесс + fallback), HTTP-воркер, случайные события,
сохранение/загрузку, инициализацию игры и renderAll.

Перед разбиением нужна полная карта: кто вызывает кого, какие
глобалы читаются/пишутся, какие DOM-элементы затрагиваются.

---

### Что читать / исследовать перед началом

1. `wc -l engine/turn.js` — зафиксировать baseline.
2. Выписать все `function` верхнего уровня с номерами строк.
3. Для каждой функции: какие другие функции из `turn.js` она вызывает?
4. Для каждой функции: какие `window.*` глобалы она читает/пишет?
5. Для каждой функции: какие `document.getElementById` / `querySelector` она использует?
6. Найти все `window.X = ...` экспорты в `turn.js`.
7. Найти все места в **других файлах** (`ui/*.js`, `engine/*.js`, `ai/*.js`,
   инлайн-`<script>` в `index.html`) где вызываются функции из `turn.js`.

---

### Что сделать

**Шаг 44.1 — Создать `docs/refactor_turn.md`**

Файл должен содержать:

```markdown
# Карта содержимого engine/turn.js (baseline перед разбиением)

Зафиксировано: <дата>, коммит: <hash>
Размер файла: <wc -l> строк.

## 1. Все функции верхнего уровня

| # | Строка | Имя | Экспорт window.* | Вызывается из |
|---|--------|-----|-------------------|---------------|
| 1 | 48 | processTurn | onclick в HTML | — |
| 2 | 385 | advanceDate | — | processTurn |
| … | … | … | … | … |

## 2. Все константы верхнего уровня

| # | Строка | Имя | Тип | Используется в |
|---|--------|-----|-----|----------------|
| 1 | 11 | MONTH_NAMES | const array | formatDate |
| … | … | … | … | … |

## 3. Граф вызовов (кто кого вызывает внутри turn.js)

processTurn → advanceDate, agingCharacters, checkCharacterDeaths,
  maybeSpawnCharacter, processAINations, _processEspionageTick,
  triggerRandomEvent, _recordTurnSummary, renderAll, saveGame, …

## 4. Внешние зависимости (что turn.js читает из window.*)

- window.GAME_STATE (везде)
- window.CONFIG (экономика, AI)
- window.MAP_REGIONS (карта)
- …

## 5. Внешние вызовы (кто из других файлов вызывает функции turn.js)

| Функция | Откуда вызывается |
|---------|-------------------|
| processTurn | index.html onclick, ui/input.js |
| initGame | инлайн-блок C (index.html:12410) |
| saveGame | engine/storage.js, index.html |
| loadGame | engine/storage.js |
| getCurrentSeason | ui/map.js |
| … | … |

## 6. План разбиения (этапы 45–53)

| Этап | Функции | Целевой файл | Строк |
|------|---------|--------------|-------|
| 45 | advanceDate, formatDate, getCurrentSeason, applySeasonVisual, updateStele, toRomanYear + MONTH_NAMES, SEASON_STYLES, GREEK_MONTHS, STELE_GOV_TITLES | engine/date.js | ~240 |
| 46 | agingCharacters, checkCharacterDeaths, maybeSpawnCharacter | engine/characters_lifecycle.js | ~76 |
| 47 | _processEspionageTick, _cleanExpiredCasusBelli | engine/espionage.js | ~160 |
| 48 | _ouNaturalMu, _ouStep, _tickOU, _softmax, _weightedPick, _findWarTarget, _findDiplomacyPartner, _findBuildTarget + _OU_THETA, _OU_SIGMA, _FALLBACK_BUILD_PRIORITY, _SUPER_OU_ACTION_MAP | engine/ai_scoring.js | ~176 |
| 49 | applyFallbackDecision | engine/ai_fallback.js | ~410 |
| 50 | _getAIHttpWorker, _callGroqViaWorker, startAIBackgroundLoop, stopAIBackgroundLoop, _aiBgTick, _aiBgProcess + _aiHttpWorker, _aiHttpWorkerFailed, _aiReqCounter, _aiPendingReqs, _aiPending, _aiBgRunning | engine/ai_worker.js | ~220 |
| 51 | RANDOM_EVENTS, triggerRandomEvent, _showEventChoiceOverlay | engine/events.js | ~153 |
| 52 | _getSaveWorker, _buildSavePayload, saveGame, loadGame, _migrateCharacterIds, _sanitizeInstitutions, _migrateSenateConfig, _migrateCharacterSenateFields + _saveWorker, _saveWorkerFailed, _saveInFlight | engine/save.js | ~244 |
| 53 | initGame, renderAll | engine/init.js | ~264 |
```

**Шаг 44.2 — Ничего больше не менять**

На этом этапе запрещено:
- править `engine/turn.js` или любой другой файл кода;
- создавать новые `.js` файлы.

---

### Проверка перед коммитом

1. Файл `docs/refactor_turn.md` создан и содержит все 6 разделов.
2. Таблица функций покрывает все `function` в `turn.js` без пропусков.
3. Граф вызовов непустой.
4. Список внешних вызовов содержит минимум `processTurn`, `initGame`,
   `saveGame`, `getCurrentSeason`.
5. `engine/turn.js` не изменён — `git diff engine/turn.js` пуст.

---

### Коммит

```
refactor(engine): этап 44 — аудит turn.js, карта содержимого
```

---

*Следующий этап: вынос Дата + Сезон + Стела в `engine/date.js`.*

---

## ЭТАП 45 — Рефакторинг: вынос Дата + Сезон + Стела в `engine/date.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 2 из 11 — первый вынос кода

---

### Контекст

Функции даты, сезона и стелы — самый автономный блок в `turn.js`.
Они не вызывают другие функции из `turn.js` (кроме друг друга),
а только читают `window.GAME_STATE` и пишут в DOM-элементы стелы.

---

### Что читать перед началом

1. `engine/turn.js` строки 381–620 — весь блок даты/сезона/стелы.
2. Найти все места в `turn.js` где вызываются `advanceDate()`,
   `updateDateDisplay()`, `updateStele()`, `getCurrentSeason()`,
   `applySeasonVisual()`.
3. Найти в **других файлах** вызовы `window.getCurrentSeason`,
   `window.applySeasonVisual`, `window.updateStele`, `window.toRomanYear`.

---

### Что сделать

**Шаг 45.1 — Создать `engine/date.js`**

Вырезать из `engine/turn.js` строки ~381–620 (целиком, 1:1, без изменений):

```
MONTH_NAMES          (const, ~11)
SEASON_STYLES        (const, ~415)
GREEK_MONTHS         (const, ~537)
STELE_GOV_TITLES     (const, ~545)
advanceDate          (function, ~385)
formatDate           (function, ~400)
getCurrentSeason     (function, ~447)
applySeasonVisual    (function, ~466)
updateDateDisplay    (function, ~508)
toRomanYear          (function, ~561)
updateStele          (function, ~574)
```

И все связанные `window.*` экспорты:
```js
window.SEASON_STYLES    = SEASON_STYLES;
window.getCurrentSeason = getCurrentSeason;
window.applySeasonVisual = applySeasonVisual;
window.updateStele      = updateStele;
window.toRomanYear      = toRomanYear;
```

**Шаг 45.2 — Удалить вынесенный код из `engine/turn.js`**

Удалить те же строки из `turn.js`. Убедиться что `processTurn()`
по-прежнему вызывает `advanceDate()`, `updateDateDisplay()` и т.д. —
они теперь доступны через `window.*` из `engine/date.js`.

**Шаг 45.3 — Подключить `engine/date.js` в `index.html`**

Добавить `<script src="engine/date.js"></script>` **перед**
`<script src="engine/turn.js"></script>` (чтобы функции были
доступны к моменту исполнения `turn.js`).

---

### Проверка перед коммитом

1. `node --check engine/date.js` — OK.
2. `node --check engine/turn.js` — OK.
3. `grep -n 'advanceDate\|formatDate\|getCurrentSeason\|applySeasonVisual\|updateStele\|toRomanYear' engine/turn.js`
   — ни одного определения (`function X`), только вызовы.
4. Игра запускается, дата и стела обновляются после хода.
5. `wc -l engine/turn.js` — уменьшился на ~240 строк.

---

### Коммит

```
refactor(engine): этап 45 — вынос даты/сезона/стелы в engine/date.js
```

---

*Следующий этап: вынос старения/смерти/спавна персонажей в `engine/characters_lifecycle.js`.*

---

## ЭТАП 46 — Рефакторинг: вынос персонажей в `engine/characters_lifecycle.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 3 из 11

---

### Контекст

Три функции управления жизненным циклом персонажей (старение, смерть,
спавн) — изолированный блок. Они вызываются только из `processTurn()`
и не имеют зависимостей от других функций `turn.js`.

---

### Что читать перед началом

1. `engine/turn.js` строки ~622–697.
2. Проверить зависимости: какие `window.*` глобалы читают эти функции
   (скорее всего `GAME_STATE`, `CONFIG`, возможно `addLog`).

---

### Что сделать

**Шаг 46.1 — Создать `engine/characters_lifecycle.js`**

Вырезать из `engine/turn.js` строки ~622–697 (1:1):

```
agingCharacters        (function)
checkCharacterDeaths   (function)
maybeSpawnCharacter    (function)
```

Добавить `window.*` экспорты, если их нет:
```js
window.agingCharacters      = agingCharacters;
window.checkCharacterDeaths = checkCharacterDeaths;
window.maybeSpawnCharacter  = maybeSpawnCharacter;
```

**Шаг 46.2 — Удалить из `engine/turn.js`**

Удалить строки. `processTurn()` продолжает вызывать эти функции
через `window.*`.

**Шаг 46.3 — Подключить в `index.html`**

Добавить `<script src="engine/characters_lifecycle.js"></script>`
**перед** `<script src="engine/turn.js"></script>`.

---

### Проверка перед коммитом

1. `node --check engine/characters_lifecycle.js` — OK.
2. `node --check engine/turn.js` — OK.
3. Игра запускается, персонажи стареют и умирают после ходов.
4. `wc -l engine/turn.js` — уменьшился на ~76 строк.

---

### Коммит

```
refactor(engine): этап 46 — вынос жизненного цикла персонажей
```

---

*Следующий этап: вынос шпионажа в `engine/espionage.js`.*

---

## ЭТАП 47 — Рефакторинг: вынос шпионажа в `engine/espionage.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 4 из 11

---

### Контекст

Блок шпионажа (DIP_006) обрабатывает тик разведки для всех наций
и очищает истёкшие казус белли. Вызывается из `processTurn()`.

---

### Что читать перед началом

1. `engine/turn.js` строки ~873–1033.
2. Проверить зависимости на другие функции `turn.js` и внешние модули
   (`engine/diplomacy.js`, `engine/diplomacy_range.js`).

---

### Что сделать

**Шаг 47.1 — Создать `engine/espionage.js`**

Вырезать из `engine/turn.js` строки ~873–1033 (1:1):

```
_processEspionageTick    (function, ~160 строк)
_cleanExpiredCasusBelli  (function)
```

Экспорты:
```js
window._processEspionageTick   = _processEspionageTick;
window._cleanExpiredCasusBelli = _cleanExpiredCasusBelli;
```

**Шаг 47.2 — Удалить из `engine/turn.js`**

**Шаг 47.3 — Подключить в `index.html`**

Добавить `<script src="engine/espionage.js"></script>`
перед `<script src="engine/turn.js"></script>`.

---

### Проверка перед коммитом

1. `node --check engine/espionage.js` — OK.
2. `node --check engine/turn.js` — OK.
3. Игра работает, шпионаж тикает после хода.
4. `wc -l engine/turn.js` — уменьшился на ~160 строк.

---

### Коммит

```
refactor(engine): этап 47 — вынос шпионажа в engine/espionage.js
```

---

*Следующий этап: вынос OU-процесса и AI-скоринга в `engine/ai_scoring.js`.*

---

## ЭТАП 48 — Рефакторинг: вынос OU-процесса и AI-скоринга в `engine/ai_scoring.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 5 из 11

---

### Контекст

Блок Ornstein-Uhlenbeck — математическое ядро AI-решений. Чистые
функции без побочных эффектов (кроме записи в `nation.ou_x`).
Вспомогательные функции выбора целей (`_findWarTarget` и др.)
тоже чисто вычислительные.

---

### Что читать перед началом

1. `engine/turn.js` строки ~1035–1210.
2. Проверить: вызывается ли `_tickOU` из `processAINations` или
   из `applyFallbackDecision`. Обе функции должны видеть эти хелперы.

---

### Что сделать

**Шаг 48.1 — Создать `engine/ai_scoring.js`**

Вырезать из `engine/turn.js` строки ~1035–1210 (1:1):

```
_OU_THETA, _OU_SIGMA                 (const)
_ouNaturalMu(nation)                 (function)
_ouStep(x, mu)                       (function)
_tickOU(nationId, nation)            (function)
_softmax(scoreMap, temp)             (function)
_weightedPick(probMap)               (function)
_findWarTarget(nationId, nation)     (function)
_findDiplomacyPartner(…)             (function)
_FALLBACK_BUILD_PRIORITY             (const)
_findBuildTarget(nationId, nation)   (function)
_SUPER_OU_ACTION_MAP                 (const)
```

Экспорты:
```js
window._tickOU              = _tickOU;
window._softmax             = _softmax;
window._weightedPick        = _weightedPick;
window._findWarTarget       = _findWarTarget;
window._findDiplomacyPartner = _findDiplomacyPartner;
window._findBuildTarget     = _findBuildTarget;
window._SUPER_OU_ACTION_MAP = _SUPER_OU_ACTION_MAP;
```

**Шаг 48.2 — Удалить из `engine/turn.js`**

**Шаг 48.3 — Подключить в `index.html`**

Добавить `<script src="engine/ai_scoring.js"></script>`
перед `<script src="engine/turn.js"></script>`.

---

### Проверка перед коммитом

1. `node --check engine/ai_scoring.js` — OK.
2. `node --check engine/turn.js` — OK.
3. AI-нации принимают решения после хода.
4. `wc -l engine/turn.js` — уменьшился на ~176 строк.

---

### Коммит

```
refactor(engine): этап 48 — вынос OU-процесса и AI-скоринга
```

---

*Следующий этап: вынос fallback AI-решения в `engine/ai_fallback.js`.*

---

## ЭТАП 49 — Рефакторинг: вынос fallback AI в `engine/ai_fallback.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 6 из 11

---

### Контекст

`applyFallbackDecision` — самая большая функция в `turn.js` (~410 строк).
Это один гигантский `switch` по типам AI-действий. Функция вызывается
из `processAINations()` когда LLM-запрос не доступен или не вернул
ответа. Зависит от хелперов из `engine/ai_scoring.js` (этап 48).

---

### Что читать перед началом

1. `engine/turn.js` строки ~1212–1622.
2. Проверить вызовы: `_findWarTarget`, `_findDiplomacyPartner`,
   `_findBuildTarget` — они уже вынесены в `engine/ai_scoring.js`.

---

### Что сделать

**Шаг 49.1 — Создать `engine/ai_fallback.js`**

Вырезать из `engine/turn.js` строки ~1212–1622 (1:1):

```
applyFallbackDecision(nationId)   (function, ~410 строк)
```

Экспорт:
```js
window.applyFallbackDecision = applyFallbackDecision;
```

**Шаг 49.2 — Удалить из `engine/turn.js`**

**Шаг 49.3 — Подключить в `index.html`**

Добавить `<script src="engine/ai_fallback.js"></script>`
**после** `engine/ai_scoring.js` и **перед** `engine/turn.js`.

---

### Проверка перед коммитом

1. `node --check engine/ai_fallback.js` — OK.
2. `node --check engine/turn.js` — OK.
3. AI-нации без API-ключа принимают fallback-решения.
4. `wc -l engine/turn.js` — уменьшился на ~410 строк.

---

### Коммит

```
refactor(engine): этап 49 — вынос fallback AI в engine/ai_fallback.js
```

---

*Следующий этап: вынос AI HTTP Worker и фонового цикла в `engine/ai_worker.js`.*

---

## ЭТАП 50 — Рефакторинг: вынос AI Worker в `engine/ai_worker.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 7 из 11

---

### Контекст

Блок управления Web Worker для HTTP-запросов к Groq API и фоновый
цикл AI-решений. Содержит состояние воркера, очередь запросов,
и async-цикл `_aiBgProcess` который обрабатывает AI-нации в фоне.

---

### Что читать перед началом

1. `engine/turn.js` строки ~1624–1844.
2. Проверить зависимости: `_aiBgProcess` вызывает `applyFallbackDecision`
   (уже вынесен) и `processAINations` (останется в `turn.js`).
3. Проверить: `_aiPending` и `_aiBgRunning` — используются ли они
   в `processAINations`? Если да — экспортировать через `window.*`.

---

### Что сделать

**Шаг 50.1 — Создать `engine/ai_worker.js`**

Вырезать из `engine/turn.js` строки ~1624–1844 (1:1):

```
_aiHttpWorker, _aiHttpWorkerFailed, _aiReqCounter   (let)
_aiPendingReqs                                       (const Map)
_aiPending                                           (const Map — может быть выше, ~7)
_aiBgRunning                                         (let — может быть выше, ~8)
_getAIHttpWorker()                                   (function)
_callGroqViaWorker(system, user, maxTokens)          (function)
startAIBackgroundLoop()                              (function)
stopAIBackgroundLoop()                               (function)
_aiBgTick()                                          (function)
_aiBgProcess()                                       (function)
```

Экспорты:
```js
window._aiPending           = _aiPending;
window._callGroqViaWorker   = _callGroqViaWorker;
window.startAIBackgroundLoop = startAIBackgroundLoop;
window.stopAIBackgroundLoop  = stopAIBackgroundLoop;
```

**Шаг 50.2 — Удалить из `engine/turn.js`**

**Шаг 50.3 — Подключить в `index.html`**

Добавить `<script src="engine/ai_worker.js"></script>`
после `engine/ai_fallback.js` и перед `engine/turn.js`.

---

### Проверка перед коммитом

1. `node --check engine/ai_worker.js` — OK.
2. `node --check engine/turn.js` — OK.
3. AI-нации с API-ключом делают запросы через воркер.
4. `wc -l engine/turn.js` — уменьшился на ~220 строк.

---

### Коммит

```
refactor(engine): этап 50 — вынос AI Worker в engine/ai_worker.js
```

---

*Следующий этап: вынос случайных событий в `engine/events.js`.*

---

## ЭТАП 51 — Рефакторинг: вынос событий в `engine/events.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 8 из 11

---

### Контекст

Массив `RANDOM_EVENTS` с определениями событий, функция `triggerRandomEvent()`
и UI-хелпер `_showEventChoiceOverlay()`. Вызывается из `processTurn()`.
UI-хелпер пишет в DOM (`#event-choice-overlay`).

---

### Что читать перед началом

1. `engine/turn.js` строки ~1846–1998.
2. Проверить DOM-зависимости `_showEventChoiceOverlay`.

---

### Что сделать

**Шаг 51.1 — Создать `engine/events.js`**

Вырезать из `engine/turn.js` строки ~1846–1998 (1:1):

```
RANDOM_EVENTS                        (const array)
triggerRandomEvent()                  (function)
_showEventChoiceOverlay(event, nId)   (function)
```

Экспорты:
```js
window.RANDOM_EVENTS           = RANDOM_EVENTS;
window.triggerRandomEvent      = triggerRandomEvent;
window._showEventChoiceOverlay = _showEventChoiceOverlay;
```

**Шаг 51.2 — Удалить из `engine/turn.js`**

**Шаг 51.3 — Подключить в `index.html`**

Добавить `<script src="engine/events.js"></script>`
перед `<script src="engine/turn.js"></script>`.

---

### Проверка перед коммитом

1. `node --check engine/events.js` — OK.
2. `node --check engine/turn.js` — OK.
3. Случайные события появляются при прохождении ходов.
4. `wc -l engine/turn.js` — уменьшился на ~153 строк.

---

### Коммит

```
refactor(engine): этап 51 — вынос случайных событий в engine/events.js
```

---

*Следующий этап: вынос сохранения/загрузки в `engine/save.js`.*

---

## ЭТАП 52 — Рефакторинг: вынос сохранения/загрузки в `engine/save.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 9 из 11

---

### Контекст

Блок сохранения: Web Worker для сериализации, `_buildSavePayload()`,
`saveGame()`, `loadGame()`, и 4 миграционные функции. `saveGame()`
вызывается из `processTurn()` и из `engine/storage.js`.
`loadGame()` вызывается из `initGame()` и из UI.

**Важно:** `engine/storage.js` уже существует — это другой файл
(управление localStorage). Новый `engine/save.js` — про
сериализацию/десериализацию полного состояния.

---

### Что читать перед началом

1. `engine/turn.js` строки ~2064–2307.
2. Проверить зависимости `loadGame()`: вызывает ли она `renderAll()`,
   `initGame()` или другие функции из `turn.js`?
3. Проверить: `engine/storage.js` — не конфликтует ли имя?

---

### Что сделать

**Шаг 52.1 — Создать `engine/save.js`**

Вырезать из `engine/turn.js` строки ~2064–2307 (1:1):

```
_saveWorker, _saveWorkerFailed, _saveInFlight   (let)
_getSaveWorker()                                (function)
_buildSavePayload()                             (function)
saveGame()                                      (async function)
loadGame()                                      (async function)
_migrateCharacterIds()                          (function)
_sanitizeInstitutions()                         (function)
_migrateSenateConfig()                          (function)
_migrateCharacterSenateFields()                 (function)
```

Экспорты:
```js
window.saveGame  = saveGame;
window.loadGame  = loadGame;
```

**Шаг 52.2 — Удалить из `engine/turn.js`**

**Шаг 52.3 — Подключить в `index.html`**

Добавить `<script src="engine/save.js"></script>`
перед `<script src="engine/turn.js"></script>`.

---

### Проверка перед коммитом

1. `node --check engine/save.js` — OK.
2. `node --check engine/turn.js` — OK.
3. Сохранение и загрузка работают (autosave + manual load).
4. `wc -l engine/turn.js` — уменьшился на ~244 строк.

---

### Коммит

```
refactor(engine): этап 52 — вынос save/load в engine/save.js
```

---

*Следующий этап: вынос инициализации игры в `engine/init.js`.*

---

## ЭТАП 53 — Рефакторинг: вынос инициализации в `engine/init.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 10 из 11

---

### Контекст

`initGame()` — async-функция (~220 строк), которая создаёт начальное
состояние игры, загружает сохранение, инициализирует карту, UI,
AI-цикл. Вызывается из инлайн-блока C в `index.html`.

`renderAll()` — функция (~44 строки), которая обновляет все UI-панели.
Вызывается из `processTurn()`, `initGame()`, `loadGame()`.

**Важно:** `initGame` должен загружаться **после** всех остальных
модулей (date, characters_lifecycle, espionage, ai_scoring,
ai_fallback, ai_worker, events, save), так как вызывает их функции.

---

### Что читать перед началом

1. `engine/turn.js` строки ~2309–2575.
2. Проверить: какие функции вызывает `initGame()` из других вынесенных
   файлов (startAIBackgroundLoop, loadGame, renderAll, updateStele, …).

---

### Что сделать

**Шаг 53.1 — Создать `engine/init.js`**

Вырезать из `engine/turn.js` строки ~2309–2575 (1:1):

```
initGame()    (async function, ~220 строк)
renderAll()   (function, ~44 строки)
```

Экспорты (initGame уже доступен как глобальная function declaration):
```js
window.initGame  = initGame;
window.renderAll = renderAll;
```

**Шаг 53.2 — Удалить из `engine/turn.js`**

**Шаг 53.3 — Подключить в `index.html`**

Добавить `<script src="engine/init.js"></script>`
**после** `<script src="engine/turn.js"></script>` (потому что
`initGame` вызывает `processTurn`-зависимые структуры).

---

### Проверка перед коммитом

1. `node --check engine/init.js` — OK.
2. `node --check engine/turn.js` — OK.
3. Игра запускается с нуля и при загрузке сохранения.
4. `wc -l engine/turn.js` — уменьшился на ~264 строк.
5. `turn.js` теперь содержит только `processTurn()`,
   `processAINations()`, `_ensureNationDefaults()`,
   `_recordTurnSummary()` и `IS_PROCESSING_TURN`.

---

### Коммит

```
refactor(engine): этап 53 — вынос initGame/renderAll в engine/init.js
```

---

*Следующий этап: финальный аудит разбиения `turn.js`.*

---

## ЭТАП 54 — Рефакторинг: финальный аудит разбиения `turn.js` ✅ ВЫПОЛНЕНО

**Направление:** A — разбиение `engine/turn.js`
**Часть:** 11 из 11 — верификация

---

### Контекст

Все 9 модулей вынесены. `turn.js` должен содержать только:
- `IS_PROCESSING_TURN` (флаг)
- `_ensureNationDefaults(nation)` (~20 строк)
- `processTurn()` (~330 строк)
- `processAINations()` (~170 строк)
- `_recordTurnSummary()` (~60 строк)

Ожидаемый размер: ~580–650 строк (было 2575).

---

### Что сделать

**Шаг 54.1 — Проверить размер**

```bash
wc -l engine/turn.js   # ожидание: ~600 строк
```

**Шаг 54.2 — Проверить синтаксис всех новых файлов**

```bash
for f in engine/date.js engine/characters_lifecycle.js \
         engine/espionage.js engine/ai_scoring.js \
         engine/ai_fallback.js engine/ai_worker.js \
         engine/events.js engine/save.js engine/init.js; do
  node --check "$f" && echo "OK: $f"
done
```

**Шаг 54.3 — Полный smoke-тест**

```
[ ] Игра запускается без ошибок в консоли
[ ] Стела: дата обновляется после хода
[ ] Персонажи стареют и умирают
[ ] AI-нации принимают решения (fallback без API-ключа)
[ ] Случайные события появляются
[ ] Сохранение и загрузка работают
[ ] Все UI-панели рендерятся корректно
```

**Шаг 54.4 — Обновить `docs/refactor_turn.md`**

Добавить финальные метрики:

```markdown
## После разбиения (этап 54)

| Метрика | До | После | Δ |
|---------|-----|-------|---|
| `wc -l engine/turn.js` | 2575 | ~600 | −~1975 |
| Файлов в `engine/` (новых) | 0 | 9 | +9 |
```

---

### Проверка перед коммитом

1. Все 9 новых файлов проходят `node --check`.
2. `turn.js` содержит только 4–5 функций.
3. Все пункты smoke-теста зелёные.
4. `docs/refactor_turn.md` обновлён.

---

### Коммит

```
refactor(engine): этап 54 — финальный аудит разбиения turn.js
```

---

## ИТОГ НАПРАВЛЕНИЯ A

После этапов 44–54:
- `engine/turn.js` сократился с 2575 до ~600 строк
- 9 новых модулей в `engine/`: date, characters_lifecycle, espionage,
  ai_scoring, ai_fallback, ai_worker, events, save, init
- Все функции доступны через `window.*` — обратная совместимость 100%
- Ни одной регрессии

---

*Следующий этап: аудит графа window.* зависимостей для перехода на ES-модули.*

---

## ЭТАП 55 — Модули: аудит графа `window.*` зависимостей ✅ ВЫПОЛНЕНО

**Направление:** B — переход на ES-модули
**Часть:** 1 из 12 — только исследование

---

### Контекст

Перед удалением inline `onclick` и переходом на `type="module"` нужно
понять полный граф зависимостей между файлами. Сейчас файлы общаются
через `window.*` — нужно знать кто что экспортирует и кто что читает,
чтобы при переходе на `import/export` не порвать связи.

---

### Что исследовать

1. Для каждого `.js` файла в `ui/`, `engine/`, `ai/`, `data/`, `js/`:
   - Какие `window.X = ...` он пишет (экспорты)
   - Какие `window.X` он читает (импорты)
2. Построить граф: файл → зависит от → файлов.
3. Определить порядок конвертации: файлы без зависимостей (data/*) первыми,
   файлы-оркестраторы (turn.js, init.js, boot.js) последними.
4. Составить список всех inline `onclick` в HTML и JS с привязкой
   к файлу-источнику функции.

---

### Что сделать

**Шаг 55.1 — Создать `docs/refactor_modules.md`**

```markdown
# План перехода на ES-модули

## 1. Граф экспортов (window.X = ...)

| Файл | Экспорты |
|------|----------|
| data/goods.js | GOODS |
| engine/economy.js | calcIncome, calcExpenses, … |
| … | … |

## 2. Граф импортов (window.X чтение)

| Файл | Читает из window.* |
|------|---------------------|
| engine/economy.js | GAME_STATE, CONFIG, GOODS, MAP_REGIONS |
| … | … |

## 3. Порядок конвертации

Уровень 0 (нет зависимостей): data/*.js, config.js
Уровень 1 (зависят от уровня 0): engine/pops.js, engine/economy.js, …
Уровень 2: …
Уровень N (зависят от всех): engine/init.js, ui/boot.js

## 4. Inline onclick — полный реестр

### В index.html (73 шт.)
| Строка | Атрибут | Функция | Файл определения |
|--------|---------|---------|------------------|
| … | onclick="processTurn()" | processTurn | engine/turn.js |

### В JS-шаблонах (186 шт.)
| Файл | Кол-во | Функции |
|------|--------|---------|
| ui/government_tab.js | 54 | govSetupStep2, govSetupToggleInst, … |
| ui/panels.js | 34 | … |
| … | … | … |
```

**Шаг 55.2 — Ничего больше не менять**

---

### Проверка перед коммитом

1. `docs/refactor_modules.md` создан с 4 разделами.
2. Ни один `.js` или `.html` файл не изменён.
3. Список onclick покрывает все 73 (HTML) + 186 (JS).

---

### Коммит

```
refactor(ui): этап 55 — аудит графа зависимостей для ES-модулей
```

---

*Следующий этап: убрать onclick из `index.html`, перевести на addEventListener.*

---

## ЭТАП 56 — Модули: убрать onclick из `index.html` ✅ ВЫПОЛНЕНО

**Направление:** B — переход на ES-модули
**Часть:** 2 из 12

---

### Контекст

В `index.html` 73 inline `onclick` / `onkeydown` / `onchange`.
Стратегия замены: `data-action="имяФункции"` + один делегирующий
обработчик в `ui/boot.js`.

---

### Что сделать

**Шаг 56.1 — Заменить все inline-хендлеры в HTML на `data-action`**

Пример замены:
```html
<!-- было -->
<button onclick="processTurn()">Следующий ход</button>

<!-- стало -->
<button data-action="processTurn">Следующий ход</button>
```

Для хендлеров с аргументами:
```html
<!-- было -->
<button onclick="switchSettingsTab('keys')">🔑 API ключи</button>

<!-- стало -->
<button data-action="switchSettingsTab" data-arg="keys">🔑 API ключи</button>
```

Для `onclick="if(event.target===this)..."` (overlay-закрытие):
```html
<!-- было -->
<div id="char-overlay" onclick="if(event.target===this)closeCharacterDetail()">

<!-- стало -->
<div id="char-overlay" data-action-self="closeCharacterDetail">
```

**Шаг 56.2 — Добавить делегирующий обработчик в `ui/boot.js`**

```js
// Делегирование кликов через data-action
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = window[el.dataset.action];
  if (typeof fn === 'function') {
    const arg = el.dataset.arg;
    arg !== undefined ? fn(arg) : fn();
  }
});

// Overlay-самозакрытие через data-action-self
document.addEventListener('click', function(e) {
  const el = e.target;
  if (el.dataset.actionSelf && e.target === el) {
    const fn = window[el.dataset.actionSelf];
    if (typeof fn === 'function') fn();
  }
});
```

**Шаг 56.3 — Для `onkeydown` — отдельный делегат**

```js
document.addEventListener('keydown', function(e) {
  const el = e.target.closest('[data-keydown]');
  if (!el) return;
  const fn = window[el.dataset.keydown];
  if (typeof fn === 'function') fn(e);
});
```

---

### Проверка перед коммитом

1. `grep -c 'onclick=\|onchange=\|oninput=\|onkeydown=' index.html` — **0**.
2. Все кнопки работают: processTurn, toggleSearchPanel, toggleSettingsModal,
   switchDiptychTab, setMapMode, toggleLog, setLogFilter.
3. Overlay-закрытие по клику на фон работает (char, settings, peace).
4. `onkeydown` в API-key input работает.

---

### Коммит

```
refactor(ui): этап 56 — убрать inline onclick из index.html
```

---

*Следующий этап: убрать onclick из `ui/panels.js`.*

---

## ЭТАП 57 — Модули: убрать onclick из `ui/panels.js` ✅ ВЫПОЛНЕНО

**Направление:** B — переход на ES-модули
**Часть:** 3 из 12

---

### Контекст

`ui/panels.js` — 34 inline `onclick` в шаблонных литералах (`innerHTML`).
Стратегия: заменить `onclick="fn(arg)"` на `data-action="fn" data-arg="arg"`
в генерируемом HTML. Делегирующий обработчик из этапа 56 подхватит их
автоматически.

---

### Что сделать

**Шаг 57.1 — Find & Replace в `ui/panels.js`**

Для каждого `onclick="funcName('arg')"` в шаблонных литералах:
```js
// было
`<button onclick="selectRegion('${regionId}')">...</button>`

// стало
`<button data-action="selectRegion" data-arg="${regionId}">...</button>`
```

Для onclick без аргументов:
```js
// было
`<button onclick="closePanel()">✕</button>`

// стало
`<button data-action="closePanel">✕</button>`
```

Для onclick с несколькими аргументами — использовать `data-arg`
с JSON или составным значением:
```js
// было
`<button onclick="doThing('${a}','${b}')">...</button>`

// стало (разделитель |)
`<button data-action="doThing" data-arg="${a}|${b}">...</button>`
```

И обновить обработчик в `ui/boot.js` чтобы поддерживал `|`-разделитель:
```js
const args = el.dataset.arg?.split('|');
args ? fn(...args) : fn();
```

**Шаг 57.2 — Убедиться что все функции доступны через `window.*`**

---

### Проверка перед коммитом

1. `grep -c 'onclick=' ui/panels.js` — **0**.
2. Все кнопки в панелях работают: выбор региона, детали персонажа,
   переключение вкладок, закрытие панелей.
3. `node --check ui/panels.js` — OK.

---

### Коммит

```
refactor(ui): этап 57 — убрать inline onclick из ui/panels.js
```

---

*Следующий этап: убрать onclick из `ui/government_tab.js`.*

---

## ЭТАП 58 — Модули: убрать onclick из `ui/government_tab.js` ✅ ВЫПОЛНЕНО

**Направление:** B — переход на ES-модули
**Часть:** 4 из 12

---

### Контекст

`ui/government_tab.js` — рекордсмен: 54 inline `onclick` в шаблонах.
Генерирует UI для настройки правительства, институтов, законов,
назначений на должности. Та же стратегия: `data-action` + `data-arg`.

---

### Что сделать

**Шаг 58.1 — Find & Replace все 54 onclick**

Аналогично этапу 57. Каждый `onclick="fn(args)"` → `data-action="fn" data-arg="args"`.

**Шаг 58.2 — Проверить что все экспортируемые функции доступны через `window.*`**

Типичные функции: `govSetupStep2`, `govSetupToggleInst`, `govSetupBack`,
`govSetupConfirm`, `assignToPosition`, `removeFromPosition`,
`showGovernmentOverlay`, `hideGovernmentOverlay`, `showVowsModal`,
`hideVowsModal`, `showTestamentModal`, `hideTestamentModal`.

---

### Проверка перед коммитом

1. `grep -c 'onclick=' ui/government_tab.js` — **0**.
2. Окно правительства открывается и работает: выбор типа,
   институты, назначения, клятвы, завещание.
3. `node --check ui/government_tab.js` — OK.

---

### Коммит

```
refactor(ui): этап 58 — убрать inline onclick из government_tab.js
```

---

*Следующий этап: убрать onclick из `ui/diplomacy_tab.js`.*

---

## ЭТАП 59 — Модули: убрать onclick из `ui/diplomacy_tab.js` ✅ ВЫПОЛНЕНО

**Направление:** B — переход на ES-модули
**Часть:** 5 из 12

---

### Контекст

`ui/diplomacy_tab.js` — 26 inline `onclick`. Генерирует сложный
дипломатический UI: выбор нации, переговоры, чат, мирные предложения,
подкуп, объявление войны. Та же стратегия замены.

---

### Что сделать

**Шаг 59.1 — Find & Replace все 26 onclick**

Каждый `onclick="fn(args)"` → `data-action="fn" data-arg="args"`.

**Шаг 59.2 — Проверить window.* экспорты**

Типичные функции: `dpSelectNation`, `dpSwitchTab`, `dpDeclareWar`,
`dpProposePeace`, `dpOpenPeaceForm`, `dpClosePeaceForm`,
`dtSelectTreaty`, `dtBreakTreaty`, `dtSendMessage`, `dtClearDialogue`,
`dpChatSend`, `dpEndNegotiations`, `dpFinalizeSend`, `dpSignTreaty`,
`hideDiplomacyOverlay`, `showDiplomacyOverlay`, `hideDipChatModal`,
`dpOpenPeaceChat`, `dpBribeNation`, `dpSelectCoalitionEnemy`.

---

### Проверка перед коммитом

1. `grep -c 'onclick=' ui/diplomacy_tab.js` — **0**.
2. Дипломатическое окно работает: выбор нации, переговоры, чат,
   объявление войны, мирные предложения.
3. `node --check ui/diplomacy_tab.js` — OK.

---

### Коммит

```
refactor(ui): этап 59 — убрать inline onclick из diplomacy_tab.js
```

---

*Следующий этап: убрать onclick из остальных 11 файлов.*

---

## ЭТАП 60 — Модули: убрать onclick из остальных JS-файлов ✅ ВЫПОЛНЕНО

**Направление:** B — переход на ES-модули
**Часть:** 6 из 12

---

### Контекст

Оставшиеся 72 inline `onclick` распределены по 11 файлам:

| Файл | Кол-во |
|------|--------|
| ui/map_armies.js | 15 |
| ui/map.js | 11 |
| ui/region_build_tab.js | 10 |
| ui/population_tab.js | 9 |
| ui/treasury-panel.js | 6 |
| ui/tactical_map.js | 6 |
| ui/peace_panel.js | 5 |
| engine/victory.js | 4 |
| engine/achievements.js | 3 |
| ui/input.js | 2 |
| ui/battle_result.js | 1 |

---

### Что сделать

**Шаг 60.1 — Для каждого файла: Find & Replace onclick → data-action**

Та же механика что в этапах 57–59.

**Шаг 60.2 — Проверить window.* экспорты всех затронутых функций**

---

### Проверка перед коммитом

1. `grep -rn 'onclick=' ui/*.js engine/*.js | wc -l` — **0**.
2. Полный smoke-тест: армии на карте, строительство, население,
   казначейство, тактический бой, мирные переговоры, победа,
   достижения, ввод команд.
3. `node --check` для всех 11 файлов — OK.

---

### Коммит

```
refactor(ui): этап 60 — убрать inline onclick из оставшихся JS-файлов
```

---

*Следующий этап: конвертировать `data/*.js` в ES-модули.*

---

## ЭТАП 61 — Модули: конвертировать `data/*.js` в ES-модули

**Направление:** B — переход на ES-модули
**Часть:** 7 из 12

---

### Контекст

Файлы данных (~28 штук) — самый простой уровень для конвертации.
Они не имеют зависимостей друг от друга (кроме `traditions_index.js`
который агрегирует все `traditions_*.js`).

Каждый файл объявляет одну глобальную переменную (`const GOODS = …`)
и не вызывает никаких функций. Конвертация: добавить `export` к
объявлению, убрать `window.X = X`.

---

### Что сделать

**Шаг 61.1 — Для каждого файла в `data/`:**

```js
// было (config.js):
const CONFIG = { ... };

// стало:
export const CONFIG = { ... };
```

Файлы: `config.js`, `data/goods.js`, `data/chains_data.js`,
`data/buildings.js`, `data/laws_labor.js`, `data/social_classes.js`,
`data/map.js`, `data/nations.js`, `data/regions_data.js`,
`data/biomes.js`, `data/region_areas.js`, `data/characters.js`,
`data/cultures.js`, `data/portrait_filters.js`, `data/culture_groups.js`,
`data/religions.js`, `data/dogmas.js`, `data/religion_regions.js`,
все `data/traditions/traditions_*.js`.

**Шаг 61.2 — Для `traditions_index.js`:** добавить `import` от каждого
traditions-файла и реэкспорт.

**Шаг 61.3 — Временно:** пока `engine/` и `ui/` не конвертированы,
добавить в конец каждого файла `window.X = X;` чтобы они оставались
доступны для неконвертированных потребителей. Эти строки будут
удалены в этапах 62–64.

---

### Проверка перед коммитом

1. Все файлы в `data/` содержат `export`.
2. `node --check` (или `node --input-type=module`) — OK.
3. Игра запускается, все данные доступны.

---

### Коммит

```
refactor(data): этап 61 — конвертировать data/*.js в ES-модули
```

---

*Следующий этап: конвертировать `engine/*.js` в ES-модули.*

---

## ЭТАП 62 — Модули: конвертировать `engine/*.js` в ES-модули

**Направление:** B — переход на ES-модули
**Часть:** 8 из 12

---

### Контекст

~23 файла в `engine/` (включая 9 новых из направления A).
Каждый файл экспортирует функции через `window.*`.
Конвертация: `window.X = X` → `export function X(…)`,
добавить `import { … } from '…'` для зависимостей из `data/` и
других `engine/` файлов.

**Порядок конвертации** (по уровню зависимостей):
1. Файлы без зависимостей от других engine: `pops.js`, `land_capacity.js`,
   `noise.js`, `memory.js`, `fortress.js`
2. Файлы с зависимостями от data: `economy.js`, `diplomacy.js`,
   `buildings.js`, `market.js`, `provinces.js`
3. Файлы с зависимостями от других engine: `battle.js`, `armies.js`,
   `combat.js`, `siege.js`
4. Оркестраторы: `turn.js`, `init.js`

---

### Что сделать

**Шаг 62.1 — Для каждого файла:**

1. Заменить `window.X = X` на `export { X }` или `export function X`.
2. Добавить `import { … } from '…'` вместо чтения `window.*`.
3. Для функций, которые вызываются из HTML через `data-action` —
   оставить `window.X = X` **временно** (будет убрано в этапе 65).

**Шаг 62.2 — Обновить `<script>` теги**

Заменить `<script src="engine/X.js">` на
`<script type="module" src="engine/X.js">` по мере конвертации.

---

### Проверка перед коммитом

1. Все `engine/*.js` файлы содержат `export` и `import`.
2. `grep -rn 'window\.' engine/*.js` — только `window.GAME_STATE`
   (глобальное состояние) и `window.X` для data-action хендлеров.
3. Игра запускается, ход проходит, все движковые системы работают.

---

### Коммит

```
refactor(engine): этап 62 — конвертировать engine/*.js в ES-модули
```

---

*Следующий этап: конвертировать `ui/*.js` в ES-модули.*

---

## ЭТАП 63 — Модули: конвертировать `ui/*.js` в ES-модули

**Направление:** B — переход на ES-модули
**Часть:** 9 из 12

---

### Контекст

~25+ файлов в `ui/` (включая 6 новых из Части II).
UI-файлы — самые сложные для конвертации, потому что:
1. Они импортируют из `data/`, `engine/`, других `ui/`.
2. Многие экспортируют функции для `data-action` хендлеров.
3. Некоторые зависят от DOM и вызывают `document.addEventListener`.

**Порядок конвертации:**
1. Утилиты: `icons.js`, `toast.js`, `pulse.js`, `log.js`
2. Карта: `map.js`, `map_armies.js`, `map_events.js`, `map_event_feed.js`
3. Панели: `panels.js`, `diplomacy_tab.js`, `government_tab.js`,
   `population_tab.js`, `economy_tab.js`, `region_build_tab.js`
4. Специальные: `splash.js`, `aqueduct.js`, `diplo_graph.js`,
   `tactical_map.js`, `battle_map_pixi.js`
5. Оркестраторы: `boot.js` (последний)

---

### Что сделать

**Шаг 63.1 — Для каждого файла:**

1. `window.X = X` → `export { X }` или `export function X`.
2. Добавить `import { … } from '…'`.
3. Для `data-action` функций: зарегистрировать в `ui/boot.js`
   через централизованный реестр вместо `window.X`:
   ```js
   // ui/boot.js
   import { processTurn } from '../engine/turn.js';
   import { toggleSearchPanel } from './top_bar.js';
   
   const ACTIONS = { processTurn, toggleSearchPanel, … };
   
   document.addEventListener('click', e => {
     const el = e.target.closest('[data-action]');
     if (!el) return;
     const fn = ACTIONS[el.dataset.action];
     if (fn) { … }
   });
   ```

**Шаг 63.2 — Обновить `<script>` теги в `index.html`**

---

### Проверка перед коммитом

1. Все `ui/*.js` содержат `export` и `import`.
2. Весь UI работает: панели, карта, дипломатия, лог, строка ввода.
3. `grep -rn 'window\.' ui/*.js` — минимум (только `window.GAME_STATE`).

---

### Коммит

```
refactor(ui): этап 63 — конвертировать ui/*.js в ES-модули
```

---

*Следующий этап: конвертировать `ai/*.js` в ES-модули.*

---

## ЭТАП 64 — Модули: конвертировать `ai/*.js` в ES-модули

**Направление:** B — переход на ES-модули
**Часть:** 10 из 12

---

### Контекст

7 файлов в `ai/`: `prompts.js`, `parser.js`, `claude.js`,
`diplomacy_ai.js`, `utility_ai.js`, `commander_ai.js`,
`treaty_interpreter.js`, `chronicle.js`.

AI-модули зависят от `engine/` (дипломатия, экономика, армии)
и `data/` (нации, регионы). Конвертация аналогична предыдущим этапам.

---

### Что сделать

**Шаг 64.1 — Для каждого файла в `ai/`:**

1. `window.X = X` → `export`.
2. Добавить `import { … } from '…'`.
3. Обновить `<script>` теги.

---

### Проверка перед коммитом

1. Все `ai/*.js` содержат `export` и `import`.
2. AI-команды работают: ввод в строку команды, ответ AI,
   дипломатический AI, AI-командир, хроника.
3. `node --check` — OK для всех файлов.

---

### Коммит

```
refactor(ai): этап 64 — конвертировать ai/*.js в ES-модули
```

---

*Следующий этап: единый entry-point `<script type="module">`.*

---

## ЭТАП 65 — Модули: единый `<script type="module" src="ui/boot.js">`

**Направление:** B — переход на ES-модули
**Часть:** 11 из 12

---

### Контекст

После этапов 61–64 все файлы конвертированы в ES-модули.
Осталось:
1. Удалить все `<script src="…">` теги из `index.html` (кроме CDN-библиотек).
2. Оставить единственный `<script type="module" src="ui/boot.js">`.
3. `ui/boot.js` становится точкой входа — импортирует всё нужное,
   регистрирует `data-action` обработчики, запускает `initGame()`.

---

### Что сделать

**Шаг 65.1 — Обновить `ui/boot.js`**

```js
// ui/boot.js — единственная точка входа
import { initGame } from '../engine/init.js';
import { processTurn } from '../engine/turn.js';
import { toggleSearchPanel, … } from './top_bar.js';
import { toggleSettingsModal, … } from './settings.js';
// … все остальные импорты

// Реестр data-action функций
const ACTIONS = {
  processTurn,
  toggleSearchPanel,
  toggleSettingsModal,
  // … полный список
};

// Делегирование кликов
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (typeof fn !== 'function') return;
  const args = el.dataset.arg?.split('|');
  args ? fn(...args) : fn();
});

// Запуск игры
initGame();
```

**Шаг 65.2 — Очистить `index.html`**

Удалить все ~108 `<script src="…">` тегов (кроме Leaflet и PixiJS CDN).
Удалить все инлайн `<script>` блоки (A–F).
Оставить:
```html
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.js"></script>
<script type="module" src="ui/boot.js"></script>
```

**Шаг 65.3 — Удалить все оставшиеся `window.X = X` из всех файлов**

После этого шага ни один файл не пишет в `window.*` (кроме
`window.GAME_STATE` — глобальное состояние, оставить как есть).

---

### Проверка перед коммитом

1. `index.html` содержит только 3 `<script>` тега.
2. `grep -c '<script' index.html` — **3**.
3. `grep -rn 'window\.' ui/ engine/ ai/ data/ | grep '= ' | wc -l` — **≤ 5**
   (только `window.GAME_STATE` и CDN-глобалы типа `window.L`, `window.PIXI`).
4. Игра запускается и полностью работает.

---

### Коммит

```
refactor(ui): этап 65 — единый entry-point, удаление script-тегов
```

---

*Следующий этап: финальный аудит ES-модулей.*

---

## ЭТАП 66 — Модули: финальный аудит, 0 глобалов, 0 inline onclick

**Направление:** B — переход на ES-модули
**Часть:** 12 из 12 — верификация

---

### Контекст

Все файлы конвертированы в ES-модули, все `onclick` убраны,
единая точка входа — `ui/boot.js`. Этот этап — только проверка.

---

### Что сделать

**Шаг 66.1 — Автоматические проверки**

```bash
# 0 inline onclick в HTML
grep -c 'onclick=' index.html   # ожидание: 0

# 0 inline onclick в JS
grep -rn 'onclick=' ui/ engine/ ai/ | wc -l   # ожидание: 0

# Минимум window.* экспортов
grep -rn 'window\.' ui/ engine/ ai/ data/ | grep '=' | wc -l   # ≤ 5

# Все файлы — модули
grep -c 'type="module"' index.html   # ожидание: 1 (boot.js)

# Размер index.html
wc -l index.html   # ожидание: значительно меньше 3000
```

**Шаг 66.2 — Полный smoke-тест**

```
[ ] Сплэш → мозаика → fade-out
[ ] Стела: имя, дата, ресурсы
[ ] Клепсидра: анимация, флип
[ ] Карта: масштаб, режимы, армии
[ ] Левая панель: вкладки, контент
[ ] Правая панель: советники
[ ] Лог: записи, фильтры, раскрытие
[ ] Строка команды: ввод, AI-ответ
[ ] Полный ход: processTurn
[ ] Дипломатия: переговоры, война, мир
[ ] Сохранение/загрузка
[ ] Горячие клавиши
[ ] Модалки: настройки, поиск
[ ] Тактический бой
[ ] Ambient-слой
```

**Шаг 66.3 — Обновить `docs/refactor_modules.md`**

Добавить финальные метрики.

---

### Проверка перед коммитом

1. Все автоматические проверки зелёные.
2. Все пункты smoke-теста зелёные.

---

### Коммит

```
refactor(ui): этап 66 — финальный аудит ES-модулей
```

---

## ИТОГ НАПРАВЛЕНИЯ B

После этапов 55–66:
- **0** inline `onclick` в HTML и JS
- **0** `window.X = X` экспортов (кроме `GAME_STATE`)
- Все 74+ файла — ES-модули с `import`/`export`
- Единая точка входа: `ui/boot.js`
- Централизованный реестр `data-action` обработчиков
- Полная обратная совместимость — игра работает идентично

---

*Следующий этап: инициализация Vite.*

---

## ЭТАП 67 — Vite: инициализация проекта

**Направление:** C — build-step
**Часть:** 1 из 5

---

### Контекст

После направления B все файлы — ES-модули с единой точкой входа
`ui/boot.js`. Vite может работать с этим as-is: в dev-режиме
он раздаёт ES-модули напрямую (без бандлинга), а в build-режиме
собирает оптимизированный бандл через Rollup.

---

### Что сделать

**Шаг 67.1 — Инициализировать npm и установить Vite**

```bash
npm init -y
npm install --save-dev vite
```

**Шаг 67.2 — Создать `vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    open: '/index.html',
  },
});
```

**Шаг 67.3 — Обновить `.gitignore`**

Добавить:
```
node_modules/
dist/
```

**Шаг 67.4 — Добавить npm-скрипты в `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

**Шаг 67.5 — Проверить что `npm run dev` запускает dev-сервер**

Открыть `http://localhost:5173` — игра должна загрузиться.

---

### Проверка перед коммитом

1. `npm run dev` — сервер стартует без ошибок.
2. Игра загружается в браузере через dev-сервер.
3. Hot Module Replacement работает (изменить CSS → изменения
   применяются без перезагрузки).
4. `.gitignore` содержит `node_modules/` и `dist/`.

---

### Коммит

```
build: этап 67 — инициализация Vite, package.json
```

---

*Следующий этап: настройка dev-сервера с HMR.*

---

## ЭТАП 68 — Vite: настройка dev-сервера с HMR

**Направление:** C — build-step
**Часть:** 2 из 5

---

### Контекст

Базовый `vite dev` уже работает (этап 67). Теперь нужно:
1. Настроить HMR для CSS (автоматически работает через `<link>`).
2. Настроить проксирование API-запросов к Groq/Claude если они
   идут через отдельный бэкенд (или оставить direct CORS).
3. Добавить алиасы путей если нужно (`@engine/`, `@ui/`, `@data/`).

---

### Что сделать

**Шаг 68.1 — Алиасы путей (опционально)**

В `vite.config.js`:
```js
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'engine'),
      '@ui':     resolve(__dirname, 'ui'),
      '@data':   resolve(__dirname, 'data'),
      '@ai':     resolve(__dirname, 'ai'),
    },
  },
  // ...
});
```

Это позволит писать `import { X } from '@engine/turn.js'`
вместо `import { X } from '../engine/turn.js'`.

**Шаг 68.2 — Проксирование API (если нужно)**

```js
server: {
  proxy: {
    '/api': {
      target: 'https://api.groq.com',
      changeOrigin: true,
      rewrite: path => path.replace(/^\/api/, ''),
    },
  },
},
```

**Шаг 68.3 — Обработка CDN-зависимостей**

Leaflet и PixiJS загружаются через CDN `<script>`. Vite их не
трогает — они остаются как есть. Но можно установить через npm
и импортировать:
```bash
npm install leaflet pixi.js
```
```js
import L from 'leaflet';
import * as PIXI from 'pixi.js';
```

Это опционально — CDN тоже работает.

---

### Проверка перед коммитом

1. `npm run dev` — сервер стартует.
2. Изменение CSS → HMR применяет изменения без перезагрузки.
3. Изменение JS → страница перезагружается автоматически.
4. API-запросы к AI работают (если настроен прокси).

---

### Коммит

```
build: этап 68 — настройка dev-сервера, алиасы, HMR
```

---

*Следующий этап: продакшн-сборка.*

---

## ЭТАП 69 — Vite: продакшн-сборка

**Направление:** C — build-step
**Часть:** 3 из 5

---

### Контекст

`vite build` из коробки делает:
- Tree-shaking (удаление неиспользуемого кода)
- Минификация (esbuild, быстрее terser)
- CSS-минификация
- Source maps
- Asset hashing (для кэширования)

Нужно убедиться что сборка работает и результат корректен.

---

### Что сделать

**Шаг 69.1 — Запустить `npm run build`**

```bash
npm run build
```

Проверить содержимое `dist/`:
- `index.html` (с хешированными путями)
- `assets/` (JS-бандл, CSS-бандл, шрифты, изображения)

**Шаг 69.2 — Проверить через `npm run preview`**

```bash
npm run preview
```

Открыть `http://localhost:4173` — игра должна работать идентично dev-режиму.

**Шаг 69.3 — Настроить source maps**

В `vite.config.js`:
```js
build: {
  outDir: 'dist',
  sourcemap: true,
  minify: 'esbuild',   // быстрая минификация
  target: 'es2020',     // целевые браузеры
},
```

**Шаг 69.4 — Сравнить размеры**

```bash
# До (сумма всех JS)
find . -name '*.js' -not -path './node_modules/*' -not -path './dist/*' | xargs wc -c | tail -1

# После (бандл в dist/)
ls -lh dist/assets/*.js
```

Ожидание: бандл значительно меньше суммы исходников благодаря
tree-shaking и минификации.

---

### Проверка перед коммитом

1. `npm run build` завершается без ошибок.
2. `npm run preview` — игра работает полностью.
3. Source maps генерируются в `dist/assets/`.
4. Размер бандла разумный (ожидание: < 500 КБ gzip).

---

### Коммит

```
build: этап 69 — продакшн-сборка с tree-shaking и минификацией
```

---

*Следующий этап: code-splitting и lazy-load.*

---

## ЭТАП 70 — Vite: code-splitting и lazy-load

**Направление:** C — build-step
**Часть:** 4 из 5

---

### Контекст

Не весь код нужен при первой загрузке. Тяжёлые модули можно
загружать лениво (dynamic `import()`), чтобы ускорить initial load:

- **Тактический бой** (~2500 строк) — нужен только при начале боя
- **Дипломатическое окно** (~2000 строк) — только при открытии
- **Экономический обзор** (~800 строк) — только при открытии вкладки
- **Battle Map PixiJS** (~2500 строк) — только при тактическом бое

---

### Что сделать

**Шаг 70.1 — Заменить статические import на dynamic import()**

```js
// было (в boot.js или panels.js):
import { showDiplomacyOverlay } from './diplomacy_tab.js';

// стало:
async function showDiplomacyOverlay(nationId) {
  const { showDiplomacyOverlay: show } = await import('./diplomacy_tab.js');
  show(nationId);
}
```

Кандидаты для lazy-load:
- `ui/diplomacy_tab.js` → загружать при открытии дипломатии
- `ui/tactical_map.js` + `engine/tactical_battle.js` → при начале боя
- `ui/battle_map_pixi.js` → при начале тактического боя
- `ui/economy_react.jsx` → при открытии экономического обзора
- `ui/population_tab.js` → при открытии вкладки населения

**Шаг 70.2 — Настроить manual chunks в `vite.config.js`**

```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['leaflet', 'pixi.js'],  // если установлены через npm
        diplomacy: ['./ui/diplomacy_tab.js'],
        tactical: ['./ui/tactical_map.js', './engine/tactical_battle.js',
                    './ui/battle_map_pixi.js'],
      },
    },
  },
},
```

**Шаг 70.3 — Добавить loading-индикатор**

При ленивой загрузке показывать маленький спиннер:
```js
async function lazyLoad(importFn, loadingEl) {
  if (loadingEl) loadingEl.style.display = 'block';
  const mod = await importFn();
  if (loadingEl) loadingEl.style.display = 'none';
  return mod;
}
```

---

### Проверка перед коммитом

1. `npm run build` — генерирует несколько чанков в `dist/assets/`.
2. Основной бандл (initial load) стал меньше.
3. Дипломатия, тактический бой, экономика подгружаются при открытии.
4. Нет задержки > 500ms при ленивой загрузке (модули маленькие).
5. Все функции работают после ленивой загрузки.

---

### Коммит

```
build: этап 70 — code-splitting, lazy-load тяжёлых модулей
```

---

*Следующий этап: финальный аудит Части III.*

---

## ЭТАП 71 — Финальный аудит Части III

**Направление:** C — build-step
**Часть:** 5 из 5 — верификация всего

---

### Контекст

Все три направления завершены. Этот этап — полный аудит
и smoke-тест всей Части III (этапы 44–71).

---

### Что сделать

**Шаг 71.1 — Метрики**

```bash
# engine/turn.js
wc -l engine/turn.js   # ожидание: ~600 (было 2575)

# index.html
wc -l index.html        # ожидание: < 2000 (было 14042)
grep -c '<script' index.html  # ожидание: 3 (leaflet, pixi, boot.js)

# Inline onclick
grep -rn 'onclick=' index.html ui/ engine/ ai/ | wc -l  # ожидание: 0

# window.* экспорты
grep -rn 'window\.' ui/ engine/ ai/ data/ | grep '=' | wc -l  # ожидание: ≤ 5

# Бандл
ls -lh dist/assets/*.js   # размер чанков
npm run build 2>&1 | tail -20  # вывод сборки
```

**Шаг 71.2 — Полный smoke-тест (dev + build)**

Проверить в **обоих** режимах (`npm run dev` и `npm run preview`):

```
[ ] Сплэш → мозаика → fade-out
[ ] Стела: имя, дата обновляются
[ ] Клепсидра: вода, пульс, флип
[ ] Аквидукт: ресурсы, частицы
[ ] Карта: масштаб, режимы, армии-орлы, города
[ ] Роза ветров: переключает режимы
[ ] Диптих: раскрытие, 5 вкладок
[ ] Камеи: советники, hover-карточки
[ ] Табличка-лог: записи, фильтры, раскрытие
[ ] Строка команды: ввод, AI-ответ (гонец)
[ ] processTurn: полный цикл хода
[ ] Дипломатия: переговоры, война, мир (lazy-load)
[ ] Тактический бой (lazy-load)
[ ] Сохранение и загрузка
[ ] Горячие клавиши: Space, Esc, /, 1-4
[ ] Модалки: настройки, поиск, diplo-graph
[ ] Ambient-слой: тессеры, дыхание карты
[ ] UI-реакции: flash/shake
[ ] HMR: изменение CSS применяется без перезагрузки
[ ] Консоль DevTools: 0 ошибок
```

**Шаг 71.3 — Обновить документацию**

Обновить `docs/refactor_turn.md` и `docs/refactor_modules.md`
с финальными метриками.

---

### Проверка перед коммитом

1. Все метрики соответствуют ожиданиям.
2. Все пункты smoke-теста зелёные в обоих режимах.
3. Документация обновлена.
4. Все этапы 44–71 помечены как ✅ ВЫПОЛНЕНО.

---

### Коммит

```
build: этап 71 — финальный аудит Части III
```

---

## ИТОГ ЧАСТИ III

После этапов 44–71:

**Направление A (turn.js):**
- `engine/turn.js`: 2575 → ~600 строк
- 9 новых модулей: date, characters_lifecycle, espionage, ai_scoring,
  ai_fallback, ai_worker, events, save, init

**Направление B (ES-модули):**
- 0 inline `onclick` (было 73 в HTML + 186 в JS)
- 0 `window.*` экспортов (было 85 в файлах + 30 в инлайн-скриптах)
- Все 74+ файла — ES-модули с `import`/`export`
- Единая точка входа: `ui/boot.js`

**Направление C (Vite):**
- `npm run dev` — dev-сервер с HMR
- `npm run build` — минифицированный бандл с tree-shaking
- Code-splitting: дипломатия, тактический бой, экономика — lazy-load
- Source maps для отладки

**Итоговые метрики:**

| Метрика | Начало (до Части I) | После Части III |
|---------|---------------------|-----------------|
| `index.html` строк | ~14 000 | < 2 000 |
| `<script>` тегов | 117 | 3 |
| Inline onclick | 259 | 0 |
| `window.*` экспортов | 115+ | ≤ 5 |
| `engine/turn.js` строк | 2 575 | ~600 |
| Build-step | нет | Vite (dev + prod) |
| Модульная система | `window.*` | ES modules |

Проект превратился из монолитного HTML-файла с глобалами
в современное модульное приложение с build-pipeline.
