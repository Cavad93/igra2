# Session 21 — `innerHTML=` → DOM API в `ui/government_tab.js`

**Scope:** ui/government_tab.js (4080 строк, 33 вхождения `innerHTML=`).

## Инвентаризация 33 вхождений по группам

| Категория | Что это | Пример | Решение |
|-----------|---------|--------|---------|
| **(в) точечный text/attr — горячий путь** | обновление preview / status / сообщений диалога | `preview.innerHTML = 'Качество: <b>...</b>'` | **Рефакторинг**: DOM API, кэш структуры (head + `<b>` + tail) на элементе → только characterData mutations. |
| **(б) list-render** | заполнение `<select>` опциями | `sel.innerHTML = options.map(...)` | **Рефакторинг**: `DocumentFragment` + `_mkOption()` + `replaceChildren(frag)`. |
| **(а) статический overlay** | рендер целого оверлея один раз на открытие | `overlay.innerHTML = renderActorNegotiationPanel(...)` | **Оставлено как есть** (редкие вызовы — 1 раз на открытие окна). |

## Переписано: 20 / 33 (60%)

| # | Функция / место | Тип | Новый подход |
|---|-----------------|-----|--------------|
| 1 | `dlgSend` — «⏳ thinking» (3345) | в | `status.replaceChildren(_mkSpan('dlg-thinking', ...))` |
| 2 | `dlgSend` — playerDiv (3358) | в | `playerDiv.append(_mkSpan(label), _mkSpan(text))` |
| 3 | `dlgSend` — charDiv (3365) | в | `charDiv.append(_mkSpan(label), _mkSpan(reply))` |
| 4 | `dlgSend` — статус эффектов (3382) | в | `replaceChildren(effectsSpan, textNode, patienceSpan)` |
| 5 | `dlgSend` — ошибка (3389) | в | `replaceChildren(_mkSpan(null, 'Ошибка...', '#f44'))` |
| 6 | `updateOrderQualityPreview` × 2 (3680, 3694) | в | `_updateQualityPreview()` с кэшем `_s21preview` |
| 7 | `updateMpQuality` × 2 (4001, 4011) | в | идентичный `_updateQualityPreview()` |
| 8 | `onSenatorGhostClick` (3032) | в | `card.replaceChildren(spinnerSpan)` |
| 9 | `executeNegotiateAction` — result (2769) | в | `resultEl.replaceChildren(boxEl)` |
| 10 | `addCustomActorRow` (2539) | в | createElement × 4 + append |
| 11 | `updateConstitutionValueOptions` (1456) | б | `DocumentFragment` + `_mkOption(v, label, {selected})` |
| 12 | `onOrderTypeChange` — nation list (3611) | б | `_fillOptions(sel, items, placeholder)` |
| 13 | `onOrderTypeChange` — region list (3617) | б | `_fillOptions(...)` |
| 14 | `onOrderTypeChange` — army list (3632) | б | `_fillOptions(...)` |
| 15 | `onMpTypeChange` — nation list (3937) | б | `_fillOptions(...)` |
| 16 | `onMpTypeChange` — region list (3942) | б | `_fillOptions(...)` |
| 17 | `onMpTypeChange` — army list (3961) | б | `_fillOptions(...)` |
| 18 | `onMpTypeChange` — armyFld template (3955) | в | label + select через createElement |

Оставшиеся 13 `innerHTML=` — категория (а): `renderActorNegotiationPanel` overlay, `buildHallContent` overlay, constitution dialog, senate-law-overlay, showMpOrderForm, renderOrdersPanel cards. Все они вызываются редко (открытие окна / переключение зала) — переписывать без существенной пользы.

## Добавлено в файл

```js
function _mkSpan(className, text, color)          // <span class="x" style="color:y">text</span>
function _mkBold(text, color)                     // <b style="color:x">text</b>
function _mkOption(value, label, { selected, disabled })
function _fillOptions(sel, items, placeholder)    // DocumentFragment + replaceChildren
function _ensurePreviewStructure(el)              // кэш { head, bold, tail } на el._s21preview
function _updateQualityPreview(el, head, quality, color, tail)
```

Ключевая техника: для `updateMpQuality` / `updateOrderQualityPreview` структура (`TextNode` + `<b>` + `TextNode`) создаётся **один раз** и сохраняется на `el._s21preview`. Повторные вызовы меняют только `data` / `textContent` / `style.color` — characterData + attribute мутации вместо полного teardown+rebuild.

## Измерения

Harness: `perf/session21_mutations.mjs` — 30 итераций × 4 сценария, MutationObserver (childList + characterData + attributes).

```
fillOptions (sel, 31 опция)              legacy: 1829mut   8.80ms   →   new: 1829mut  10.50ms   (mut 0.0%, time +19.3%)
updatePreview (preview, b+текст)         legacy:  177mut   0.60ms   →   new:   65mut   0.60ms   (mut −63.3%, time 0.0%)
status thinking (одиночный span)         legacy:   59mut   0.30ms   →   new:   59mut   0.20ms   (mut 0.0%, time −33.3%)
dlg msg (2 реплики × label+text)         legacy:   60mut   0.70ms   →   new:   60mut   0.60ms   (mut 0.0%, time −14.3%)

TOTAL:
  mutations:  legacy=2125  new=2013   (−5.3%, ratio 1.06× fewer)
  wall time:  legacy=10.40ms  new=11.90ms   (+14.4%, ratio 0.87×)
```

**Ключевая метрика — preview: −63.3% mutations.** Это точечный text/attr update вместо childList teardown → меньше нагрузка на стилизатор и layout invalidation. Каждое нажатие select в order-form вызывает `updateMpQuality()` — на горячем пути.

`fillOptions` в синтетическом бенче (30× подряд на одном select) чуть медленнее из-за накладных `createElement × N`. В реальности опции перезаполняются редко (только при смене типа приказа) — разница незаметна, но мы получаем XSS-безопасность через `textContent`.

## Тесты

- `tests/audit/gov_unit_test.cjs` — **31/31 PASS**.
- `tests/audit/gov_integration_test.cjs` — **22/22 PASS**.
- `tests/perf/turn_budget_test.cjs` — **20/20 PASS**, все метрики Session 1–14 в пределах бюджета.

## Notes

- Остались 13 `innerHTML=` — все в категории (а): большие статические шаблоны, вызываются 1 раз на открытие окна. Переписывание не окупит работы.
- `_escHtml()` больше не нужен в переписанных местах — `textContent` экранирует автоматически.
- Для будущих сессий: кэш `_s21preview` — хороший паттерн для любого preview/status элемента с фиксированной структурой.
