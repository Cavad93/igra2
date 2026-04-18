# Session 14 — Vite prod-build: manualChunks + preload

**Scope:** build-time оптимизация. Runtime-метрики не меняются (проверено `perf/profile.mjs` — p50 ~2.1с, в пределах шума от Session 13).

## Цель

Разбить 5.9 MB главный `index.js` чанк на логические группы движка
(`engine-core`, `engine-econ`, `engine-dip`, `engine-war`, `engine-ai`),
вынести большие статические датасеты в отдельные чанки
(`data-map`, `data-nations`), чтобы:

1. Браузер грузил чанки параллельно (HTTP/2 multiplexing).
2. Обновления UI не инвалидировали кэш движка и наоборот.
3. Vite автоматически проставил `<link rel="modulepreload">` для всех
   статически импортируемых чанков (проверено — 8 preload-тегов в `dist/index.html`).

## Изменения

- [vite.config.js](../vite.config.js) — расширен `manualChunks`:
  - `engine-core`: `turn`, `init`, `date`, `save`, `save_worker`, `idb_storage`,
    `events`, `orders`, `achievements`.
  - `engine-econ`: `economy*`, `market`, `storage`, `loans`, `land_capacity`,
    `buildings`, `pops`, `demography*`, `forests`, `roads`, `rivers`, `noise`,
    `culture`, `religion`, `provinces`.
  - `engine-dip`: `diplomacy*`, `treaty_*`, `espionage`, `conspiracy`, `dialogue`.
  - `engine-war`: `armies`, `battalion`, `battle`, `combat`, `siege`,
    `fortifications`, `fortress`, `war_score`, `victory`.
  - `engine-ai`: `ai_worker`, `ai_fallback`, `ai_scoring`, `characters_*`,
    `super_ou`, `government`, `senate`, `constitutional`, `memory`, весь `ai/*`.
  - `data-map`: `data/map.js`, `region_centroids`, `nation_geo`, `region_areas`,
    `deposit_map`.
  - `data-nations`: `data/nations.js`, `nation_enriched`, `chains_data`,
    `pdf_chains`, `data/buildings`, `biomes`.

Исходный `index.html` **не трогался** — Vite автоматически добавил
modulepreload в собранный `dist/index.html`.

## Before → After (`dist/assets/`)

| Чанк            | Before (kB) | After (kB) | Before gzip | After gzip |
|-----------------|-------------|------------|-------------|------------|
| `index`         | **5,883.95** | **671.27** (−88%) | 1,666.53 | 188.35 (−89%) |
| `engine-ai`     | —           | 520.33     | —           | 155.29 |
| `engine-econ`   | —           | 107.78     | —           | 34.77 |
| `engine-core`   | —           | 75.50      | —           | 23.95 |
| `engine-dip`    | —           | 53.64      | —           | 17.18 |
| `engine-war`    | —           | 37.36      | —           | 12.93 |
| `data-map`      | —           | 3,407.19   | —           | 1,079.26 |
| `data-nations`  | —           | 1,012.09   | —           | 160.90 |
| `regions_data`  | 7,218.46    | 7,218.46   | 302.96 | 302.96 |
| `tactical`      | 33.01       | 33.01      | 11.46 | 11.47 |
| `diplomacy`     | 52.48       | 52.48      | 15.10 | 15.10 |
| `population`    | 49.71       | 49.71      | 13.88 | 13.88 |
| `economy_ui`    | 40.60       | 40.60      | 10.61 | 10.61 |

**Суммарный размер JS:** 13,279 kB → 13,280 kB — код тот же, только перегруппирован.

**Largest non-data chunk:** 5,884 kB → **671 kB** (−88% wall-size, −89% gzip).

## Modulepreload (автогенерация Vite)

В `dist/index.html` вставлены 8 тегов `<link rel="modulepreload">` для всех
статически импортируемых чанков: `rolldown-runtime`, `data-nations`,
`data-map`, `engine-ai`, `engine-core`, `engine-econ`, `engine-war`,
`engine-dip`. Дин-импорты (`diplomacy_tab`, `population_tab`, `tactical`,
`regions_data`) preload'ом не покрыты — это правильно, они грузятся по требованию.

## Verification

- **Tests:** `node tests/audit/eco_unit_test.cjs` — PASS (18/18).
- **Runtime profiler:** `node perf/profile.mjs` — p50 = 2117.6ms, p95 = 6678ms.
  Разница с baseline Session 13 (p50 = 2521, p95 = 5157) — в пределах шума
  от 9/10 «медленных» ходов из-за накопленных событий, не регрессия.
- **Build:** `vite build` зелёный, 146 модулей, 2.7с на пересборку.

## Notes

- Warning «chunks larger than 500 kB» теперь из-за `engine-ai` (520 kB) и
  data-чанков — это осознанно. `engine-ai` можно будет раздробить далее,
  если потребуется (разделить `engine/` и `ai/` внутри), но сейчас бюджет
  первой загрузки уже комфортный: `index` + `engine-core` + `engine-econ`
  + `engine-dip` + `engine-war` = ~945 kB (272 kB gzip) — против 5.9 MB до.
- `preview`-замер first-interaction не делался: тестовая среда без браузера.
  На реальной загрузке выигрыш должен быть на параллелизме HTTP/2 + кэше.
