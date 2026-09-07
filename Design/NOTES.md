# NOTES — Ancient Strategy (igra2) design context
Извлечено из Cavad93/igra2@claude/exciting-fermat-KVLXr. Локальные копии: ui/styles/*.css, ui/icons.js, ui/panels.js, ui/map.js, ui/economy_react.jsx, engine/turn.js, engine/economy.js, engine/market.js, config.js, docs/economic*.md, game_src/index.html.

## Дизайн-токены (ui/styles/base.css :root)
Поверхности: --bg-deep #131110, --bg-panel #1e1b16, --bg-section #262118, --bg-hover #2e2820, --bg-overlay rgba(13,11,9,.82)
Бордюры: --border-main #3d3020, --border-light #5a4830, --border-gold #7a6030
Золото: --gold #c9a961, --gold-dim #8a6e3a, --gold-bright #e8c97a
Бронза: --bronze #8c6e4f, --bronze-dark #5a4535; Пурпур: --purple #4a1942 (+glow rgba(74,25,66,.4))
Текст: --text-primary #ebe0d1, --text-secondary #a89070, --text-dim #6a5840, --text-gold #c9a961
Семантика: --positive #3a6b3a, --negative #8b2020, --warning #7a5020, --sea #0f1a24
Размеры: --panel-w 260px, --header-h 42px, --footer-h 32px; panel-radius 6px
Шрифты: display 'Cinzel'; ui 'Inter'; data 'JetBrains Mono'; lore 'IM Fell English'
Размеры текста: xs10 sm12 base13 md15 lg18 xl24 2xl32; leading 1.2/1.5/1.8
Текстура панелей: greek_vase.jpg (opacity .07) + meander_gold.svg углы 40px (opacity .55)

## Каркас экрана (game_src/index.html)
#app: топ-бар 42px (стела слева: AGATHOKLES·STRATEGOS + греч.месяц·CCCI BC; центр аквидукт-ресурсы: 💰казна ⚔войска 🌾снабжение 👥население с canvas-потоком 60×8 и дельтами; справа: ai-dot, поиск, разведка 🗺, настройки, Rota Historiae — колесо end-turn 44px SVG с 12 метками+спицами+прогресс-дугой) → main: левый диптих TABVLAE (closed 48px торец с застёжкой/open 280px, вкладки Обзор|Армия|Казна|Дипломатия|Законы) + карта (Leaflet, виньетка, сезонный оверлей, легенда наций) + правая панель 260px «Двор Агафокла» (камеи советников 96px, roster, селектор режимов карты 2×2) → низ 32px: вощёная табличка-лог (полоска: точки danger/economy/character + последняя запись IM Fell italic + ▲Хроники; expanded 180px с фильтрами) + строка ввода 580px (счётчик приказов, вощёная дощечка «Iube, Stratege…», печать-кнопка Ⓐ 36px круглая)
Оверлеи: settings-modal (400px, вкладки Клавиши/Интерфейс/О проекте, hotkey-table kbd), region-info (fixed 310px справа, полоса нации 3px, ri-key-stats 3 колонки 18px JetBrains, вкладки Обзор/Строительство/Дипломатия со слайд-индикатором, футер кнопок), siege-panel (320px внизу-справа, красная #8B2020 тема, SVG кольцо 110px, катапульта→крепость анимация, бары Гарнизон/Мораль/Снабжение, Штурм!/Снять осаду), compare-panel 580px ⚖, turn-summary-card 340px, ctx-menu, search-panel 400px, diplo-graph-overlay (SVG граф: война #d93b3b 3px, союз #2fa24a, торговля #3a86ff пунктир, мир #9a9a9a), messenger-гонец со свитком, toast (border-left 3px по типу), event-choice, endgame, gov-overlay, population/economy/treasury/diplomacy overlays, dp-chat-modal, battle-result, peace-offer

## Карта (ui/map.js + map.css)
Tabula Peutingeriana стиль: море #0f1a24 (--sea), Ocean #14202c .55, Strait #16263a .60, Lake #1c3045 .75, Impassible #5a4a32 умбра .55, fog #0a0804 (op .15). Регионы: tabulaRegionColor(nationId hash) — охристая палитра fill + border darken 55%; fillOpacity .85 (selected .92 + #c9a961 2.5px), оккупация: fill=оригинал, dash 6 3 цвет захватчика weight 2.2. Нейтральные — охристый пергамент NEUTRAL_FILL. zoom-tiers: strategic(<4) op 1.0 армии 18px без числа; regional .82; detailed(>6.5) маршруты 4px, mini-иконки построек, гарнизоны. MAP_MODES: political/economy/military/population (лейблы: Политический/Экономический/Военный/Население), кнопки 2×2 mms-btn в правой панели. Тултип региона: rt-name Cinzel 13 gold, rt-nation, rt-pop dim, rt-intel(0/1/2 цвета #7a6a48/#c9a566/#8ec07c). Армии: SVG звезда цвета нации + белый глиф + count 9px; осада: кольцо + пульс border #c62828; торговые маршруты dash-анимация (grain #a5d6a7, metal #b0bec5, luxury #ce93d8, general gold, world #64b5f6); подписи городов Cinzel 9-12px uppercase (capital.player #e6c37a 12px); подписи морей rgba(140,180,210,.45) italic letter-sp .2em; event-feed бабблы 2.6s; ai-indicator 20px кружок цвета нации

## Экономический React-оверлей (ui/economy_react.jsx) — ДРУГАЯ палитра (зелёная!)
_C: bgMain rgba(15,23,15,.96), bgCard rgba(20,30,20,.72), border rgba(212,175,55,.15/.38), gold #d4af37?, green/red/blue/rose/copper, ivory/ivoryDim/ivoryFade. Вкладки: 📊 Биржа | 💰 Доходы | 🧺 Корзина | ⚖ Баланс | 🗺 Рынки (world/province/region субтабы). Метрики-бар: Казна/Доход/Расход/Ср.налог. Биржа: категории Провизия/Промышленность/Роскошь, карточки товаров: иконка 22px, имя+Запас, спарклайн, цена Cinzel 17 gold, тренд ▲▼▸, бейдж «⚠ Дефицит» (deficitPulse анимация) / «Избыток». Корзина: basic #4a9f6a / standard #5b9bd5 / luxury #c87fa0, stacked bar 13px. Доходы: карточки классов 195px+ grid

## processTurn() порядок (engine/turn.js)
0.8 Договоры(processAllTreatyTicks) → 0.85 DiplomacyEngine.processGlobalTick → 0.87 _processEspionageTick → 0.9 processBuildingConstruction → 0.95 calculateProvinceControl → 1 runEconomyTick → 1.02 checkAchievements → 1.05 processLoanPayments(все нации) → 1.1 recordEconomyHistory → 1.5 processAllGovernmentTicks → 1.6 CONSTITUTIONAL_ENGINE.tick → 1.7 CONSPIRACY_ENGINE.tick → 1.8 cultureTick → 1.9 religionTick → 2 processDemography → 2.1 processRecruitment → 2.15 processFortressGarrisons → 2.2 processAgeDemographics → updateHappiness → 2.4 calcRegionLandCapacity → 2.5 recordPopulationHistory → 3 персонажи (aging/deaths/spawn) → 3.5 DIALOGUE_ENGINE → 4 processAINations (Haiku война ≤2 наций / phi4 кэш / OU fallback, tier1-3, round-robin батчи 50) → 5 triggerRandomEvent 10% → 5.4 provinceControlEvents/allianceWars/memory → блокады WarScore → армии processArmyMovement → приказы processAllOrders → commanderAI → 5.6 checkVictoryConditions → 6 advanceDate → 6.5 _recordTurnSummary → 6.9 _auditMoneyConservation → 6.10 _auditMaterialConservation → 6.11 fog processIntelligenceTick → 6.12-15 CB/AE/коалиции/мир/перемирия → 7 saveGame → 8 renderAll

## runEconomyTick() шаги (engine/economy.js:1359)
Кэш-бампы (_calcSlotBaseOutput, regionalProd, recipeCost) → снапшот наций, stub-фильтр (~600/902 без зданий, STUB_POP<10000) →
Ш0 applyPopSatisfiedToBuildings (satisfied→slot._pop_eff) →
Ш0.5 computeWorldMarketQuotas + procureCapitalInputs (амортизация; закупка local→province→national→world; slot._capital_ratio; инфляция getInflationMult) →
Ш0.6 procureSlaves (мировой рынок → латифундии) →
Ш1 ПРОИЗВОДСТВО: 1a processAllRecipes (production_ratio, вычет входов) → 1b calculateProduction (base × _pop_eff × recipe_ratio × _capital_ratio; SUBSISTENCE_FACTOR 0.65 для неорганизованного) → 1c routeProductionToLocalStockpiles (local 3 тика → overflow → nation.stockpile; ×spec-бонус ×cycle ×techDrift) →
Ш1.5 buildProvinceMarket (+15% транспорт, −5% дороги, доступ по effective_control) + updateRegionalMarketPrices (±15-20%) →
Ш2 ПОТРЕБЛЕНИЕ: calculateConsumption (wealth-корзина по стратам) → вычет из stockpile, ГОЛОД при дефиците wheat (FAMINE_MORTALITY, cap 5% населения) → updatePopSatisfied → 2d checkSupplyDeficits →
Ш2.5 processSpoilage (SPOILAGE_RATES: еда портится, инструменты изнашиваются) →
Ш3 updateBuildingFinancials (revenue/costs/profit/loss_streak) + applyBuildingAdaptiveBehavior (сокращение рабочих→пауза→закрытие) →
Ш4 distributeWages (→_wage_bonuses) + updatePopWealth (incomeAdequacy+priceRatio) →
Ш5 РЫНОК: recomputeAllProductionCosts → price_floor=cost×0.5 → updateMarketPrices (ТРЁХЗОННАЯ модель: дефицит/баланс/избыток; engine/market.js; price_history) →
Ш5б distributeClassIncome (nation-owned→treasury; class-owned→class_capital[owner]; аренда→farmers_class; жалование солдат treasury→soldiers_class) →
Ш5в deductFoodPurchases (рабочие покупают пшеницу из class_capital) →
Ш5г processAutonomousBuilding (классы строят из class_capital) + checkClassBankruptcy →
Ш6 processTrade (по нациям; тарифы _getEffectiveTariffRate: война 0.99, договоры ↓; монополия ×1.2) + updateTreasury + applyActiveLaws + _checkEconomicEventTriggers →
runEconomyExtTick (economy_ext.js)

## economy_ext.js (расширения)
1 Торговый баланс calcTradeBalance (gross_exports=trade_profit+imports; port_duties; tariff_income) 2 Монополии detectMonopolies (STRATEGIC_GOODS, 1 производитель → +20% цена, +5 дипломатия) 3 Специализация регионов (streak 10 ходов → +5%, max +25%) 4 Инфляция (казна>3× дохода → +1%/ход, >6× +2%, max 25%; внутр. цены) 5 Циклы (каждые 48-72 хода: boom +15% / recession −18% еда, 6-12 ходов) 6 Армейское недофинансирование (<80% нормы → боевая сила до ×0.85) 7 Tech drift (+2%/120 ходов, max +20%; × эпоха: classic 1.0, late_republic 1.1, early_empire 1.2, crisis_iii 1.1, dominate 1.0) 8 Тултипы эффективности. Debasement: coin_purity 1.0→0.05 (дефицит 3 хода+долг / война+дефицит; налоги×purity; кризис III века: purity<0.3 50 ходов → счастье −30, наёмники дезертируют). Сезоны: SEASONS[12] harvest/demand мультипликаторы
Налоги: TAX_GROUP_CLASSES {aristocrats+officials, clergy, commoners…, soldiers}, база=pop×wealth_level, TAX_CALIBRATION 0.5, tax_rates по группам; mutateTreasury(nation,delta,source) — единая точка мутации казны (_income_adj/_expense_adj); recordMaterialFlow buckets: prod/cons/spoil/trade_in/trade_out/capital/army/event
Казна updateTreasury: доходы налоги×coin_purity + trade_profit + port_duties + tariff + building tax_mult; расходы: армия (INFANTRY/CAVALRY/MERCENARY_UPKEEP × слайдер expense_levels.army), содержание зданий, стабильность 200×(1−stab/100), hoard_penalty
Рынок market.js: цены мировые по 3 зонам от stockpile vs target; world_stockpile квоты на покупателя; транспорт мир.рынка ~+25%

## Иконки (ui/icons.js) — «монетный штамп» 20×20 stroke 1.5 currentColor
gold(монета Ⓐ) troops(орёл-звезда) food(сноп) population(человек у колонны) overview(сетка 2×2) army(щит Λ) economy(монета с S-чертой) diplomacy(оливковая ветвь-амфора) laws(свиток) diplo_graph(граф) search settings end_turn orders court(храм) chronicle(кодекс) warning(треугольник) save ai(робот)

## Прочее UI
Тосты: rgba(20,15,8,.96) border-left 3px (info gold/warning/danger/success), blur 6px, слайд справа. Пульсы экрана: pulse-war/gold/warning/dark (radial edge). Кнопки: bg rgba(107,79,26,.3-.5) + border-gold + hover rgba(212,168,83,.25). Модалки: bg-panel, border 2px border-gold/light, radius 4-8px, shadow 0 8-10px 40px. Скроллбары thin border-gold. Бейджи lnav-badge #e53935. kbd: JetBrains 11px, bg black .5, border-gold. Splash: EU5-стиль левая панель + карточки, орнамент-градиент #8a6f2e→#e2c166, звезда-крест, SYRACVSAE·CCCI BC
Экономический оверлей отступает от базовой системы (зелёный фон) — кандидат на унификацию в редизайне.
