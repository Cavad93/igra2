# Этап 11 economic4.md — закрытие пробелов экономики

После Этапа 10 (money_leak fix) экономика работает на 93/100. Остались
точечные слабые стороны, которые проявятся на длинных прогонах (500+ ходов)
и при попытке исторической точности III-го века.

## 11.1 — Material balance audit (2ч)

**Что:** аудит товарного баланса по аналогии с `_auditMoneyConservation()`.

**Проверка каждый ход для каждой нации:**
```
expected_stockpile[good] = prev_stockpile[good]
                         + production_adj[good]
                         + import_adj[good]
                         − consumption_adj[good]
                         − export_adj[good]
                         − spoilage_adj[good]
```

Drift > 0.5% от stockpile → запись в `_material_audit[]` (ring 200).

**Файлы:**
- [engine/economy.js](engine/economy.js) — функции `recordProduction`, `recordConsumption`, `recordTrade`, `recordSpoilage` пишут в `economy._{prod|cons|trade|spoilage}_adj[good]`.
- [engine/turn.js](engine/turn.js) — новая `_auditMaterialConservation()`, вызывается после `_auditMoneyConservation()`.
- [tests/eco_stress_analyze.cjs](tests/eco_stress_analyze.cjs) — детектор `detectMaterialLeak`, топ-5 drift товаров.

**Критерий успеха:** ≤10 drift-событий на 100-ходовом прогоне, нулевой drift на wheat/iron/cloth.

## 11.2 — Seasonal effects (2ч)

**Что:** сезонность урожая и потребления.

**Месячные мультипликаторы в config.js:**
```
CONFIG.SEASONS = [
  { month: 1,  harvest_mult: { wheat: 0.0, barley: 0.0, olives: 0.0, fish: 1.0 },
               demand_mult:  { wheat: 1.3, wine: 1.1, fish: 1.5 } },  // зима
  ...
  { month: 9,  harvest_mult: { wheat: 3.0, barley: 2.5, olives: 0.5 }, ... },  // сбор
  { month: 10, harvest_mult: { wheat: 2.5, olives: 3.0 }, ... },              // оливки
  ...
]
```

**Аграрные товары:** wheat, barley, olives, grapes, fish, honey (пчеловодство).

**Файлы:**
- [config.js](config.js) — константа `SEASONS` + флаг `SEASONS_ENABLED`.
- [engine/economy.js:calculateProduction](engine/economy.js) — `base_rate × harvest_mult[good][month]`.
- [engine/market.js](engine/market.js) — demand × `demand_mult[good][month]`.

**Критерий успеха:** CV цены wheat > 30% (сейчас ~19%). Годовой объём производства wheat не падает больше чем на 5%.

## 11.3 — Debasement (4ч)

**Что:** снижение содержания металла в монете → инфляция.

**Новое поле:** `nation.economy.coin_purity` (default 1.0 = 100% серебра).

**Механика:**
1. Производство налогов → `tax_income × coin_purity` (реальный вес серебра).
2. Рынок: effective_price = base_price × (1 + (1 − avg_world_purity) × DEBASEMENT_PRICE_MULT).
3. Триггеры снижения purity:
   - `treasury < -3×income` 3 хода подряд **и** `_debt_total > 10×income` → −0.05 раз в 12 ходов.
   - Война + treasury < 0 → то же, но раз в 6 ходов.
4. Восстановление: +0.01/ход при `stability > 70` **и** `treasury > 5×income`.
5. События:
   - `COIN_DEVALUATION` — уведомление при падении < 0.7 / 0.5 / 0.3.
   - `CURRENCY_COLLAPSE` — если purity < 0.3 более 50 ходов подряд → happiness −30, все mercenaries дезертируют.

**Файлы:**
- [engine/economy_ext.js](engine/economy_ext.js) — новая `_tickDebasement(nation)`, `getAvgWorldPurity()`.
- [engine/economy.js:updateTreasury](engine/economy.js) — `taxIncomeTotal *= coin_purity`.
- [engine/market.js](engine/market.js) — ценовой множитель от debasement.
- [engine/events.js](engine/events.js) — 2 новых события.

**Критерий успеха:** на 500-ходовом прогоне ≥3 нации под давлением войн достигают purity < 0.7. Мирные нации удерживают purity > 0.9.

## 11.4 — Inter-nation credit (3ч)

**Что:** одна нация даёт заём другой (не только граждане).

**Расширение:** поле `loan.lender_nation_id?: string` в [engine/loans.js](engine/loans.js).

**Новая функция:**
```
offerLoanBetweenNations(lenderId, borrowerId, amount, rate, term)
```

**Изменения:**
- `processLoanPayments`: если `lender_nation_id` задан — платёж идёт в казну заимодавца через `mutateTreasury(lender, +payment, 'loan_interest_received')`.
- Дипломатия: выдача займа +10 отношений, просрочка −20 отношений + war_score +15.
- AI ([engine/ai_fallback.js](engine/ai_fallback.js)): если у союзника treasury < 0 и у нас > 5000 → 1-2% вероятность предложить заём под 8%.

**Критерий успеха:** на 100 ходах 5-15 международных займов активны. Money conservation не ломается.

## Верификация

После каждого этапа: `npm run eco:report:browser -- --turns=100 --seed=1`.

Финальный прогон: 500 ходов в Playwright. Требования:
- 0 жёстких нарушений
- 0 money drift-событий (сохранить достижение Этапа 10)
- ≤10 material drift-событий (новый критерий)
- Patterns count ≤ 80

## Очередность

11.1 → 11.2 → 11.3 → 11.4. Можно параллельно, но последовательно — проще проверка.
