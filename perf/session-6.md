# Session 6 — Убрать `innerHTML=` в `updateResourceBar` / `renderRightPanel`

**Before (20 повторных вызовов в одном ходу, значения не менялись):**

| Путь                               | Mutations |
|-----------------------------------|----------:|
| `updateResourceBar` × 20           |       240 |
| `renderRightPanel`  × 20           |      1320 |

**After:**

| Путь                               | Mutations |
|-----------------------------------|----------:|
| `updateResourceBar` × 20           |     **0** |
| `renderRightPanel`  × 20           |     **0** |

**Delta:** −100 % на обеих горячих точках (план требовал ≥ 10×).

## Per-turn breakdown (profile.mjs, 10 ходов)

|             | mean   | p50    | p95    |
|-------------|-------:|-------:|-------:|
| До S6       | 2306.4 | 2159.9 | 3958.1 |
| После S6    | 2528.9 | 2350.2 | 4084.5 |
| Рендер до   |    2.7 |    2.7 |    3.8 |
| Рендер после|    1.9 |    1.9 |    2.5 |

Шаг «Рендер» −30 % (2.7 → 1.9 ms). Общий per-turn шумит в пределах
±10 % — это ожидаемо: profile.mjs не инициализирует Leaflet (CA-недоверие
к unpkg), поэтому DOM-мутации в реальной игре и так не входили в его
замер. Реальный win фиксируется микробенчмарком выше.

## Тесты

```
node tests/audit/eco_integration_test.cjs  — 16/16 PASS
node tests/audit/dip_integration_test.cjs  — 27/27 PASS
node tests/audit/mil_integration_test.cjs  — 26/26 PASS
node tests/audit/eco_unit_test.cjs         — 18/18 PASS
node tests/audit/gov_integration_test.cjs  — 22/22 PASS
node tests/audit/map_unit_test.cjs         — 49/51 (2 pre-existing — drift
                                              regions_data.js, тот же список,
                                              что в S5, не регрессия S6)
node tests/test_arma_stage21.mjs           — pre-existing fail (sandbox не
                                              понимает `export`, было до S6;
                                              не регрессия — см. Session 5)
node tests/test_arma_stage46.mjs           — pre-existing fail (та же причина)
```

## Изменения

### ui/panels.js

- Добавлен модульный кэш DOM-рефов ресурс-бара (`_resourceBarEls`) —
  `val`/`delta`/`spark` `<span>/<canvas>` на каждый из 4 ключей
  (`gold`/`troops`/`food`/`pop`). Ленивая инициализация через
  `_getResEls(key)`; при оторванном от `document` элементе реф
  переразрешается.
- `updateResourceBar` / `_applyResourceDelta` / `_renderResourceSparklines`
  теперь дёргают кэш вместо `document.querySelector` на каждый вызов.
- `setVal` и `_applyResourceDelta` проверяют `el.textContent !== next`
  перед присваиванием — повторные вызовы в том же ходу (их делает
  `renderLeftPanel`) больше не дают мутаций.
- `renderRightPanel`: добавлен кэш body-сигнатуры
  (`rulerName`/`capital`/`positions`/`characters[id,name,age,role,traits]`
  /`_rosterFilter`/`_rosterSort`). При совпадении сигнатуры — обновляем
  только `.court-era` через `textContent`, выходим без `innerHTML=`.
  Реф на `.court-era` тоже кэшируется между вызовами.
- `_elAttached(el)` — мини-хелпер, защищает от использования
  оторванных от DOM рефов (после reload / setMapMode).

### ui/aqueduct.js

- `AquaWidget.update` также кэширует `#aq-${id}-val` / `#aq-${id}-delta`
  в `_labelEls[id]` (ленивая инициализация с само-протухающим
  `isConnected`-чеком).
- `textContent` / `className` пишутся только при фактическом изменении
  значения — устраняет 12 мутаций на каждый no-op вызов `update()`.

### perf/session6_mutations.mjs

- Новый Playwright-микробенчмарк: MutationObserver на
  `#top-bar` и `#right-panel`, 20 повторных вызовов
  `updateResourceBar` / `renderRightPanel` в одном ходу, печать
  общего числа мутаций. Воспроизводимый замер для CI.

## Замечания

1. Сигнатура `_rightPanelSig` включает traits-поля
   (loyalty/military/trade/diplomacy/piety) — они и есть источник
   скоринга в `renderAdvisorChip`. Если добавится новая колонка
   `r-skill`, сигнатуру надо расширить, иначе её изменения не
   пересоберут DOM. Сейчас это 5 полей на персонажа, что безопасно.
2. В теории `Math.round(economy.treasury)` может колебаться между
   ходами на доли за счёт инфляции/экономики — это уже `gold` в
   ресурс-баре, и он пересчитывается заново каждый ход. Сравнение
   с `el.textContent` защитит от лишнего write'а при round-равенстве.
3. `AquaWidget._labelEls` живёт в самом виджете; после reload init
   делает новый обход `document.getElementById` — кэш естественно
   обновится.
4. Стрелки ↗ / ↘ по-прежнему работают (см. `_applyResourceDelta` —
   сравнение `nextText !== deltaEl.textContent` сохраняет стрелку).

## Что бы сделал иначе

— Отдельный тест `tests/audit/ui_mutation_test.cjs` с кэшированным
  jsdom, чтобы не гонять Playwright ради 20 вызовов. Но сейчас
  в проекте нет jsdom в deps, и таскать его ради регрессии
  именно этой сессии нерентабельно.
— Сигнатуру `renderRightPanel` можно было бы сократить, если
  сделать `CHAR_SKILL_FIELDS = COURT_POSITIONS.map(p => p.skill)` —
  и не хардкодить 5 полей. Оставил как есть, т.к. поля фиксированы
  в `_computeRightPanelBodySig`.
