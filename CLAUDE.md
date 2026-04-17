# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

**Ancient Strategy (igra2 / Syracuse 301 BC)** — браузерная историческая стратегия на ванильном JS без фреймворков (кроме Leaflet и Pixi.js по CDN). Игровая нация по умолчанию — Сиракузы, старт — 301 г. до н.э. Параллельно в репозитории живёт Node-агент **Pax Historia Chain Builder** в [agents/](agents/), который генерирует производственные цепочки через Claude API.

Язык кода и комментариев — русский. Общение с пользователем — на русском, если явно не указано иначе.

## Основные команды

```bash
# ── Игра (Vite dev-сервер с HMR) ──
npm run dev          # vite — откроет index.html на localhost
npm run build:vite   # vite build → dist/
npm run preview      # vite preview

# ── Агент генерации цепочек Pax Historia ──
npm run build        # node agents/chain_builder.js — пакетная генерация
npm run ui           # node agents/server.js — HTTP+SSE UI для агента (PORT=3000)
npm run validate     # node agents/validate_inputs.js
npm run geo          # node scripts/geo_server.js

# ── Локальный LLM (для фоновых AI-наций через Ollama/llama.cpp) ──
bash setup_llm.sh                     # один раз: brew install llama.cpp + скачать модель
HF_TOKEN=hf_xxx bash setup_llm.sh     # альтернатива: Phi-4-Mini (нужен HF токен)
bash start_llm.sh                     # перезапуск уже установленной модели
bash stop_llm.sh                      # остановить сервер на :11434

# ── Тесты ──
node tests/<name>_test.js             # отдельный тест (они автономные, без фреймворка)
node tests/audit/eco_unit_test.cjs    # модульные тесты аудита (eco/mil/dip/gov/ai/map)
node test_ui.mjs                      # Playwright UI smoke — требует /opt/node22/lib/node_modules/playwright
node test_diag.mjs                    # расширенная диагностика (NaN/Infinity, 10 ходов)
```

Тесты **не используют** Jest/Mocha: каждый `*_test.js` / `*_test.cjs` / `test_*.mjs` — отдельный исполняемый файл с локальной функцией `assert` и `process.exit` при падении. Нет агрегатора — запускать нужные штучно.

`test_ui.mjs` хардкодит `import pkg from '/opt/node22/lib/node_modules/playwright/index.js'` — этот путь характерен для QA-окружения (`docs/qa_prompt.md`). Локально измените путь к playwright или ставьте его в nodemodules.

## Архитектура

### Два несвязанных приложения в одном репозитории

1. **Игра** — всё, что подгружается через [index.html](index.html) → [ui/boot.js](ui/boot.js). Работает в браузере.
2. **Агент сборки цепочек** — CLI/HTTP-утилита в [agents/](agents/), которая через Anthropic API строит `data/chains_data.js` и `data/buildings.js` офлайн. Это **не** часть игрового рантайма.

Игра читает готовые `data/*.js` как ES-модули; агент их переписывает. Никаких зависимостей между ними во время выполнения.

### Граф загрузки игры

Единственная точка входа — `<script type="module" src="ui/boot.js">` в [index.html:926](index.html#L926). [ui/boot.js](ui/boot.js) импортирует ~119 ES-модулей (config → data → ui base → engine → ai → ui overlays) и затем вручную регистрирует все именованные экспорты на `window` через утилиту `_reg(...)`. Это намеренный архитектурный компромисс:

- **Файлы — ES-модули** (`import`/`export`), но кросс-модульные вызовы идут через `window.X(...)`.
- Причина — `data-action` атрибуты в HTML и старый код, написанный до миграции (см. [docs/refactor_modules.md](docs/refactor_modules.md) — этап 55+ миграции).
- **При добавлении нового модуля**: добавить `import * as _x from './x.js'` и `_reg(_x)` в [ui/boot.js](ui/boot.js). Не добавлять `<script>` в index.html.

Ход игры централизован в [engine/turn.js](engine/turn.js) (`processTurn()`), который тикает все подсистемы в фиксированном порядке. Подсистемы разбиты по файлам в [engine/](engine/) и общаются через глобальный `GAME_STATE` (+ `MAP_REGIONS` для геоданных — это разные места, см. ниже).

### GAME_STATE vs MAP_REGIONS — распространённая ловушка

- `GAME_STATE.regions[id]` — игровое состояние региона (владелец, здания, население).
- `MAP_REGIONS[id]` — статическая география (`connections`, координаты, mapType) из [data/map.js](data/map.js).

В поле `r.connections` **есть только у `MAP_REGIONS`**. Чтение `GAME_STATE.regions[id].connections` вернёт `undefined` — в [AUDIT_LOG.md](AUDIT_LOG.md) уже три бага от этой ошибки. Всегда оборачивать через `typeof MAP_REGIONS !== 'undefined'` для Node-тестов.

### Канонические единицы экономики

`config.js` фиксирует **1 игровая единица = 1 кг** для всех товаров, кроме `horses/cattle` (голов) и `slaves` (человек). Константы `SLAVE_BASIC_BASKET`, `needs[good].per_100`, `production_output.base_rate` калиброваны под это. Не менять `CONFIG.UNIT_KG` без пересчёта всего датасета.

Экономический тик расширен модулем [engine/economy_ext.js](engine/economy_ext.js) (инфляция, циклы boom/recession, специализация регионов, монополии, tech drift). Деталь плана — [docs/economic2.md](docs/economic2.md).

### Подсистема ИИ — три модели с разными ролями

- **Anthropic Claude Sonnet** (`CONFIG.MODEL_SONNET`) — только дипломатические диалоги с игроком-человеком. Ключ вводится в UI и шифруется в localStorage.
- **Groq Llama-3.3-70B** (`CONFIG.MODEL_WAR_AI`) — военный AI во время войны с игроком (нужен низкий latency).
- **Ollama/llama.cpp** на `localhost:11434` (`CONFIG.MODEL_HAIKU`, по умолчанию `phi4-mini`) — батчевые решения фоновых AI-наций (`CONFIG.OLLAMA_BATCH=5` наций за запрос).

Все вызовы идут через [ai/claude.js](ai/claude.js) (Anthropic), [engine/ai_worker.js](engine/ai_worker.js) (Groq через Web Worker для неблокирующего тика), [ai/strategic_llm.js](ai/strategic_llm.js). Есть детерминистский fallback [engine/ai_fallback.js](engine/ai_fallback.js) — когда ключей нет и Ollama выключена.

### Тактический бой — отдельный рендерер

Движок тактического боя — [engine/tactical_battle.js](engine/tactical_battle.js); рендер — [ui/battle_map_pixi.js](ui/battle_map_pixi.js) (Pixi.js v8, подключается с CDN) + fallback на Canvas 2D в [ui/tactical_map.js](ui/tactical_map.js). Vite собирает тактику в отдельный чанк `tactical` (см. [vite.config.js](vite.config.js)). Интеграция — перехват `resolveBattle()` в [engine/armies.js](engine/armies.js) только для армий игрока; детали плана — [docs/bitva.md](docs/bitva.md).

### Карта и геоданные — источник истины

Карта построена на **Pax Historia preset "Legacy of Alexander | 304 BC"** (Rami Elhadhoudi / Itacool) + тайлы CAWM (lib.uiowa.edu). Данные в [data/pleiades_300bc.json](data/pleiades_300bc.json), [data/world_bc300.geojson](data/world_bc300.geojson), [data/map.js](data/map.js). Миграционные скрипты в [scripts/](scripts/) (Python + JS) — одноразовые, использовались для сборки стартового состояния; при рантайме не запускаются.

### CSS — миграция в процессе

CSS был монолитом в `<style>` внутри [index.html](index.html) на ~11k строк. Этапы 32–80 выносили его в [ui/styles/*.css](ui/styles/) по подсистемам (base, top, panels, map, diplomacy, ...). Сейчас index.html ~930 строк, inline-CSS практически не осталось. При добавлении стилей — идти в соответствующий `.css` файл, не плодить inline.

## Соглашения

- **Не запускать автотесты после каждого изменения** — тесты медленные (`test_ui.mjs` — Playwright с заходом в браузер на реальные 10 ходов). Запускать только релевантные unit-тесты из [tests/audit/](tests/audit/) и финальный прогон при завершении задачи.
- **Новая логика хода** идёт в соответствующий `engine/*.js` и вызывается из `processTurn()` в порядке, не нарушающем существующие инварианты (`_ensureNationDefaults` → производство → рынок → дипломатия → военные → события → сохранение).
- **Не коммитить** `models/`, `*.gguf`, `llm_server.*`, `assets/portraits/**/*.jpg`, `assets/textures/*.jpg`, `dist/`, `data/backups/` — они в [.gitignore](.gitignore).
- **API-ключи** хранятся только на клиенте (шифрованные в localStorage через [ui/apikey.js](ui/apikey.js)). Не добавлять значения в [config.js](config.js).

## Ключевые документы

- [AUDIT_LOG.md](AUDIT_LOG.md) — последние найденные баги по подсистемам с номерами файлов/строк.
- [docs/refactor_index.md](docs/refactor_index.md), [docs/refactor_modules.md](docs/refactor_modules.md), [docs/refactor_turn.md](docs/refactor_turn.md) — карта текущей декомпозиции (какой символ в каком файле).
- [docs/economic2.md](docs/economic2.md) — план 10-этапных улучшений экономики (большая часть уже в [engine/economy_ext.js](engine/economy_ext.js)).
- [docs/bitva.md](docs/bitva.md), [docs/bitva_schedule_prompt.md](docs/bitva_schedule_prompt.md) — план тактического боя.
- [docs/victory_design.md](docs/victory_design.md) — условия победы.
- [arma.md](arma.md), [uisuper.md](uisuper.md) — пошаговые журналы крупных UI/боевых рефакторингов (номера «Этапов» встречаются в коммитах и комментариях).
- [qa_prompt.md](qa_prompt.md) — инструкция для автоматического QA-агента на CI.
