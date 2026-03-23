// Стартовые данные всех наций — 301 год до н.э.
// Единственный источник правды — GAME_STATE

const INITIAL_GAME_STATE = {
  date: { year: -301, month: 1 },
  player_nation: 'syracuse',
  turn: 1,
  events_log: [],

  nations: {

    // ─────────────────────────────────────────────
    // СИРАКУЗЫ — правит игрок
    // ─────────────────────────────────────────────
    syracuse: {
      name: 'Сиракузы',
      adjective: 'сиракузское',
      color: '#D4B483',
      flag_emoji: '⚔️',
      is_player: true,

      government: {
        type: 'tyranny',
        custom_name: null,
        legitimacy: 72,        // бывший гончар — знать его не любит
        stability: 58,
        ruler: {
          type: 'person',
          name: 'Агафокл',
          character_ids: [],
          personal_power: 88,
        },
        institutions: [
          {
            id: 'INST_strategos',
            name: 'Совет стратегов',
            type: 'advisory',
            size: 7,
            character_ids: ['CHAR_0001','CHAR_0002','CHAR_0003','CHAR_0004','CHAR_0005'],
            decision_method: 'single_person',
            quorum: 100,
            powers: ['advise_on_war', 'advise_on_economy', 'command_armies'],
            limitations: ['cannot_override_tyrant'],
            factions: [],
          },
          {
            id: 'INST_guard',
            name: 'Личная гвардия',
            type: 'military',
            size: 500,
            character_ids: [],
            decision_method: 'single_person',
            quorum: 100,
            powers: ['protect_tyrant', 'enforce_orders'],
            limitations: ['palace_duty_only'],
            factions: [],
          },
        ],
        power_resource: {
          type: 'fear',
          current: 70,
          decay_per_turn: 2,
          restored_by: ['executions', 'military_victories', 'show_of_force'],
        },
        elections: {
          enabled: true,
          frequency_turns: 48,      // раз в 4 года (4 × 12 ходов)
          next_election: 48,
          eligible_voters: 'senate',
          offices: ['consul'],
          last_consul: 'Агафокл',
        },
        succession: null,
        conspiracies: {
          base_chance_per_turn: 0.15,
          modified_by: ['fear_level', 'treasury_health', 'recent_defeats'],
          secret_police: { enabled: false, cost_per_turn: 200, conspiracy_detection_bonus: 0.4 },
        },
        transition_history: [
          { turn: 0, from: 'oligarchy', to: 'tyranny', cause: 'Агафокл захватил власть в 317 г. до н.э.' },
        ],
        custom_mechanics: [],
        active_transition: null,
      },

      regions: ['r55', 'r102', 'r245', 'r246', 'r247', 'r248', 'r763', 'r2403', 'r2406', 'r2407', 'r2408', 'r2419'],

      population: {
        total: 434000,
        by_profession: {
          farmers:    121000,
          craftsmen:   70000,
          merchants:   30000,
          sailors:     36000,
          clergy:      33000,
          soldiers:    28000,
          slaves:     116000,
        },
        happiness: 62,
        growth_rate: 0.002,
      },

      economy: {
        treasury: 8500,
        income_per_turn: 0,    // считается движком каждый ход
        expense_per_turn: 0,
        tax_rate: 0.12,

        // Налоговые ставки по слоям общества (только для игрока)
        // AI-нации используют единый tax_rate выше
        tax_rates_by_class: {
          aristocrats: 0.15,   // аристократы + чиновники
          clergy:      0.08,   // жречество
          commoners:   0.10,   // граждане + ремесленники + земледельцы + моряки
          soldiers:    0.05,   // солдаты + вольноотпущенники
        },

        // Кэш разбивки для UI (пересчитывается движком каждый ход)
        _income_breakdown: {},
        _expense_breakdown: {},

        // рыночные запасы нации (в амфорах/бушелях)
        stockpile: {
          // Зерно (запас ~6 мес при текущем производстве)
          wheat:      25000,
          barley:      6000,
          // Рыба
          fish:        4500,
          // Масло (дефицит — нет маслобоен, нужно строить)
          olives:      3200,
          olive_oil:   3000,
          honey:        500,
          // Напитки (дефицит ~300/мес — запас ~13 мес)
          wine:        4000,
          // Консерванты
          salt:        1500,
          // Металлы
          iron:        2000,
          bronze:       600,
          // Дерево
          timber:      3500,
          // Текстиль (шерсть и кожа в дефиците — увеличен запас)
          wool:        5000,
          cloth:       2500,
          leather:     1500,
          // Инструменты
          tools:       1500,
          pottery:     2500,
          // Письменность
          papyrus:     1000,
          wax:          400,
          // Роскошь
          incense:      150,
          purple_dye:    20,
          // Скот
          horses:       300,
          cattle:       600,
        },

        trade_routes: [],
      },

      military: {
        infantry:     2200,
        cavalry:       320,
        ships:          48,
        mercenaries:     0,
        morale:         72,
        loyalty:        78,   // армия ещё верна тирану
        at_war_with:  [],
      },

      relations: {
        rome:         { score:  12, treaties: [],          at_war: false },
        carthage:     { score: -38, treaties: [],          at_war: false },
        egypt:        { score:  28, treaties: ['trade'],   at_war: false },
        macedon:      { score:   5, treaties: [],          at_war: false },
        epirus:       { score:  15, treaties: [],          at_war: false },
        greek_states: { score:  40, treaties: ['alliance'],at_war: false },
        pergamon:     { score:  10, treaties: [],          at_war: false },
        numidia:      { score: -10, treaties: [],          at_war: false },
      },

      active_laws: [],
      buildings: ['port', 'market', 'temple', 'barracks', 'shipyard'],
      characters: [],   // заполняется при генерации

      // ── Конфигурация Сената (Lazy Materialization) ──
      // 90 мест; сенаторы хранятся в SenateManager, не здесь.
      // senate_config только описывает структуру фракций.
      // Активируется при переходе к демократии/республике,
      // но данные инициализируются сразу — нулевая цена.
      senate_config: {
        total_seats: 100,
        factions: [
          { id: 'aristocrats', name: 'Аристократы',    seats: 33, color: '#9C27B0',
            wants: ['land_reform', 'noble_privilege', 'tradition'],
            fears: ['democracy', 'debt_cancellation', 'populism'],
            preferred_law_types: ['reform', 'taxes'] },
          { id: 'demos',       name: 'Народная партия', seats: 28, color: '#4CAF50',
            wants: ['cheap_grain', 'public_works', 'debt_relief'],
            fears: ['war', 'oligarchy', 'taxation'],
            preferred_law_types: ['build', 'trade'] },
          { id: 'military',    name: 'Военная фракция', seats: 24, color: '#f44336',
            wants: ['war_funding', 'veteran_land', 'military_glory'],
            fears: ['peace_treaty', 'budget_cuts', 'demobilization'],
            preferred_law_types: ['war', 'build'] },
          { id: 'merchants',   name: 'Торговцы',        seats: 15, color: '#FF9800',
            wants: ['free_trade', 'port_expansion', 'low_tariffs'],
            fears: ['war', 'grain_tax', 'piracy'],
            preferred_law_types: ['trade', 'diplomacy'] },
        ],
        // 6 кланов — поперечны фракциям, связывают политику и кровь
        clans: [
          { id: 'clan_agathocles', name: 'Клан Агафокла',       color: '#8B0000' },
          { id: 'clan_gastron',    name: 'Дом Гастрона',         color: '#4A90D9' },
          { id: 'clan_kephalos',   name: 'Род Кефала',           color: '#7B68EE' },
          { id: 'clan_philistos',  name: 'Семья Филиста',        color: '#2E8B57' },
          { id: 'clan_old_blood',  name: 'Старая Кровь',         color: '#B8860B' },
          { id: 'clan_phoenician', name: 'Финикийские Торговцы', color: '#FF6347' },
        ],
        // ── Конституционные мета-правила (StateArchitecture) ──────────
        // Изменяются только через ConstitutionalEngine.process_constitutional_law()
        state_architecture: {
          senate_capacity: 100,          // 90–600 мест
          election_cycle:  4,            // лет между выборами
          consul_term:     2,            // лет срока Консула
          consul_powers:   'Standard',   // 'Limited' | 'Standard' | 'Dictatorial'
          voting_system:   'Meritocracy',// 'Plutocracy' | 'Meritocracy' | 'Democracy'
          veto_rights:     false,        // Народный Трибун с правом блокировки
        },
      },
    },

    // ─────────────────────────────────────────────
    // РИМ
    // ─────────────────────────────────────────────
    rome: {
      name: 'Рим',
      adjective: 'римское',
      color: '#B85C5C',
      flag_emoji: '🦅',
      is_player: false,

      government: {
        type: 'republic',
        custom_name: null,
        legitimacy: 88,
        stability: 80,
        ruler: {
          type: 'council',
          name: 'Сенат и Народ Рима',
          character_ids: [],
          personal_power: 20,
        },
        institutions: [
          {
            id: 'INST_senate',
            name: 'Сенат',
            type: 'legislative',
            size: 300,
            character_ids: ['ROME_SEN_001','ROME_SEN_002','ROME_SEN_003','ROME_SEN_004','ROME_SEN_005','ROME_SEN_006','ROME_SEN_007','ROME_SEN_008','ROME_SEN_009'],
            decision_method: 'majority_vote',
            quorum: 51,
            powers: ['pass_laws', 'approve_budget', 'declare_war', 'appoint_magistrates'],
            limitations: ['cannot_change_constitution_alone', 'cannot_conscript_without_census'],
            factions: [
              { name: 'Оптиматы',   seats: 180, wants: ['noble_privilege', 'tradition'],    fears: ['land_reform', 'populism'],   leader_id: 'ROME_SEN_001' },
              { name: 'Популяры',   seats:  80, wants: ['land_reform', 'cheap_grain'],      fears: ['oligarchy', 'conscription'], leader_id: 'ROME_SEN_004' },
              { name: 'Новые люди', seats:  40, wants: ['merit_promotion', 'trade'],        fears: ['closed_citizenship'],        leader_id: 'ROME_SEN_007' },
            ],
          },
          {
            id: 'INST_consuls',
            name: 'Консулы',
            type: 'executive',
            size: 2,
            character_ids: [],
            decision_method: 'majority_vote',
            quorum: 100,
            powers: ['command_army', 'enforce_laws', 'veto_each_other'],
            limitations: ['annual_term', 'cannot_act_without_senate_budget'],
            factions: [],
          },
        ],
        power_resource: {
          type: 'legitimacy',
          current: 88,
          decay_per_turn: 0.5,
          restored_by: ['victories', 'good_harvests', 'popular_laws'],
        },
        elections: {
          enabled: true,
          frequency_turns: 12,
          next_election: 8,
          eligible_voters: 'male_citizens',
          offices: ['consul', 'praetor', 'quaestor'],
        },
        succession: null,
        conspiracies: null,
        transition_history: [
          { turn: 0, from: 'monarchy', to: 'republic', cause: 'Изгнание царей Тарквиниев, 509 г. до н.э.' },
        ],
        custom_mechanics: [],
        active_transition: null,
      },

      regions: ['r62', 'r96', 'r99', 'r101', 'r112', 'r113', 'r116', 'r119', 'r201', 'r210', 'r211', 'r214', 'r215', 'r216', 'r217', 'r218', 'r219', 'r220', 'r221', 'r222', 'r223', 'r225', 'r228', 'r229', 'r230', 'r280', 'r342', 'r349', 'r664', 'r665', 'r666', 'r667', 'r668', 'r669', 'r670', 'r671', 'r672', 'r673', 'r674', 'r675', 'r676', 'r677', 'r678', 'r679', 'r680', 'r811', 'r812', 'r813', 'r815', 'r816', 'r817', 'r818', 'r819', 'r820', 'r821', 'r822', 'r823', 'r826', 'r828', 'r2460', 'r2461', 'r2462', 'r2463', 'r2464', 'r2465', 'r2466', 'r2467', 'r2468', 'r2470', 'r2471', 'r2472', 'r2473', 'r2474', 'r2475', 'r2476', 'r2477', 'r2478', 'r2479', 'r2480', 'r2481', 'r2482', 'r2505', 'r2506', 'r2507', 'r2508', 'r2509', 'r2510', 'r2511', 'r2512', 'r2513', 'r2514', 'r2515', 'r2516', 'r2517', 'r2518', 'r2519', 'r2520', 'r2521', 'r2522', 'r2523', 'r2524', 'r2525', 'r2526', 'r2527', 'r2528', 'r2529', 'r2530', 'r2531', 'r2532', 'r2533', 'r2534', 'r2535', 'r2536', 'r2537', 'r2538', 'r2539', 'r2540', 'r2541', 'r2542', 'r2543', 'r2544', 'r2545', 'r2546', 'r2547', 'r2548', 'r2549', 'r2550', 'r2551', 'r2552', 'r2553', 'r2554', 'r2555', 'r2556', 'r2557', 'r2559', 'r2560', 'r2561', 'r2562', 'r2563', 'r2564', 'r2565', 'r2568', 'r2569', 'r2570', 'r2571', 'r2572', 'r2573', 'r2574', 'r2575', 'r2576', 'r2577', 'r2578', 'r2579', 'r2580', 'r2581', 'r2582', 'r2583', 'r2584', 'r2585', 'r2586', 'r2587', 'r2588', 'r2589', 'r2590', 'r2591', 'r2592', 'r2593', 'r2594', 'r2595', 'r2596', 'r2597', 'r2598', 'r2599', 'r2600', 'r2601', 'r2602', 'r2603', 'r2604', 'r2605', 'r2606', 'r2607', 'r2608', 'r2609', 'r2610', 'r2611', 'r2614', 'r2616', 'r2617', 'r2618', 'r2619', 'r2620', 'r2621', 'r2622', 'r2623', 'r2624', 'r2625', 'r2626', 'r2627', 'r2628', 'r2629', 'r2630', 'r2631', 'r2632', 'r2633', 'r2634', 'r2635', 'r2636', 'r2637', 'r2638', 'r2639', 'r2640', 'r2641', 'r2642', 'r2643', 'r2644', 'r2645', 'r2646', 'r2647', 'r2648', 'r2649', 'r2650', 'r2651', 'r2652', 'r2653', 'r2654', 'r2655', 'r2656', 'r2657', 'r2658', 'r2659', 'r2660', 'r2661', 'r2662', 'r2663', 'r2664', 'r2665', 'r2666', 'r2667', 'r2668', 'r2669', 'r2670', 'r2671', 'r2672', 'r2673', 'r2674', 'r2675', 'r2676', 'r2677', 'r2678', 'r2679', 'r2680', 'r2684', 'r2685', 'r2686', 'r2687', 'r2688', 'r2689', 'r2690', 'r2691', 'r2692', 'r2693', 'r2694', 'r2695', 'r2696', 'r2697', 'r2698', 'r2699', 'r2700', 'r2701', 'r2702', 'r2707', 'r2708', 'r2709', 'r2710', 'r2711', 'r2712', 'r2713', 'r2714', 'r2715', 'r2716', 'r2717', 'r2718', 'r2720', 'r2721', 'r2722', 'r2723', 'r2724', 'r2725', 'r2726', 'r2727', 'r2728', 'r2729', 'r2730', 'r2731', 'r2732', 'r2733', 'r2734', 'r2735', 'r2736', 'r2737', 'r2738', 'r2739', 'r2740', 'r2741', 'r2742', 'r2743', 'r2744', 'r2745', 'r2746', 'r2747', 'r2748', 'r2749', 'r2750', 'r2751', 'r2752', 'r2753', 'r2754', 'r2755', 'r2756', 'r2757', 'r2758', 'r2759', 'r2760', 'r2761', 'r2762', 'r2763', 'r2764', 'r2765', 'r2766', 'r2767', 'r2768', 'r2769', 'r2770', 'r2771', 'r2772', 'r2773', 'r2774', 'r2775', 'r2776', 'r2777', 'r2778', 'r2779', 'r2780', 'r2781', 'r2782', 'r2783', 'r2784', 'r2785', 'r2786', 'r2787', 'r2788', 'r2789', 'r2790', 'r2791', 'r2792', 'r2793', 'r2794', 'r2795', 'r2796', 'r2797', 'r2798', 'r2799', 'r2800', 'r2801', 'r2802', 'r2803', 'r2804', 'r2805', 'r2806', 'r2807', 'r2808', 'r2809', 'r2810', 'r2811', 'r2812', 'r2813', 'r2814', 'r2815', 'r2816', 'r2817', 'r2818', 'r2819', 'r2820', 'r2821', 'r2822', 'r2823', 'r2824', 'r2825', 'r2826', 'r2827', 'r2828', 'r2829', 'r2830', 'r2831', 'r2832', 'r2833', 'r2834', 'r2835', 'r2838', 'r2839', 'r2840', 'r2841', 'r2842', 'r2843', 'r2844', 'r2846', 'r2847', 'r2919'],

      population: {
        total: 210000,
        by_profession: {
          farmers:    115000,
          craftsmen:   28000,
          merchants:   18000,
          sailors:      8000,
          clergy:       8000,
          soldiers:    18000,
          slaves:      15000,
        },
        happiness: 70,
        growth_rate: 0.003,
      },

      economy: {
        treasury: 24000,
        income_per_turn: 0,
        expense_per_turn: 0,
        tax_rate: 0.10,
        tax_rates_by_class: { aristocrats: 0.12, clergy: 0.07, commoners: 0.09, soldiers: 0.04 },
        _income_breakdown: {},
        _expense_breakdown: {},

        stockpile: {
          wheat:     85000,
          barley:    18000,
          fish:       8000,
          olives:     4000,
          olive_oil:  1500,
          wine:       5000,
          salt:       4000,
          iron:       8000,
          bronze:     1200,
          timber:    12000,
          wool:       2000,
          cloth:      6000,
          leather:    2000,
          tools:      1500,
          pottery:    2000,
          papyrus:     400,
          wax:         300,
          honey:       300,
          incense:     100,
          purple_dye:   20,
          // Скот
          horses:      400,
          cattle:      800,
        },

        trade_routes: ['carthage', 'greek_states'],
      },

      military: {
        infantry:    18000,
        cavalry:      1800,
        ships:          60,
        mercenaries:     0,
        morale:         82,
        loyalty:        90,
        at_war_with:  [],
      },

      relations: {
        syracuse:     { score:  12, treaties: [],           at_war: false },
        carthage:     { score: -15, treaties: [],           at_war: false },
        egypt:        { score:  20, treaties: ['trade'],    at_war: false },
        macedon:      { score:  -5, treaties: [],           at_war: false },
        epirus:       { score: -20, treaties: [],           at_war: false },
        greek_states: { score:  15, treaties: [],           at_war: false },
        pergamon:     { score:  25, treaties: ['trade'],    at_war: false },
        numidia:      { score:   5, treaties: [],           at_war: false },
      },

      active_laws: [
        {
          id: 'LAW_ROME_001',
          name: 'Lex Militaris',
          type: 'military',
          effects_per_turn: { 'military.infantry': 50 },
        },
      ],
      buildings: ['barracks', 'walls', 'market', 'forum', 'road'],
      characters: [],

      // AI стратегия
      ai_personality: 'expansionist',
      ai_priority: 'military',
    },

    // ─────────────────────────────────────────────
    // КАРФАГЕН
    // ─────────────────────────────────────────────
    carthage: {
      name: 'Карфаген',
      adjective: 'карфагенское',
      color: '#C4A882',
      flag_emoji: '🐘',
      is_player: false,

      government: {
        type: 'oligarchy',
        custom_name: 'Совет Ста',
        legitimacy: 82,
        stability: 75,
        ruler: {
          type: 'council',
          name: 'Совет Ста',
          character_ids: [],
          personal_power: 15,
        },
        institutions: [
          {
            id: 'INST_council_hundred',
            name: 'Совет Ста',
            type: 'legislative',
            size: 104,
            character_ids: ['CARTH_OLI_001','CARTH_OLI_002','CARTH_OLI_003','CARTH_OLI_004','CARTH_OLI_005','CARTH_OLI_006'],
            decision_method: 'weighted_by_wealth',
            quorum: 51,
            powers: ['pass_laws', 'declare_war', 'approve_contracts', 'appoint_suffetes'],
            limitations: ['cannot_act_against_merchant_clans'],
            factions: [
              { name: 'Клан Баркидов',        seats: 28, wants: ['military_expansion', 'sicily'],  fears: ['rome', 'greek_alliance'],   leader_id: null },
              { name: 'Торговый совет',        seats: 42, wants: ['free_trade', 'peace', 'profits'],fears: ['war', 'port_taxes'],        leader_id: null },
              { name: 'Жреческая коллегия',    seats: 24, wants: ['temple_funds', 'divine_favor'],  fears: ['reform', 'democracy'],      leader_id: null },
              { name: 'Земельная аристократия',seats: 10, wants: ['land_rights', 'slave_labor'],    fears: ['land_reform'],              leader_id: null },
            ],
          },
          {
            id: 'INST_suffetes',
            name: 'Суффеты',
            type: 'executive',
            size: 2,
            character_ids: [],
            decision_method: 'unanimous',
            quorum: 100,
            powers: ['execute_laws', 'command_navy', 'negotiate_treaties'],
            limitations: ['cannot_declare_war_alone', 'annual_term'],
            factions: [],
          },
        ],
        power_resource: {
          type: 'wealth',
          current: 82,
          decay_per_turn: 0.3,
          restored_by: ['trade_profits', 'tribute', 'conquest'],
        },
        elections: null,
        succession: null,
        conspiracies: null,
        clans: [
          { name: 'Клан Баркидов',   wealth: 18000, seats_in_council: 28, controls: ['military_contracts', 'sardinia_trade'], leader_id: null },
          { name: 'Клан Ганнонидов', wealth: 24000, seats_in_council: 35, controls: ['african_grain', 'port_carthage'],       leader_id: null },
        ],
        citizenship: { closed: true, new_entry_requires: 'unanimous_council_vote', commoner_resentment_per_turn: 1 },
        transition_history: [
          { turn: 0, from: null, to: 'oligarchy', cause: 'Основание Карфагена финикийскими купцами' },
        ],
        custom_mechanics: [],
        active_transition: null,
      },

      regions: ['carthage', 'elymia', 'panormus', 'selinous'],

      population: {
        total: 470000,
        by_profession: {
          farmers:    218000,
          craftsmen:   63000,
          merchants:   59000,
          sailors:     42000,
          clergy:      17000,
          soldiers:    32000,
          slaves:      39000,
        },
        happiness: 68,
        growth_rate: 0.002,
      },

      economy: {
        treasury: 62000,
        income_per_turn: 0,
        expense_per_turn: 0,
        tax_rate: 0.14,
        tax_rates_by_class: { aristocrats: 0.18, clergy: 0.10, commoners: 0.12, soldiers: 0.06 },
        _income_breakdown: {},
        _expense_breakdown: {},

        stockpile: {
          wheat:     120000,
          barley:     25000,
          fish:       15000,
          olives:      6000,
          olive_oil:   2500,
          honey:        400,
          wine:       10000,
          salt:        8000,
          iron:       12000,
          bronze:      2000,
          timber:     18000,
          wool:        3000,
          cloth:      14000,
          leather:     3500,
          tools:       2000,
          pottery:     3000,
          papyrus:      600,
          wax:          400,
          incense:      200,
          purple_dye:    60,
          // Скот
          horses:       500,
          cattle:       600,
        },

        trade_routes: ['egypt', 'greek_states', 'rome'],
      },

      military: {
        infantry:    22000,
        cavalry:      4500,
        ships:         220,
        mercenaries:  8000,
        morale:        75,
        loyalty:       65,   // наёмная армия — лояльность средняя
        at_war_with: [],
      },

      relations: {
        syracuse:     { score: -38, treaties: [],          at_war: false },
        rome:         { score: -15, treaties: [],          at_war: false },
        egypt:        { score:  22, treaties: ['trade'],   at_war: false },
        macedon:      { score:  10, treaties: [],          at_war: false },
        epirus:       { score:  -5, treaties: [],          at_war: false },
        greek_states: { score: -20, treaties: [],          at_war: false },
        pergamon:     { score:   5, treaties: [],          at_war: false },
        numidia:      { score:  40, treaties: ['vassal'],  at_war: false },
      },

      active_laws: [],
      buildings: ['port', 'shipyard', 'market', 'latifundium', 'walls'],
      characters: [],
      ai_personality: 'merchant',
      ai_priority: 'trade',
    },

    // ─────────────────────────────────────────────
    // ЕГИПЕТ — Птолемей I
    // ─────────────────────────────────────────────
    egypt: {
      name: 'Египет',
      adjective: 'египетское',
      color: '#C8B870',
      flag_emoji: '𓂀',
      is_player: false,

      government: {
        type: 'monarchy',
        custom_name: 'Царство Птолемеев',
        legitimacy: 90,
        stability: 75,
        ruler: { type: 'person', name: 'Птолемей I Сотер', character_ids: [], personal_power: 85 },
        institutions: [
          {
            id: 'INST_royal_court_eg',
            name: 'Царский двор',
            type: 'advisory',
            size: 20,
            character_ids: ['EGY_CRT_001','EGY_CRT_002','EGY_CRT_003','EGY_CRT_004','EGY_CRT_005'],
            decision_method: 'single_person',
            quorum: 100,
            powers: ['advise_king', 'manage_provinces', 'command_armies'],
            limitations: ['cannot_override_pharaoh'],
            factions: [],
          },
        ],
        power_resource: { type: 'legitimacy', current: 90, decay_per_turn: 0.5, restored_by: ['victories', 'temple_building', 'good_harvests'] },
        elections: null,
        succession: { tracked: true, heir: null, crisis_if_no_heir: true, claim_types: ['blood', 'marriage'] },
        conspiracies: null,
        transition_history: [{ turn: 0, from: null, to: 'monarchy', cause: 'Птолемей I провозгласил себя царём в 305 г. до н.э.' }],
        custom_mechanics: [],
        active_transition: null,
      },

      regions: ['alexandria', 'cyrenaica'],

      population: {
        total: 4800000,   // Египет — самая населённая страна
        by_profession: {
          farmers:    3200000,
          craftsmen:   480000,
          merchants:   280000,
          sailors:      80000,
          clergy:      180000,
          soldiers:     60000,
          slaves:      520000,
        },
        happiness: 58,   // тяжёлые налоги фараона
        growth_rate: 0.001,
      },

      economy: {
        treasury: 180000,
        income_per_turn: 0,
        expense_per_turn: 0,
        tax_rate: 0.18,   // тяжёлое налогообложение
        tax_rates_by_class: { aristocrats: 0.22, clergy: 0.12, commoners: 0.16, soldiers: 0.08 },
        _income_breakdown: {},
        _expense_breakdown: {},

        stockpile: {
          wheat:     800000,
          barley:    200000,
          fish:       25000,
          olives:     15000,
          olive_oil:  10000,
          honey:       2000,
          wine:       18000,
          salt:       12000,
          iron:       15000,
          bronze:      3000,
          timber:     20000,
          wool:        8000,
          cloth:      30000,
          leather:     5000,
          tools:       3000,
          pottery:     8000,
          papyrus:     5000,   // Египет — крупнейший производитель папируса
          wax:         1000,
          incense:      500,
          purple_dye:   100,
          // Скот: Египет — речная долина, преобладают волы для ирригации
          horses:       250,
          cattle:      1500,
        },

        trade_routes: ['carthage', 'pergamon', 'syracuse'],
      },

      military: {
        infantry:    60000,
        cavalry:      8000,
        ships:         300,
        mercenaries: 15000,
        morale:        70,
        loyalty:       75,
        at_war_with: [],
      },

      relations: {
        syracuse:     { score:  28, treaties: ['trade'],   at_war: false },
        rome:         { score:  20, treaties: ['trade'],   at_war: false },
        carthage:     { score:  22, treaties: ['trade'],   at_war: false },
        macedon:      { score: -25, treaties: [],          at_war: false },
        epirus:       { score:   5, treaties: [],          at_war: false },
        greek_states: { score:  35, treaties: ['trade'],   at_war: false },
        pergamon:     { score:  30, treaties: ['trade'],   at_war: false },
        numidia:      { score:   8, treaties: [],          at_war: false },
      },

      active_laws: [],
      buildings: ['granary', 'latifundium', 'temple', 'irrigation', 'aqueduct'],
      characters: [],
      ai_personality: 'defensive',
      ai_priority: 'economy',
    },

    // ─────────────────────────────────────────────
    // МАКЕДОНИЯ — Кассандр
    // ─────────────────────────────────────────────
    macedon: {
      name: 'Македония',
      adjective: 'македонское',
      color: '#7A9AB8',
      flag_emoji: '☀️',
      is_player: false,

      government: {
        type: 'monarchy',
        custom_name: 'Македонское царство',
        legitimacy: 65,
        stability: 60,
        ruler: { type: 'person', name: 'Кассандр', character_ids: [], personal_power: 75 },
        institutions: [
          {
            id: 'INST_hetairoi',
            name: 'Совет гетайров',
            type: 'military',
            size: 30,
            character_ids: ['MAC_HTR_001','MAC_HTR_002','MAC_HTR_003','MAC_HTR_004','MAC_HTR_005'],
            decision_method: 'single_person',
            quorum: 100,
            powers: ['command_phalanx', 'advise_king', 'guard_borders'],
            limitations: ['cannot_decide_succession'],
            factions: [],
          },
        ],
        power_resource: { type: 'military_loyalty', current: 65, decay_per_turn: 0.5, restored_by: ['victories', 'spoils_of_war', 'personal_loyalty'] },
        elections: null,
        succession: { tracked: true, heir: null, crisis_if_no_heir: true, claim_types: ['blood', 'conquest', 'election'] },
        conspiracies: null,
        transition_history: [{ turn: 0, from: null, to: 'monarchy', cause: 'Кассандр захватил Македонию после войн диадохов' }],
        custom_mechanics: [],
        active_transition: null,
      },

      regions: ['macedon', 'epirus'],

      population: {
        total: 380000,
        by_profession: {
          farmers:    210000,
          craftsmen:   48000,
          merchants:   32000,
          sailors:     12000,
          clergy:      15000,
          soldiers:    42000,
          slaves:      21000,
        },
        happiness: 55,   // войны диадохов истощили народ
        growth_rate: 0.001,
      },

      economy: {
        treasury: 28000,
        income_per_turn: 0,
        expense_per_turn: 0,
        tax_rate: 0.13,
        tax_rates_by_class: { aristocrats: 0.16, clergy: 0.09, commoners: 0.11, soldiers: 0.06 },
        _income_breakdown: {},
        _expense_breakdown: {},

        stockpile: {
          wheat:    95000,
          barley:   20000,
          fish:      3000,
          olive_oil: 2000,
          wine:      6000,
          salt:      4000,
          iron:     18000,
          bronze:    3000,
          timber:   22000,
          wool:      3500,
          cloth:     8000,
          leather:   4000,
          tools:     2000,
          pottery:   2500,
          papyrus:    300,
          wax:        200,
          honey:      300,
          incense:     80,
          purple_dye:  15,
          // Скот: Македония — конная держава, много лошадей
          horses:     1000,
          cattle:      500,
        },

        trade_routes: ['egypt', 'greek_states'],
      },

      military: {
        infantry:    42000,
        cavalry:      5200,
        ships:          80,
        mercenaries:  3000,
        morale:        78,
        loyalty:       80,
        at_war_with: [],
      },

      relations: {
        syracuse:     { score:   5, treaties: [],           at_war: false },
        rome:         { score:  -5, treaties: [],           at_war: false },
        carthage:     { score:  10, treaties: [],           at_war: false },
        egypt:        { score: -25, treaties: [],           at_war: false },
        epirus:       { score: -30, treaties: [],           at_war: false },
        greek_states: { score: -10, treaties: [],           at_war: false },
        pergamon:     { score: -15, treaties: [],           at_war: false },
        numidia:      { score:   0, treaties: [],           at_war: false },
      },

      active_laws: [],
      buildings: ['barracks', 'walls', 'mine', 'road'],
      characters: [],
      ai_personality: 'aggressive',
      ai_priority: 'military',
    },

    // ─────────────────────────────────────────────
    // МАЛЫЕ ГОСУДАРСТВА (не-AI, просто существуют)
    // ─────────────────────────────────────────────
    greek_states: {
      name: 'Греческие полисы',
      adjective: 'греческое',
      color: '#7BA878',
      flag_emoji: '🏛️',
      is_player: false,
      is_minor: true,

      government: {
        type: 'oligarchy',
        custom_name: 'Греческий союз',
        legitimacy: 75,
        stability: 55,
        ruler: { type: 'council', name: 'Объединённый совет', character_ids: [], personal_power: 25 },
        institutions: [
          {
            id: 'INST_ekklesia',
            name: 'Экклесия',
            type: 'legislative',
            size: 500,
            character_ids: [],
            decision_method: 'majority_vote',
            quorum: 51,
            powers: ['pass_laws', 'declare_war'],
            limitations: [],
            factions: [
              { name: 'Афинская партия',   seats: 200, wants: ['sea_power', 'trade'],    fears: ['macedon'], leader_id: null },
              { name: 'Коринфская партия', seats: 180, wants: ['land_trade', 'peace'],   fears: ['war'],     leader_id: null },
              { name: 'Независимые',       seats: 120, wants: ['autonomy'],              fears: ['hegemony'],leader_id: null },
            ],
          },
        ],
        power_resource: { type: 'legitimacy', current: 75, decay_per_turn: 1, restored_by: ['victories', 'trade_prosperity'] },
        elections: null, succession: null, conspiracies: null,
        transition_history: [],
        custom_mechanics: [], active_transition: null,
      },

      regions: ['corinth', 'athens'],
      population: { total: 120000, by_profession: { farmers: 50000, craftsmen: 25000, merchants: 20000, sailors: 10000, clergy: 5000, soldiers: 5000, slaves: 5000 }, happiness: 65, growth_rate: 0.001 },
      economy: { treasury: 15000, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 30000, fish: 8000, cloth: 5000, horses: 200, cattle: 400 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 500, ships: 40, mercenaries: 0, morale: 70, loyalty: 75, at_war_with: [] },
      relations: { syracuse: { score: 40, treaties: ['alliance'], at_war: false }, rome: { score: 15, treaties: [], at_war: false }, carthage: { score: -20, treaties: [], at_war: false }, egypt: { score: 35, treaties: ['trade'], at_war: false }, macedon: { score: -10, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'diplomatic', ai_priority: 'trade',
    },

    epirus: {
      name: 'Эпир',
      adjective: 'эпирское',
      color: '#6B9E8A',
      flag_emoji: '🗡️',
      is_player: false,
      is_minor: true,

      government: { type: 'monarchy', custom_name: 'Царство Эпира', legitimacy: 70, stability: 60, ruler: { type: 'person', name: 'Пирр', character_ids: [], personal_power: 80 }, institutions: [], power_resource: { type: 'prestige', current: 70, decay_per_turn: 1, restored_by: ['victories', 'personal_combat', 'diplomatic_marriages'] }, elections: null, succession: { tracked: true, heir: null, crisis_if_no_heir: true, claim_types: ['blood', 'conquest'] }, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['epirus'],
      population: { total: 95000, by_profession: { farmers: 55000, craftsmen: 10000, merchants: 8000, sailors: 4000, clergy: 3000, soldiers: 12000, slaves: 3000 }, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 5500, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.11, stockpile: { wheat: 22000, timber: 8000, iron: 3000, horses: 350, cattle: 300 }, trade_routes: [] },
      military: { infantry: 12000, cavalry: 1200, ships: 20, mercenaries: 0, morale: 80, loyalty: 85, at_war_with: [] },
      relations: { syracuse: { score: 15, treaties: [], at_war: false }, rome: { score: -20, treaties: [], at_war: false }, macedon: { score: -30, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'aggressive', ai_priority: 'military',
    },

    pergamon: {
      name: 'Пергам',
      adjective: 'пергамское',
      color: '#A89080',
      flag_emoji: '📜',
      is_player: false,
      is_minor: true,

      government: { type: 'monarchy', custom_name: 'Пергамское царство', legitimacy: 68, stability: 65, ruler: { type: 'person', name: 'Филетер', character_ids: [], personal_power: 72 }, institutions: [], power_resource: { type: 'wealth', current: 68, decay_per_turn: 0.5, restored_by: ['trade_profits', 'victories'] }, elections: null, succession: { tracked: true, heir: null, crisis_if_no_heir: true, claim_types: ['blood', 'appointment'] }, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['pergamon'],
      population: { total: 85000, by_profession: { farmers: 45000, craftsmen: 18000, merchants: 12000, sailors: 3000, clergy: 4000, soldiers: 2000, slaves: 1000 }, happiness: 70, growth_rate: 0.002 },
      economy: { treasury: 12000, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.11, stockpile: { wheat: 20000, cloth: 6000, wine: 4000, horses: 200, cattle: 300 }, trade_routes: [] },
      military: { infantry: 3000, cavalry: 400, ships: 15, mercenaries: 500, morale: 65, loyalty: 70, at_war_with: [] },
      relations: { syracuse: { score: 10, treaties: [], at_war: false }, egypt: { score: 30, treaties: ['trade'], at_war: false }, macedon: { score: -15, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'diplomatic', ai_priority: 'economy',
    },

    numidia: {
      name: 'Нумидия',
      adjective: 'нумидийское',
      color: '#B8956A',
      flag_emoji: '🏇',
      is_player: false,
      is_minor: true,

      government: { type: 'tribal', custom_name: 'Нумидийское вождество', legitimacy: 78, stability: 55, ruler: { type: 'person', name: 'Айлимас', character_ids: ['NUM_ELD_001','NUM_ELD_002','NUM_ELD_003','NUM_ELD_004'], personal_power: 75 }, institutions: [{ id: 'INST_elder_council', name: 'Совет старейшин', type: 'advisory', size: 4, character_ids: ['NUM_ELD_001','NUM_ELD_002','NUM_ELD_003','NUM_ELD_004'], decision_method: 'unanimous', quorum: 100, powers: ['approve_war', 'tribal_laws', 'choose_successor'], limitations: ['cannot_override_chieftain_in_battle'], factions: [] }], power_resource: { type: 'prestige', current: 78, decay_per_turn: 1.5, restored_by: ['raids', 'personal_combat', 'generous_feasts'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['numidia'],
      population: { total: 320000, by_profession: { farmers: 200000, craftsmen: 20000, merchants: 15000, sailors: 5000, clergy: 10000, soldiers: 35000, slaves: 35000 }, happiness: 55, growth_rate: 0.003 },
      economy: { treasury: 4200, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.08, stockpile: { wheat: 80000, horses: 5000, cattle: 1000 }, trade_routes: [] },
      military: { infantry: 20000, cavalry: 8000, ships: 5, mercenaries: 0, morale: 75, loyalty: 88, at_war_with: [] },
      relations: { syracuse: { score: -10, treaties: [], at_war: false }, carthage: { score: 40, treaties: ['vassal'], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    gela: {
      name: 'Гела',
      adjective: 'гельское',
      color: '#D4A0A8',
      flag_emoji: '🏛️',
      is_player: false,
      is_minor: true,
      government: { type: 'oligarchy', custom_name: null, legitimacy: 60, stability: 55, ruler: { type: 'council', name: 'Совет Гелы', character_ids: [], personal_power: 40 }, institutions: [], power_resource: { type: 'legitimacy', current: 60, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2404'],
      population: { total: 18000, by_profession: { farmers: 8500, craftsmen: 3500, merchants: 2500, sailors: 1500, clergy: 500, soldiers: 700, slaves: 800 }, happiness: 60, growth_rate: 0.001 },
      economy: { treasury: 2000, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 5000, fish: 1500, horses: 50, cattle: 100 }, trade_routes: [] },
      military: { infantry: 600, cavalry: 60, ships: 8, mercenaries: 0, morale: 55, loyalty: 60, at_war_with: [] },
      relations: { syracuse: { score: 20, treaties: [], at_war: false }, carthage: { score: -10, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    acragas: {
      name: 'Акрагас',
      adjective: 'акрагантское',
      color: '#9BAFC4',
      flag_emoji: '🏛️',
      is_player: false,
      is_minor: true,
      government: { type: 'oligarchy', custom_name: null, legitimacy: 65, stability: 58, ruler: { type: 'council', name: 'Совет Акрагаса', character_ids: [], personal_power: 45 }, institutions: [], power_resource: { type: 'legitimacy', current: 65, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2409'],
      population: { total: 25000, by_profession: { farmers: 11000, craftsmen: 5000, merchants: 4000, sailors: 2000, clergy: 1000, soldiers: 800, slaves: 1200 }, happiness: 62, growth_rate: 0.001 },
      economy: { treasury: 2500, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 6000, fish: 1500, horses: 80, cattle: 150 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 80, ships: 10, mercenaries: 0, morale: 58, loyalty: 62, at_war_with: [] },
      relations: { syracuse: { score: 15, treaties: [], at_war: false }, carthage: { score: -15, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    herakleia_minoa: {
      name: 'Гераклея-Минойская',
      adjective: 'гераклейское',
      color: '#B0A090',
      flag_emoji: '🏛️',
      is_player: false,
      is_minor: true,
      government: { type: 'oligarchy', custom_name: null, legitimacy: 55, stability: 50, ruler: { type: 'council', name: 'Совет Гераклеи', character_ids: [], personal_power: 35 }, institutions: [], power_resource: { type: 'legitimacy', current: 55, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2410'],
      population: { total: 5000, by_profession: { farmers: 2200, craftsmen: 800, merchants: 600, sailors: 500, clergy: 200, soldiers: 200, slaves: 500 }, happiness: 55, growth_rate: 0.001 },
      economy: { treasury: 1200, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 3000, fish: 1000, horses: 30, cattle: 60 }, trade_routes: [] },
      military: { infantry: 300, cavalry: 30, ships: 5, mercenaries: 0, morale: 50, loyalty: 55, at_war_with: [] },
      relations: { syracuse: { score: 10, treaties: [], at_war: false }, carthage: { score: 5, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    selinous: {
      name: 'Селинунт',
      adjective: 'селинунтское',
      color: '#8BA880',
      flag_emoji: '🌿',
      is_player: false,
      is_minor: true,
      government: { type: 'oligarchy', custom_name: null, legitimacy: 60, stability: 55, ruler: { type: 'council', name: 'Совет Селинунта', character_ids: [], personal_power: 40 }, institutions: [], power_resource: { type: 'legitimacy', current: 60, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2411'],
      population: { total: 15000, by_profession: { farmers: 6000, craftsmen: 2250, merchants: 1500, sailors: 1800, clergy: 750, soldiers: 1200, slaves: 1500 }, happiness: 58, growth_rate: 0.001 },
      economy: { treasury: 1800, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 4000, fish: 1200, horses: 40, cattle: 80 }, trade_routes: [] },
      military: { infantry: 400, cavalry: 40, ships: 6, mercenaries: 0, morale: 55, loyalty: 58, at_war_with: [] },
      relations: { syracuse: { score: 5, treaties: [], at_war: false }, carthage: { score: 10, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    elymia: {
      name: 'Элимия',
      adjective: 'элимское',
      color: '#B8A090',
      flag_emoji: '🏔️',
      is_player: false,
      is_minor: true,
      government: { type: 'tribal', custom_name: 'Элимское вождество', legitimacy: 65, stability: 58, ruler: { type: 'person', name: 'Вождь Элимов', character_ids: [], personal_power: 60 }, institutions: [], power_resource: { type: 'prestige', current: 65, decay_per_turn: 1, restored_by: ['raids', 'personal_combat'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2413', 'r2414'],
      population: { total: 55000, by_profession: { farmers: 19300, craftsmen: 5500, merchants: 2200, sailors: 1650, clergy: 6600, soldiers: 9900, slaves: 9850 }, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 800, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.08, stockpile: { wheat: 2000, timber: 1000, horses: 80, cattle: 200 }, trade_routes: [] },
      military: { infantry: 1300, cavalry: 130, ships: 3, mercenaries: 0, morale: 65, loyalty: 70, at_war_with: [] },
      relations: { syracuse: { score: -5, treaties: [], at_war: false }, carthage: { score: 15, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    sicels: {
      name: 'Сикелы',
      adjective: 'сикельское',
      color: '#C4A86C',
      flag_emoji: '⚔️',
      is_player: false,
      is_minor: true,
      government: { type: 'tribal', custom_name: 'Союз Сикелов', legitimacy: 58, stability: 50, ruler: { type: 'person', name: 'Вождь Сикелов', character_ids: [], personal_power: 60 }, institutions: [], power_resource: { type: 'prestige', current: 55, decay_per_turn: 1, restored_by: ['raids', 'personal_combat'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2420', 'r2422'],
      population: { total: 30000, by_profession: { farmers: 14000, craftsmen: 3500, merchants: 1400, sailors: 200, clergy: 2100, soldiers: 5300, slaves: 3500 }, happiness: 52, growth_rate: 0.002 },
      economy: { treasury: 700, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.07, stockpile: { wheat: 2500, iron: 1200, horses: 100, cattle: 300 }, trade_routes: [] },
      military: { infantry: 3500, cavalry: 350, ships: 0, mercenaries: 0, morale: 62, loyalty: 70, at_war_with: [] },
      relations: { syracuse: { score: -5, treaties: [], at_war: false }, carthage: { score: -10, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    sicani: {
      name: 'Сиканы',
      adjective: 'сиканское',
      color: '#C88B7A',
      flag_emoji: '⛰️',
      is_player: false,
      is_minor: true,
      government: { type: 'tribal', custom_name: 'Союз Сиканов', legitimacy: 60, stability: 52, ruler: { type: 'person', name: 'Вождь Сиканов', character_ids: [], personal_power: 55 }, institutions: [], power_resource: { type: 'prestige', current: 60, decay_per_turn: 1, restored_by: ['raids', 'personal_combat'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2423', 'r2424', 'r2425'],
      population: { total: 14500, by_profession: { farmers: 6800, craftsmen: 1800, merchants: 700, sailors: 100, clergy: 1300, soldiers: 2300, slaves: 1500 }, happiness: 55, growth_rate: 0.002 },
      economy: { treasury: 600, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.07, stockpile: { wheat: 3000, iron: 500, horses: 80, cattle: 200 }, trade_routes: [] },
      military: { infantry: 2200, cavalry: 220, ships: 0, mercenaries: 0, morale: 60, loyalty: 68, at_war_with: [] },
      relations: { syracuse: { score: -10, treaties: [], at_war: false }, carthage: { score: 5, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    calactea: {
      name: 'Калактея',
      adjective: 'калактейское',
      color: '#B0A878',
      flag_emoji: '🏛️',
      is_player: false,
      is_minor: true,
      government: { type: 'oligarchy', custom_name: null, legitimacy: 55, stability: 50, ruler: { type: 'council', name: 'Совет Калактеи', character_ids: [], personal_power: 35 }, institutions: [], power_resource: { type: 'legitimacy', current: 55, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2417', 'r2418'],
      population: { total: 9000, by_profession: { farmers: 3800, craftsmen: 1500, merchants: 1200, sailors: 800, clergy: 400, soldiers: 300, slaves: 1000 }, happiness: 55, growth_rate: 0.001 },
      economy: { treasury: 1000, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 2500, fish: 800, horses: 40, cattle: 80 }, trade_routes: [] },
      military: { infantry: 300, cavalry: 30, ships: 4, mercenaries: 0, morale: 50, loyalty: 55, at_war_with: [] },
      relations: { syracuse: { score: 5, treaties: [], at_war: false }, carthage: { score: -5, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    tyndaria: {
      name: 'Тиндарис',
      adjective: 'тиндарийское',
      color: '#A0A8B8',
      flag_emoji: '🌊',
      is_player: false,
      is_minor: true,
      government: { type: 'oligarchy', custom_name: null, legitimacy: 58, stability: 52, ruler: { type: 'council', name: 'Совет Тиндариса', character_ids: [], personal_power: 38 }, institutions: [], power_resource: { type: 'legitimacy', current: 58, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      regions: ['r2419', 'r3199'],
      population: { total: 8000, by_profession: { farmers: 2400, craftsmen: 1200, merchants: 800, sailors: 2000, clergy: 400, soldiers: 400, slaves: 800 }, happiness: 58, growth_rate: 0.001 },
      economy: { treasury: 1400, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 3500, fish: 1000, horses: 30, cattle: 60 }, trade_routes: [] },
      military: { infantry: 400, cavalry: 40, ships: 6, mercenaries: 0, morale: 52, loyalty: 57, at_war_with: [] },
      relations: { syracuse: { score: 10, treaties: [], at_war: false }, carthage: { score: -5, treaties: [], at_war: false } },
      active_laws: [], characters: [],
      ai_personality: 'neutral', ai_priority: 'survival',
    },

    neutral: {
      name: 'Независимые',
      adjective: 'независимое',
      color: '#A8A898',
      flag_emoji: '🏳️',
      is_player: false,
      is_minor: true,
      regions: ['r7', 'r9', 'r11', 'r15', 'r22', 'r24', 'r25', 'r26', 'r27', 'r28', 'r32', 'r33', 'r34', 'r35', 'r36', 'r37', 'r38', 'r39', 'r40', 'r41', 'r42', 'r43', 'r44', 'r45', 'r46', 'r47', 'r48', 'r49', 'r50', 'r51', 'r56', 'r59', 'r61', 'r64', 'r65', 'r67', 'r68', 'r69', 'r70', 'r71', 'r72', 'r73', 'r74', 'r75', 'r76', 'r77', 'r78', 'r80', 'r81', 'r83', 'r84', 'r85', 'r86', 'r87', 'r88', 'r93', 'r94', 'r97', 'r98', 'r104', 'r106', 'r108', 'r109', 'r110', 'r111', 'r125', 'r132', 'r133', 'r141', 'r142', 'r143', 'r148', 'r149', 'r150', 'r154', 'r159', 'r160', 'r163', 'r164', 'r165', 'r168', 'r169', 'r170', 'r171', 'r172', 'r173', 'r174', 'r175', 'r176', 'r177', 'r178', 'r179', 'r180', 'r182', 'r186', 'r187', 'r188', 'r189', 'r190', 'r191', 'r192', 'r197', 'r198', 'r199', 'r200', 'r203', 'r204', 'r205', 'r206', 'r208', 'r209', 'r213', 'r227', 'r232', 'r233', 'r234', 'r235', 'r240', 'r241', 'r250', 'r252', 'r253', 'r254', 'r255', 'r256', 'r257', 'r258', 'r259', 'r260', 'r261', 'r262', 'r263', 'r264', 'r265', 'r266', 'r267', 'r268', 'r269', 'r270', 'r271', 'r272', 'r273', 'r274', 'r275', 'r276', 'r277', 'r279', 'r281', 'r282', 'r283', 'r284', 'r285', 'r286', 'r287', 'r288', 'r289', 'r290', 'r291', 'r292', 'r293', 'r294', 'r295', 'r296', 'r297', 'r298', 'r299', 'r300', 'r301', 'r303', 'r304', 'r306', 'r307', 'r308', 'r309', 'r310', 'r311', 'r312', 'r313', 'r314', 'r315', 'r316', 'r317', 'r318', 'r319', 'r320', 'r321', 'r322', 'r323', 'r324', 'r325', 'r326', 'r327', 'r328', 'r329', 'r330', 'r331', 'r332', 'r333', 'r334', 'r335', 'r336', 'r337', 'r338', 'r339', 'r344', 'r345', 'r346', 'r347', 'r348', 'r352', 'r355', 'r356', 'r357', 'r358', 'r359', 'r360', 'r361', 'r362', 'r363', 'r364', 'r365', 'r366', 'r367', 'r368', 'r369', 'r370', 'r371', 'r373', 'r374', 'r375', 'r376', 'r378', 'r384', 'r385', 'r386', 'r387', 'r388', 'r389', 'r390', 'r391', 'r392', 'r393', 'r394', 'r395', 'r396', 'r397', 'r398', 'r399', 'r400', 'r401', 'r402', 'r404', 'r405', 'r406', 'r407', 'r408', 'r409', 'r410', 'r411', 'r412', 'r413', 'r428', 'r431', 'r432', 'r433', 'r434', 'r435', 'r436', 'r437', 'r438', 'r439', 'r440', 'r441', 'r442', 'r448', 'r449', 'r450', 'r451', 'r452', 'r453', 'r454', 'r469', 'r470', 'r471', 'r472', 'r473', 'r474', 'r475', 'r476', 'r477', 'r478', 'r479', 'r480', 'r481', 'r482', 'r483', 'r484', 'r485', 'r486', 'r487', 'r488', 'r489', 'r490', 'r491', 'r492', 'r493', 'r494', 'r495', 'r496', 'r497', 'r498', 'r499', 'r500', 'r501', 'r502', 'r503', 'r504', 'r505', 'r506', 'r507', 'r508', 'r509', 'r510', 'r511', 'r512', 'r513', 'r514', 'r515', 'r516', 'r517', 'r518', 'r519', 'r520', 'r521', 'r522', 'r523', 'r524', 'r525', 'r526', 'r527', 'r528', 'r529', 'r530', 'r531', 'r532', 'r533', 'r534', 'r535', 'r536', 'r537', 'r538', 'r539', 'r540', 'r541', 'r542', 'r543', 'r544', 'r545', 'r546', 'r547', 'r548', 'r549', 'r550', 'r551', 'r552', 'r553', 'r554', 'r555', 'r556', 'r557', 'r558', 'r560', 'r561', 'r563', 'r564', 'r565', 'r566', 'r567', 'r568', 'r569', 'r570', 'r571', 'r572', 'r573', 'r574', 'r575', 'r576', 'r577', 'r578', 'r579', 'r580', 'r581', 'r582', 'r583', 'r584', 'r585', 'r586', 'r587', 'r588', 'r589', 'r590', 'r591', 'r594', 'r595', 'r596', 'r597', 'r599', 'r600', 'r601', 'r602', 'r603', 'r604', 'r605', 'r606', 'r607', 'r608', 'r609', 'r610', 'r611', 'r612', 'r614', 'r615', 'r616', 'r617', 'r618', 'r619', 'r620', 'r621', 'r622', 'r623', 'r624', 'r625', 'r626', 'r627', 'r628', 'r629', 'r630', 'r631', 'r632', 'r633', 'r634', 'r635', 'r636', 'r637', 'r638', 'r639', 'r640', 'r641', 'r642', 'r643', 'r644', 'r645', 'r646', 'r647', 'r648', 'r649', 'r650', 'r651', 'r652', 'r653', 'r654', 'r655', 'r656', 'r657', 'r658', 'r659', 'r660', 'r661', 'r662', 'r663', 'r681', 'r682', 'r683', 'r684', 'r685', 'r686', 'r687', 'r688', 'r689', 'r690', 'r691', 'r692', 'r693', 'r694', 'r695', 'r696', 'r697', 'r698', 'r699', 'r700', 'r701', 'r702', 'r703', 'r704', 'r705', 'r706', 'r707', 'r708', 'r709', 'r710', 'r711', 'r712', 'r713', 'r714', 'r715', 'r716', 'r717', 'r718', 'r719', 'r720', 'r721', 'r722', 'r723', 'r724', 'r725', 'r726', 'r727', 'r728', 'r729', 'r730', 'r731', 'r732', 'r733', 'r734', 'r735', 'r736', 'r737', 'r738', 'r739', 'r740', 'r741', 'r742', 'r743', 'r744', 'r745', 'r746', 'r747', 'r748', 'r749', 'r750', 'r751', 'r752', 'r753', 'r754', 'r756', 'r758', 'r761', 'r762', 'r768', 'r769', 'r770', 'r773', 'r774', 'r775', 'r776', 'r777', 'r778', 'r779', 'r781', 'r783', 'r785', 'r786', 'r788', 'r789', 'r801', 'r806', 'r807', 'r810', 'r824', 'r825', 'r827', 'r829', 'r831', 'r832', 'r833', 'r834', 'r835', 'r836', 'r837', 'r838', 'r839', 'r840', 'r841', 'r842', 'r843', 'r844', 'r845', 'r846', 'r847', 'r848', 'r849', 'r850', 'r851', 'r852', 'r853', 'r854', 'r855', 'r856', 'r857', 'r867', 'r874', 'r875', 'r876', 'r877', 'r878', 'r879', 'r880', 'r881', 'r882', 'r883', 'r884', 'r885', 'r886', 'r887', 'r888', 'r889', 'r890', 'r891', 'r892', 'r893', 'r894', 'r895', 'r896', 'r897', 'r898', 'r899', 'r900', 'r901', 'r902', 'r903', 'r904', 'r905', 'r906', 'r907', 'r908', 'r909', 'r910', 'r911', 'r912', 'r913', 'r914', 'r915', 'r916', 'r917', 'r918', 'r919', 'r920', 'r921', 'r922', 'r923', 'r924', 'r925', 'r926', 'r927', 'r928', 'r929', 'r930', 'r931', 'r932', 'r933', 'r934', 'r935', 'r936', 'r937', 'r938', 'r939', 'r940', 'r941', 'r942', 'r943', 'r944', 'r945', 'r946', 'r947', 'r948', 'r949', 'r950', 'r951', 'r952', 'r953', 'r954', 'r955', 'r956', 'r957', 'r958', 'r959', 'r960', 'r961', 'r962', 'r963', 'r964', 'r965', 'r966', 'r967', 'r968', 'r969', 'r970', 'r971', 'r972', 'r973', 'r974', 'r975', 'r976', 'r977', 'r978', 'r979', 'r980', 'r981', 'r982', 'r983', 'r984', 'r985', 'r986', 'r987', 'r988', 'r989', 'r990', 'r991', 'r992', 'r993', 'r994', 'r995', 'r996', 'r997', 'r998', 'r999', 'r1000', 'r1001', 'r1002', 'r1003', 'r1004', 'r1006', 'r1007', 'r1013', 'r1014', 'r1015', 'r1016', 'r1017', 'r1018', 'r1019', 'r1023', 'r1026', 'r1027', 'r1028', 'r1029', 'r1030', 'r1031', 'r1032', 'r1039', 'r1040', 'r1041', 'r1044', 'r1045', 'r1046', 'r1047', 'r1048', 'r1049', 'r1055', 'r1056', 'r1057', 'r1058', 'r1059', 'r1060', 'r1061', 'r1062', 'r1063', 'r1064', 'r1065', 'r1066', 'r1068', 'r1069', 'r1070', 'r1071', 'r1072', 'r1073', 'r1074', 'r1075', 'r1076', 'r1077', 'r1078', 'r1079', 'r1080', 'r1081', 'r1082', 'r1083', 'r1084', 'r1085', 'r1086', 'r1087', 'r1088', 'r1089', 'r1090', 'r1091', 'r1092', 'r1093', 'r1094', 'r1095', 'r1096', 'r1097', 'r1098', 'r1099', 'r1101', 'r1103', 'r1105', 'r1106', 'r1107', 'r1111', 'r1112', 'r1113', 'r1114', 'r1115', 'r1116', 'r1118', 'r1119', 'r1120', 'r1121', 'r1122', 'r1123', 'r1124', 'r1125', 'r1126', 'r1127', 'r1128', 'r1129', 'r1131', 'r1132', 'r1133', 'r1134', 'r1135', 'r1136', 'r1137', 'r1138', 'r1140', 'r1143', 'r1144', 'r1145', 'r1146', 'r1147', 'r1148', 'r1149', 'r1150', 'r1151', 'r1152', 'r1154', 'r1155', 'r1156', 'r1157', 'r1158', 'r1162', 'r1163', 'r1164', 'r1165', 'r1166', 'r1167', 'r1168', 'r1169', 'r1170', 'r1171', 'r1172', 'r1173', 'r1174', 'r1175', 'r1176', 'r1177', 'r1178', 'r1179', 'r1180', 'r1181', 'r1182', 'r1183', 'r1184', 'r1185', 'r1186', 'r1187', 'r1188', 'r1189', 'r1190', 'r1191', 'r1192', 'r1193', 'r1194', 'r1195', 'r1196', 'r1197', 'r1198', 'r1199', 'r1200', 'r1201', 'r1202', 'r1203', 'r1204', 'r1205', 'r1206', 'r1207', 'r1208', 'r1209', 'r1210', 'r1211', 'r1212', 'r1213', 'r1214', 'r1215', 'r1216', 'r1217', 'r1218', 'r1219', 'r1220', 'r1221', 'r1222', 'r1223', 'r1224', 'r1225', 'r1226', 'r1227', 'r1228', 'r1229', 'r1230', 'r1231', 'r1232', 'r1233', 'r1234', 'r1235', 'r1236', 'r1237', 'r1238', 'r1239', 'r1240', 'r1241', 'r1242', 'r1243', 'r1244', 'r1245', 'r1246', 'r1247', 'r1248', 'r1249', 'r1250', 'r1251', 'r1252', 'r1253', 'r1254', 'r1255', 'r1256', 'r1257', 'r1258', 'r1259', 'r1260', 'r1261', 'r1262', 'r1263', 'r1264', 'r1265', 'r1266', 'r1267', 'r1268', 'r1269', 'r1270', 'r1271', 'r1272', 'r1273', 'r1274', 'r1275', 'r1276', 'r1277', 'r1278', 'r1279', 'r1280', 'r1281', 'r1282', 'r1283', 'r1284', 'r1285', 'r1286', 'r1287', 'r1288', 'r1289', 'r1290', 'r1291', 'r1292', 'r1293', 'r1294', 'r1295', 'r1296', 'r1297', 'r1298', 'r1299', 'r1300', 'r1301', 'r1302', 'r1303', 'r1304', 'r1305', 'r1306', 'r1307', 'r1308', 'r1309', 'r1314', 'r1315', 'r1316', 'r1317', 'r1318', 'r1319', 'r1320', 'r1321', 'r1322', 'r1323', 'r1324', 'r1325', 'r1326', 'r1327', 'r1328', 'r1329', 'r1330', 'r1331', 'r1332', 'r1333', 'r1334', 'r1335', 'r1336', 'r1337', 'r1338', 'r1339', 'r1340', 'r1341', 'r1342', 'r1343', 'r1344', 'r1345', 'r1346', 'r1347', 'r1348', 'r1349', 'r1350', 'r1351', 'r1352', 'r1353', 'r1354', 'r1355', 'r1356', 'r1357', 'r1358', 'r1359', 'r1360', 'r1362', 'r1363', 'r1364', 'r1365', 'r1366', 'r1367', 'r1368', 'r1369', 'r1370', 'r1371', 'r1372', 'r1373', 'r1374', 'r1375', 'r1376', 'r1377', 'r1378', 'r1379', 'r1380', 'r1381', 'r1382', 'r1383', 'r1384', 'r1385', 'r1386', 'r1387', 'r1388', 'r1389', 'r1390', 'r1391', 'r1392', 'r1393', 'r1394', 'r1395', 'r1396', 'r1409', 'r1410', 'r1411', 'r1412', 'r1413', 'r1414', 'r1415', 'r1416', 'r1417', 'r1418', 'r1419', 'r1420', 'r1421', 'r1422', 'r1424', 'r1425', 'r1426', 'r1427', 'r1428', 'r1429', 'r1430', 'r1431', 'r1432', 'r1433', 'r1434', 'r1435', 'r1436', 'r1437', 'r1438', 'r1439', 'r1440', 'r1441', 'r1442', 'r1443', 'r1444', 'r1445', 'r1447', 'r1448', 'r1449', 'r1451', 'r1452', 'r1453', 'r1454', 'r1455', 'r1456', 'r1457', 'r1458', 'r1459', 'r1460', 'r1461', 'r1462', 'r1463', 'r1464', 'r1465', 'r1467', 'r1468', 'r1470', 'r1471', 'r1472', 'r1476', 'r1477', 'r1478', 'r1479', 'r1483', 'r1484', 'r1485', 'r1486', 'r1487', 'r1488', 'r1489', 'r1490', 'r1491', 'r1492', 'r1493', 'r1497', 'r1498', 'r1499', 'r1501', 'r1502', 'r1503', 'r1504', 'r1505', 'r1506', 'r1507', 'r1508', 'r1509', 'r1510', 'r1511', 'r1512', 'r1513', 'r1514', 'r1515', 'r1516', 'r1517', 'r1518', 'r1519', 'r1520', 'r1521', 'r1522', 'r1523', 'r1524', 'r1525', 'r1526', 'r1527', 'r1528', 'r1529', 'r1530', 'r1531', 'r1532', 'r1533', 'r1534', 'r1535', 'r1536', 'r1537', 'r1538', 'r1539', 'r1540', 'r1541', 'r1542', 'r1543', 'r1544', 'r1545', 'r1546', 'r1547', 'r1548', 'r1549', 'r1550', 'r1552', 'r1554', 'r1556', 'r1557', 'r1558', 'r1559', 'r1560', 'r1561', 'r1562', 'r1563', 'r1564', 'r1567', 'r1568', 'r1570', 'r1571', 'r1572', 'r1573', 'r1575', 'r1576', 'r1577', 'r1578', 'r1579', 'r1581', 'r1582', 'r1583', 'r1584', 'r1585', 'r1586', 'r1587', 'r1588', 'r1589', 'r1590', 'r1591', 'r1592', 'r1593', 'r1594', 'r1595', 'r1596', 'r1597', 'r1598', 'r1599', 'r1600', 'r1601', 'r1602', 'r1603', 'r1604', 'r1605', 'r1606', 'r1607', 'r1608', 'r1609', 'r1610', 'r1611', 'r1612', 'r1613', 'r1614', 'r1615', 'r1616', 'r1617', 'r1618', 'r1619', 'r1620', 'r1621', 'r1622', 'r1623', 'r1624', 'r1625', 'r1626', 'r1627', 'r1628', 'r1629', 'r1630', 'r1631', 'r1632', 'r1633', 'r1634', 'r1635', 'r1636', 'r1637', 'r1638', 'r1639', 'r1640', 'r1641', 'r1642', 'r1643', 'r1644', 'r1645', 'r1646', 'r1647', 'r1648', 'r1649', 'r1650', 'r1651', 'r1652', 'r1653', 'r1654', 'r1655', 'r1656', 'r1657', 'r1658', 'r1659', 'r1660', 'r1661', 'r1662', 'r1663', 'r1664', 'r1665', 'r1666', 'r1667', 'r1668', 'r1669', 'r1670', 'r1671', 'r1672', 'r1673', 'r1674', 'r1675', 'r1676', 'r1677', 'r1678', 'r1679', 'r1680', 'r1681', 'r1682', 'r1683', 'r1684', 'r1685', 'r1686', 'r1687', 'r1688', 'r1689', 'r1690', 'r1691', 'r1692', 'r1693', 'r1694', 'r1695', 'r1696', 'r1697', 'r1698', 'r1699', 'r1700', 'r1701', 'r1702', 'r1703', 'r1704', 'r1705', 'r1706', 'r1707', 'r1708', 'r1709', 'r1710', 'r1711', 'r1712', 'r1713', 'r1714', 'r1715', 'r1716', 'r1717', 'r1718', 'r1719', 'r1720', 'r1721', 'r1722', 'r1723', 'r1724', 'r1725', 'r1726', 'r1727', 'r1728', 'r1729', 'r1730', 'r1731', 'r1732', 'r1733', 'r1734', 'r1735', 'r1736', 'r1737', 'r1738', 'r1739', 'r1740', 'r1741', 'r1742', 'r1743', 'r1744', 'r1745', 'r1746', 'r1747', 'r1748', 'r1749', 'r1750', 'r1751', 'r1752', 'r1753', 'r1754', 'r1755', 'r1756', 'r1757', 'r1758', 'r1759', 'r1760', 'r1761', 'r1762', 'r1763', 'r1764', 'r1765', 'r1766', 'r1767', 'r1768', 'r1769', 'r1770', 'r1771', 'r1772', 'r1773', 'r1774', 'r1775', 'r1776', 'r1777', 'r1778', 'r1779', 'r1780', 'r1781', 'r1782', 'r1783', 'r1784', 'r1785', 'r1786', 'r1787', 'r1788', 'r1789', 'r1790', 'r1791', 'r1792', 'r1793', 'r1794', 'r1795', 'r1796', 'r1797', 'r1798', 'r1799', 'r1800', 'r1801', 'r1802', 'r1803', 'r1804', 'r1805', 'r1806', 'r1807', 'r1808', 'r1809', 'r1810', 'r1811', 'r1812', 'r1813', 'r1814', 'r1815', 'r1816', 'r1817', 'r1818', 'r1819', 'r1820', 'r1821', 'r1822', 'r1823', 'r1824', 'r1825', 'r1826', 'r1828', 'r1829', 'r1830', 'r1831', 'r1832', 'r1833', 'r1834', 'r1835', 'r1836', 'r1837', 'r1838', 'r1839', 'r1840', 'r1842', 'r1843', 'r1844', 'r1845', 'r1846', 'r1847', 'r1848', 'r1849', 'r1850', 'r1851', 'r1852', 'r1853', 'r1854', 'r1855', 'r1856', 'r1857', 'r1858', 'r1859', 'r1860', 'r1861', 'r1862', 'r1863', 'r1864', 'r1865', 'r1866', 'r1867', 'r1868', 'r1869', 'r1872', 'r1873', 'r1874', 'r1875', 'r1876', 'r1877', 'r1878', 'r1879', 'r1880', 'r1881', 'r1882', 'r1883', 'r1884', 'r1885', 'r1886', 'r1888', 'r1889', 'r1890', 'r1891', 'r1892', 'r1893', 'r1894', 'r1895', 'r1896', 'r1897', 'r1898', 'r1899', 'r1900', 'r1901', 'r1902', 'r1903', 'r1904', 'r1905', 'r1906', 'r1907', 'r1908', 'r1909', 'r1910', 'r1911', 'r1912', 'r1913', 'r1914', 'r1915', 'r1916', 'r1917', 'r1918', 'r1919', 'r1920', 'r1921', 'r1922', 'r1923', 'r1924', 'r1925', 'r1926', 'r1927', 'r1928', 'r1929', 'r1931', 'r1932', 'r1934', 'r1935', 'r1936', 'r1937', 'r1938', 'r1939', 'r1940', 'r1941', 'r1942', 'r1943', 'r1944', 'r1945', 'r1946', 'r1947', 'r1948', 'r1949', 'r1950', 'r1951', 'r1952', 'r1953', 'r1954', 'r1955', 'r1956', 'r1957', 'r1958', 'r1959', 'r1960', 'r1961', 'r1962', 'r1963', 'r1964', 'r1965', 'r1966', 'r1967', 'r1968', 'r1969', 'r1970', 'r1971', 'r1972', 'r1973', 'r1974', 'r1975', 'r1976', 'r1977', 'r1978', 'r1979', 'r1980', 'r1981', 'r1982', 'r1983', 'r1984', 'r1985', 'r1986', 'r1987', 'r1988', 'r1989', 'r1990', 'r1991', 'r1992', 'r1994', 'r1995', 'r1996', 'r1997', 'r1998', 'r1999', 'r2000', 'r2001', 'r2002', 'r2003', 'r2004', 'r2005', 'r2006', 'r2007', 'r2008', 'r2009', 'r2010', 'r2011', 'r2012', 'r2013', 'r2014', 'r2015', 'r2016', 'r2017', 'r2018', 'r2019', 'r2021', 'r2022', 'r2023', 'r2025', 'r2026', 'r2027', 'r2028', 'r2029', 'r2030', 'r2031', 'r2032', 'r2033', 'r2034', 'r2035', 'r2036', 'r2037', 'r2038', 'r2039', 'r2040', 'r2041', 'r2042', 'r2043', 'r2044', 'r2045', 'r2046', 'r2047', 'r2048', 'r2049', 'r2050', 'r2051', 'r2052', 'r2053', 'r2054', 'r2055', 'r2056', 'r2057', 'r2058', 'r2059', 'r2060', 'r2061', 'r2062', 'r2063', 'r2064', 'r2066', 'r2067', 'r2068', 'r2069', 'r2070', 'r2071', 'r2072', 'r2073', 'r2074', 'r2075', 'r2076', 'r2077', 'r2078', 'r2079', 'r2080', 'r2081', 'r2082', 'r2083', 'r2084', 'r2085', 'r2086', 'r2087', 'r2088', 'r2089', 'r2090', 'r2091', 'r2092', 'r2093', 'r2094', 'r2095', 'r2096', 'r2097', 'r2098', 'r2099', 'r2100', 'r2101', 'r2102', 'r2103', 'r2104', 'r2105', 'r2106', 'r2107', 'r2108', 'r2109', 'r2110', 'r2111', 'r2112', 'r2113', 'r2114', 'r2115', 'r2133', 'r2134', 'r2135', 'r2166', 'r2178', 'r2179', 'r2180', 'r2181', 'r2182', 'r2183', 'r2184', 'r2185', 'r2187', 'r2188', 'r2189', 'r2190', 'r2191', 'r2192', 'r2193', 'r2194', 'r2195', 'r2196', 'r2197', 'r2198', 'r2199', 'r2203', 'r2204', 'r2205', 'r2206', 'r2207', 'r2208', 'r2209', 'r2210', 'r2211', 'r2212', 'r2213', 'r2214', 'r2215', 'r2216', 'r2217', 'r2218', 'r2219', 'r2220', 'r2222', 'r2223', 'r2224', 'r2225', 'r2226', 'r2227', 'r2228', 'r2229', 'r2230', 'r2232', 'r2233', 'r2234', 'r2235', 'r2236', 'r2237', 'r2238', 'r2239', 'r2240', 'r2241', 'r2242', 'r2243', 'r2244', 'r2245', 'r2246', 'r2247', 'r2248', 'r2249', 'r2250', 'r2251', 'r2252', 'r2253', 'r2254', 'r2255', 'r2256', 'r2257', 'r2258', 'r2259', 'r2260', 'r2261', 'r2262', 'r2263', 'r2264', 'r2265', 'r2266', 'r2267', 'r2268', 'r2269', 'r2270', 'r2271', 'r2272', 'r2273', 'r2274', 'r2275', 'r2276', 'r2277', 'r2278', 'r2279', 'r2280', 'r2281', 'r2282', 'r2283', 'r2284', 'r2285', 'r2286', 'r2287', 'r2288', 'r2289', 'r2290', 'r2291', 'r2292', 'r2293', 'r2294', 'r2295', 'r2296', 'r2297', 'r2298', 'r2299', 'r2300', 'r2301', 'r2302', 'r2303', 'r2304', 'r2305', 'r2306', 'r2307', 'r2308', 'r2309', 'r2310', 'r2311', 'r2312', 'r2313', 'r2314', 'r2315', 'r2316', 'r2317', 'r2318', 'r2319', 'r2320', 'r2322', 'r2323', 'r2324', 'r2325', 'r2326', 'r2327', 'r2328', 'r2330', 'r2331', 'r2332', 'r2333', 'r2334', 'r2335', 'r2336', 'r2337', 'r2338', 'r2339', 'r2340', 'r2341', 'r2342', 'r2343', 'r2344', 'r2345', 'r2346', 'r2347', 'r2348', 'r2349', 'r2350', 'r2351', 'r2352', 'r2353', 'r2354', 'r2355', 'r2356', 'r2357', 'r2358', 'r2359', 'r2360', 'r2361', 'r2362', 'r2363', 'r2364', 'r2365', 'r2366', 'r2367', 'r2368', 'r2369', 'r2370', 'r2371', 'r2372', 'r2373', 'r2374', 'r2375', 'r2376', 'r2377', 'r2378', 'r2379', 'r2380', 'r2381', 'r2382', 'r2383', 'r2384', 'r2385', 'r2402', 'r2404', 'r2409', 'r2418', 'r2455', 'r2457', 'r2458', 'r2459', 'r2484', 'r2488', 'r2489', 'r2982', 'r2983', 'r2984', 'r2985', 'r2986', 'r2988', 'r2989', 'r2990', 'r2991', 'r2992', 'r2993', 'r2996', 'r2999', 'r3000', 'r3001', 'r3002', 'r3003', 'r3004', 'r3005', 'r3011', 'r3012', 'r3015', 'r3025', 'r3033', 'r3034', 'r3035', 'r3036', 'r3037', 'r3038', 'r3039', 'r3040', 'r3041', 'r3042', 'r3043', 'r3044', 'r3045', 'r3060', 'r3066', 'r3067', 'r3091', 'r3107', 'r3108', 'r3109', 'r3110', 'r3111', 'r3112', 'r3113', 'r3114', 'r3115', 'r3116', 'r3117', 'r3118', 'r3119', 'r3120', 'r3121', 'r3122', 'r3123', 'r3124', 'r3125', 'r3126', 'r3127', 'r3128', 'r3129', 'r3130', 'r3131', 'r3132', 'r3133', 'r3134', 'r3135', 'r3136', 'r3137', 'r3138', 'r3139', 'r3140', 'r3141', 'r3142', 'r3143', 'r3144', 'r3145', 'r3146', 'r3147', 'r3148', 'r3149', 'r3150', 'r3151', 'r3158', 'r3159', 'r3160', 'r3161', 'r3162', 'r3163', 'r3164', 'r3165', 'r3166', 'r3167', 'r3169', 'r3170', 'r3171', 'r3172', 'r3173', 'r3174', 'r3175', 'r3176', 'r3177', 'r3178', 'r3179', 'r3180', 'r3181', 'r3182', 'r3183', 'r3184', 'r3186', 'r3193', 'r3194', 'r3195', 'r3196', 'r3197', 'r3198', 'r3199', 'r3271', 'r3272', 'r3482', 'r3483', 'r3484', 'r3485', 'r3486', 'r3488', 'r3490', 'r3491', 'r3493', 'r3495', 'r3496', 'r3497', 'r3498', 'r3500', 'r3503', 'r3504', 'r3505', 'r3506', 'r3508', 'r3509', 'r3510', 'r3511', 'r3613', 'r3614', 'r3615', 'r3616', 'r3617', 'r3618', 'r3619', 'r3620', 'r3621', 'r3622', 'r3623', 'r3624', 'r3625', 'r3626', 'r3627', 'r3628', 'r3629', 'r3630', 'r3631', 'r3632', 'r3633', 'r3634', 'r3635', 'r3636', 'r3637', 'r3638', 'r3639', 'r3640', 'r3641', 'r3642', 'r3643', 'r3644', 'r3645', 'r3646', 'r3647', 'r3648', 'r3659', 'r3660', 'r3661', 'r3662', 'r3663', 'r3664', 'r3665', 'r3666', 'r3667', 'r3668', 'r3669', 'r3670', 'r3671', 'r3672', 'r3673', 'r3682', 'r3683', 'r3684', 'r3685', 'r3686', 'r3687', 'r3688', 'r3689', 'r3690', 'r3691', 'r3692', 'r3693', 'r3694', 'r3719', 'r3720', 'r3721', 'r3722', 'r3723', 'r3724', 'r3725', 'r3726', 'r3727', 'r3728', 'r3729', 'r3730', 'r3833', 'r3834', 'r3836', 'r3837', 'r3855', 'r3857', 'r3858', 'r3859', 'r3860', 'r3861', 'r3862', 'r3863', 'r3864', 'r3865', 'r3866', 'r3867', 'r3870', 'r3874', 'r4075', 'r4078', 'r4081', 'r4082', 'r4083', 'r4084', 'r4085', 'r4086', 'r4087', 'r4088', 'r4089', 'r4090', 'r4091', 'r4092', 'r4093', 'r4094', 'r4095', 'r4096', 'r4097', 'r4098', 'r4099', 'r4100', 'r4101', 'r4103', 'r4104', 'r4105', 'r4108', 'r4113', 'r4114', 'r4115', 'r4116', 'r4117', 'r4118', 'r4119', 'r4120', 'r4121', 'r4122', 'r4123', 'r4124', 'r4125', 'r4126', 'r4127', 'r4128', 'r4129', 'r4130', 'r4131', 'r4132', 'r4133', 'r4134', 'r4135', 'r4136', 'r4137', 'r4138', 'r4139', 'r4140', 'r4141', 'r4142', 'r4143', 'r4144', 'r4145', 'r4146', 'r4147', 'r4148'],
      government: { type: 'oligarchy', custom_name: null, legitimacy: 50, stability: 45, ruler: { type: 'council', name: 'Городской совет', character_ids: [], personal_power: 30 }, institutions: [], power_resource: { type: 'legitimacy', current: 50, decay_per_turn: 0.5, restored_by: ['trade_prosperity', 'peace'] }, elections: null, succession: null, conspiracies: null, transition_history: [], custom_mechanics: [], active_transition: null },
      population: { total: 22000, by_profession: { farmers: 8000, craftsmen: 5000, merchants: 5000, sailors: 2000, clergy: 1000, soldiers: 500, slaves: 500 }, happiness: 58, growth_rate: 0.001 },
      economy: { treasury: 2800, income_per_turn: 0, expense_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 8000, fish: 2000, horses: 500, cattle: 2000 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 100, ships: 12, mercenaries: 200, morale: 55, loyalty: 60, at_war_with: [] },
      relations: { syracuse: { score: -5, treaties: [], at_war: false }, carthage: { score: -5, treaties: [], at_war: false } },
      active_laws: [], characters: [],
    },

    // ════════════════════════════════════════════════════════════════
    // ГРЕЦИЯ И ЭГЕИДА
    // ════════════════════════════════════════════════════════════════

    // ── СПАРТА (Уровень A) ─────────────────────────────────────────
    sparta: {
      name: 'Спарта', adjective: 'спартанское', color: '#8B0000', flag_emoji: '🛡️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'military',
      government: {
        type: 'oligarchy', legitimacy: 65, stability: 60,
        ruler: { type: 'person', name: 'Клеомен II', personal_power: 55 },
      },
      regions: [],
      population: {
        total: 42000,
        by_profession: { farmers: 12000, craftsmen: 4000, merchants: 2000, sailors: 1000, clergy: 2000, soldiers: 8000, slaves: 13000 },
        happiness: 52, growth_rate: 0.001,
      },
      economy: {
        treasury: 2000, tax_rate: 0.08,
        primary_exports: ['iron', 'slaves'], primary_imports: ['wheat', 'trade_goods'],
        trade_partners: ['athens', 'argos', 'corinth'],
        stockpile: { wheat: 5000, fish: 800, iron: 600, horses: 300, cattle: 1200 },
        trade_routes: [],
      },
      military: { infantry: 8000, cavalry: 600, ships: 20, mercenaries: 500, morale: 85, loyalty: 80, at_war_with: [] },
      relations: {
        athens:   { score: -30, treaties: [], at_war: false },
        macedon:  { score: -40, treaties: [], at_war: false },
        argos:    { score: -20, treaties: [], at_war: false },
        epirus:   { score: 20,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Спарта переживает глубокий упадок: потеря Мессении подорвала экономику, а численность граждан-воинов катастрофически сократилась. Клеомен II царствует, но реальная власть у эфоров. Спарта пытается сохранить влияние на Пелопоннесе.',
    },

    // ── АФИНЫ (Уровень A) ──────────────────────────────────────────
    athens: {
      name: 'Афины', adjective: 'афинское', color: '#4169E1', flag_emoji: '🦉',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'oligarchy', legitimacy: 55, stability: 50,
        ruler: { type: 'person', name: 'Деметрий Фалерский', personal_power: 70 },
      },
      regions: [],
      population: {
        total: 155000,
        by_profession: { farmers: 40000, craftsmen: 30000, merchants: 25000, sailors: 15000, clergy: 5000, soldiers: 6000, slaves: 34000 },
        happiness: 48, growth_rate: 0.002,
      },
      economy: {
        treasury: 6000, tax_rate: 0.12,
        primary_exports: ['pottery', 'olive_oil', 'trade_goods'], primary_imports: ['wheat', 'timber', 'iron'],
        trade_partners: ['rhodes', 'bosporan_kingdom', 'corinth', 'sparta'],
        stockpile: { wheat: 18000, fish: 4000, iron: 1200, horses: 200, cattle: 800 },
        trade_routes: [],
      },
      military: { infantry: 6000, cavalry: 400, ships: 80, mercenaries: 2000, morale: 60, loyalty: 55, at_war_with: [] },
      relations: {
        sparta:            { score: -30, treaties: [], at_war: false },
        macedon:           { score: -50, treaties: [], at_war: false },
        antipatrid_kingdom:{ score: -40, treaties: [], at_war: false },
        rhodes:            { score: 30,  treaties: [], at_war: false },
        epirus:            { score: -10, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Афины управляются Деметрием Фалерским как наместником Кассандра. Демократия подавлена, но город процветает благодаря торговле. Осада Деметрия Полиоркета ещё впереди — пока Афины живут в относительном мире под македонским протекторатом.',
    },

    // ── РОДОС (Уровень A) ──────────────────────────────────────────
    rhodes: {
      name: 'Родос', adjective: 'родосское', color: '#FFD700', flag_emoji: '⚓',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'republic', legitimacy: 80, stability: 75,
        ruler: { type: 'council', name: 'Совет родосских навархов', personal_power: 65 },
      },
      regions: [],
      population: {
        total: 82000,
        by_profession: { farmers: 15000, craftsmen: 18000, merchants: 22000, sailors: 12000, clergy: 3000, soldiers: 3000, slaves: 9000 },
        happiness: 72, growth_rate: 0.003,
      },
      economy: {
        treasury: 15000, tax_rate: 0.10,
        primary_exports: ['trade_goods', 'pottery', 'olive_oil'], primary_imports: ['wheat', 'timber', 'iron'],
        trade_partners: ['athens', 'ptolemaic_kingdom', 'seleukid_empire', 'corinth'],
        stockpile: { wheat: 12000, fish: 6000, iron: 800, horses: 100, cattle: 400 },
        trade_routes: [],
      },
      military: { infantry: 3000, cavalry: 200, ships: 120, mercenaries: 1000, morale: 80, loyalty: 85, at_war_with: [] },
      relations: {
        athens:            { score: 30, treaties: [], at_war: false },
        ptolemaic_kingdom: { score: 40, treaties: [], at_war: false },
        seleukid_empire:   { score: 20, treaties: [], at_war: false },
        antigonid_kingdom: { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Родос — крупнейший торговый порт Восточного Средиземноморья, и именно сейчас Деметрий Полиоркет осаждает остров (осада 305–304 гг. до н.э.). Родосцы держатся стойко, и вскоре Деметрий снимет осаду, получив прозвище «Полиоркет» — Берущий города.',
    },

    // ── МАССАЛИЯ (Уровень A) ───────────────────────────────────────
    massilia: {
      name: 'Массалия', adjective: 'массалийское', color: '#228B22', flag_emoji: '🍷',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'republic', legitimacy: 75, stability: 70,
        ruler: { type: 'council', name: 'Совет шестисот', personal_power: 60 },
      },
      regions: [],
      population: {
        total: 26000,
        by_profession: { farmers: 5000, craftsmen: 6000, merchants: 7000, sailors: 4000, clergy: 1000, soldiers: 1000, slaves: 2000 },
        happiness: 68, growth_rate: 0.002,
      },
      economy: {
        treasury: 8000, tax_rate: 0.09,
        primary_exports: ['trade_goods', 'wine', 'olive_oil'], primary_imports: ['tin', 'amber', 'furs', 'slaves'],
        trade_partners: ['athens', 'rhodes', 'carthage'],
        stockpile: { wheat: 4000, fish: 2000, iron: 300, horses: 100, cattle: 500 },
        trade_routes: [],
      },
      military: { infantry: 1500, cavalry: 100, ships: 40, mercenaries: 500, morale: 70, loyalty: 75, at_war_with: [] },
      relations: {
        carthage: { score: -20, treaties: [], at_war: false },
        athens:   { score: 25,  treaties: [], at_war: false },
        rhodes:   { score: 30,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Массалия (совр. Марсель) — греческая колония, основанная фокейцами ок. 600 г. до н.э. В 304 г. она является главным торговым посредником между греческим миром и кельтской Галлией, обменивая вино и оливковое масло на янтарь, олово и меха варваров.',
    },

    // ── КОРИНФ (Уровень A) ─────────────────────────────────────────
    corinth: {
      name: 'Коринф', adjective: 'коринфское', color: '#B8860B', flag_emoji: '🏺',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'oligarchy', legitimacy: 40, stability: 35,
        ruler: { type: 'council', name: 'Македонский гарнизон', personal_power: 50 },
      },
      regions: [],
      population: {
        total: 18000,
        by_profession: { farmers: 4000, craftsmen: 5000, merchants: 4000, sailors: 2000, clergy: 1000, soldiers: 500, slaves: 1500 },
        happiness: 40, growth_rate: 0.001,
      },
      economy: {
        treasury: 3000, tax_rate: 0.12,
        primary_exports: ['pottery', 'bronze', 'trade_goods'], primary_imports: ['wheat', 'timber'],
        trade_partners: ['athens', 'sparta', 'rhodes'],
        stockpile: { wheat: 3000, fish: 1000, iron: 400, horses: 100, cattle: 300 },
        trade_routes: [],
      },
      military: { infantry: 1500, cavalry: 100, ships: 25, mercenaries: 500, morale: 50, loyalty: 45, at_war_with: [] },
      relations: {
        macedon:           { score: -30, treaties: [], at_war: false },
        antipatrid_kingdom:{ score: -20, treaties: [], at_war: false },
        athens:            { score: 10,  treaties: [], at_war: false },
        sparta:            { score: -10, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Коринф существует как стратегически важный город с македонским гарнизоном на Акрокоринфе — «оковы Эллады». Тот, кто держит Коринф, контролирует перешеек между Элладой и Пелопоннесом. Город постепенно восстанавливает торговое значение под македонской опекой.',
    },

    // ── БОСПОРСКОЕ ЦАРСТВО (Уровень A) ────────────────────────────
    bosporan_kingdom: {
      name: 'Боспорское царство', adjective: 'боспорское', color: '#4B0082', flag_emoji: '🌾',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'monarchy', legitimacy: 72, stability: 65,
        ruler: { type: 'person', name: 'Спарток III', personal_power: 75 },
      },
      regions: [],
      population: {
        total: 180000,
        by_profession: { farmers: 70000, craftsmen: 25000, merchants: 30000, sailors: 15000, clergy: 5000, soldiers: 10000, slaves: 25000 },
        happiness: 60, growth_rate: 0.002,
      },
      economy: {
        treasury: 12000, tax_rate: 0.12,
        primary_exports: ['wheat', 'fish', 'slaves', 'furs'], primary_imports: ['wine', 'pottery', 'olive_oil', 'trade_goods'],
        trade_partners: ['athens', 'rhodes', 'scythians'],
        stockpile: { wheat: 40000, fish: 12000, iron: 800, horses: 2000, cattle: 5000 },
        trade_routes: [],
      },
      military: { infantry: 8000, cavalry: 3000, ships: 60, mercenaries: 2000, morale: 70, loyalty: 70, at_war_with: [] },
      relations: {
        athens:    { score: 50, treaties: [], at_war: false },
        rhodes:    { score: 40, treaties: [], at_war: false },
        scythians: { score: 20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Боспорское царство контролирует ключевые торговые пути через Боспор Киммерийский. Спарток III — потомок фракийских тиранов — умело балансирует между греческой культурой и скифскими союзниками. Главный поставщик зерна в Афины: без боспорской пшеницы Аттика голодает.',
    },

    // ── ГРЕЦИЯ — Уровень B ─────────────────────────────────────────

    acarnania: {
      name: 'Акарнания', adjective: 'акарнанское', color: '#6B8E6B', flag_emoji: '🏛️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'federation', legitimacy: 60, stability: 58, ruler: { type: 'council', name: 'Акарнанский союз', personal_power: 50 } },
      regions: [],
      population: { total: 55000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 1800, tax_rate: 0.09, primary_exports: ['cattle', 'fish'], primary_imports: ['trade_goods', 'wheat'], trade_partners: ['epirus', 'aetolia'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 3500, cavalry: 300, ships: 15, mercenaries: 500, morale: 65, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Федерация городов Западной Греции. Зажата между Эпиром и Этолией, умело лавирует между великими державами ради сохранения независимости.',
    },

    aetolia: {
      name: 'Этолийский союз', adjective: 'этолийское', color: '#8B6914', flag_emoji: '⚡',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'federation', legitimacy: 65, stability: 60, ruler: { type: 'council', name: 'Стратег Этолийского союза', personal_power: 60 } },
      regions: [],
      population: { total: 80000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 2500, tax_rate: 0.10, primary_exports: ['slaves', 'cattle', 'furs'], primary_imports: ['trade_goods', 'iron'], trade_partners: ['epirus', 'macedon', 'acarnania'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 7000, cavalry: 500, ships: 10, mercenaries: 1000, morale: 78, loyalty: 75, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Этолийский союз стремительно усиливается после войн диадохов. Этолийцы — искусные воины и пираты, контролирующие пути через Центральную Грецию. В 304 г. союз уже является серьёзной региональной силой.',
    },

    boeotian_states: {
      name: 'Беотийский союз', adjective: 'беотийское', color: '#A0522D', flag_emoji: '🐂',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'federation', legitimacy: 45, stability: 42, ruler: { type: 'council', name: 'Беотархи', personal_power: 45 } },
      regions: [],
      population: { total: 60000, happiness: 44, growth_rate: 0.001 },
      economy: { treasury: 1500, tax_rate: 0.10, primary_exports: ['wheat', 'cattle'], primary_imports: ['trade_goods', 'timber'], trade_partners: ['athens', 'corinth'], stockpile: { wheat: 6000 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 800, ships: 5, mercenaries: 300, morale: 55, loyalty: 50, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Беотия так и не оправилась от разрушения Фив Александром в 335 г. до н.э. Союз существует, но лишён прежней силы священного отряда. Земля плодородна, но дух сломлен македонским господством.',
    },

    argos: {
      name: 'Аргос', adjective: 'аргосское', color: '#CD853F', flag_emoji: '🗡️',
      is_player: false, is_minor: true, ai_personality: 'opportunist', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 55, stability: 50, ruler: { type: 'council', name: 'Совет Аргоса', personal_power: 45 } },
      regions: [],
      population: { total: 45000, happiness: 52, growth_rate: 0.002 },
      economy: { treasury: 1200, tax_rate: 0.09, primary_exports: ['olive_oil', 'pottery'], primary_imports: ['wheat', 'iron'], trade_partners: ['sparta', 'corinth', 'athens'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 3000, cavalry: 400, ships: 8, mercenaries: 200, morale: 60, loyalty: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Аргос — древний соперник Спарты на Пелопоннесе. В 304 г. город под контролем промакедонской олигархии и осторожно маневрирует между интересами Кассандра и старых врагов из Лакедемона.',
    },

    eretria: {
      name: 'Эретрия', adjective: 'эретрийское', color: '#6495ED', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 55, stability: 52, ruler: { type: 'council', name: 'Совет Эретрии', personal_power: 50 } },
      regions: [],
      population: { total: 38000, happiness: 55, growth_rate: 0.002 },
      economy: { treasury: 2000, tax_rate: 0.10, primary_exports: ['trade_goods', 'pottery'], primary_imports: ['wheat', 'timber'], trade_partners: ['athens', 'macedon'], stockpile: { wheat: 3500 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 200, ships: 30, mercenaries: 300, morale: 60, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Эретрия — главный город острова Эвбея, традиционный союзник Афин. В 304 г. находится в орбите македонского влияния, но сохраняет автономию и активную морскую торговлю.',
    },

    megalopolis: {
      name: 'Мегалополь', adjective: 'мегалопольское', color: '#708090', flag_emoji: '🏔️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 50, stability: 48, ruler: { type: 'council', name: 'Совет Мегалополя', personal_power: 40 } },
      regions: [],
      population: { total: 22000, happiness: 50, growth_rate: 0.001 },
      economy: { treasury: 800, tax_rate: 0.09, primary_exports: ['cattle', 'timber'], primary_imports: ['wheat', 'trade_goods'], trade_partners: ['sparta', 'argos'], stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 1800, cavalry: 200, ships: 0, mercenaries: 100, morale: 55, loyalty: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Мегалополь основан Эпаминондом как противовес Спарте в центре Пелопоннеса. В 304 г. город выживает, лавируя между Спартой и македонскими интересами.',
    },

    tegea: {
      name: 'Тегея', adjective: 'тегейское', color: '#7B7B5A', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 55, stability: 55, ruler: { type: 'council', name: 'Совет Тегеи', personal_power: 45 } },
      regions: [],
      population: { total: 18000, happiness: 55, growth_rate: 0.001 },
      economy: { treasury: 600, tax_rate: 0.08, primary_exports: ['cattle'], primary_imports: ['wheat'], trade_partners: ['sparta', 'megalopolis'], stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 150, ships: 0, mercenaries: 100, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Аркадский город-союзник Спарты. Тегея поставляет гоплитов для спартанских армий и держится в стороне от большой политики диадохов.',
    },

    mantinea: {
      name: 'Мантинея', adjective: 'мантинейское', color: '#7B6B5A', flag_emoji: '🏛️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 52, stability: 50, ruler: { type: 'council', name: 'Совет Мантинеи', personal_power: 42 } },
      regions: [],
      population: { total: 16000, happiness: 53, growth_rate: 0.001 },
      economy: { treasury: 500, tax_rate: 0.08, primary_exports: ['cattle'], primary_imports: ['wheat', 'iron'], trade_partners: ['sparta', 'argos'], stockpile: { wheat: 1800 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 120, ships: 0, mercenaries: 0, morale: 60, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'У стен Мантинеи погиб Эпаминонд в 362 г. до н.э., изменив судьбу Греции. В 304 г. город восстановлен после разрушения спартанцами и существует под тенью македонского господства.',
    },

    troizen: {
      name: 'Трезен', adjective: 'трезенское', color: '#7B8B6B', flag_emoji: '🏛️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 55, stability: 55, ruler: { type: 'council', name: 'Совет Трезена', personal_power: 40 } },
      regions: [],
      population: { total: 12000, happiness: 58, growth_rate: 0.001 },
      economy: { treasury: 400, tax_rate: 0.08, primary_exports: ['olive_oil', 'fish'], primary_imports: ['wheat'], trade_partners: ['athens', 'sparta'], stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 900, cavalry: 80, ships: 10, mercenaries: 0, morale: 62, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Небольшой пелопоннесский город, родина Тесея по мифам. В 304 г. номинально независим, но находится в орбите Аргоса.',
    },

    messenia: {
      name: 'Мессения', adjective: 'мессенское', color: '#5F7A5F', flag_emoji: '🌾',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 62, stability: 58, ruler: { type: 'council', name: 'Совет Мессены', personal_power: 50 } },
      regions: [],
      population: { total: 50000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 1400, tax_rate: 0.09, primary_exports: ['wheat', 'cattle'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['epirus', 'athens', 'sparta'], stockpile: { wheat: 7000 }, trade_routes: [] },
      military: { infantry: 4000, cavalry: 300, ships: 5, mercenaries: 200, morale: 72, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Освобождённая Эпаминондом в 369 г. до н.э. после четырёх веков спартанского рабства, Мессения яростно охраняет свободу. Город Мессена — хорошо укреплённая цитадель на склонах Ифомы, ненавидимая Спартой.',
    },

    locri: {
      name: 'Локры Эпизефирские', adjective: 'локрийское', color: '#8FAF8F', flag_emoji: '🏛️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 55, stability: 55, ruler: { type: 'council', name: 'Совет Локров', personal_power: 45 } },
      regions: [],
      population: { total: 15000, happiness: 55, growth_rate: 0.001 },
      economy: { treasury: 700, tax_rate: 0.10, primary_exports: ['olive_oil', 'trade_goods'], primary_imports: ['wheat', 'iron'], trade_partners: ['rhegium', 'taras', 'corinth'], stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 80, ships: 12, mercenaries: 100, morale: 60, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческая колония на носке итальянского «сапога». В 304 г. зажата между сиракузской и бруттийской угрозами, ищет сильных союзников.',
    },

    croton: {
      name: 'Кротон', adjective: 'кротонское', color: '#9F8FAF', flag_emoji: '🏃',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 50, stability: 48, ruler: { type: 'council', name: 'Совет Кротона', personal_power: 44 } },
      regions: [],
      population: { total: 20000, happiness: 50, growth_rate: 0.001 },
      economy: { treasury: 900, tax_rate: 0.10, primary_exports: ['olive_oil', 'cattle'], primary_imports: ['wheat', 'iron'], trade_partners: ['taras', 'locri', 'rhegium'], stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 100, ships: 15, mercenaries: 200, morale: 55, loyalty: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Некогда великий город пифагорейской школы и олимпийских чемпионов. В 304 г. значительно ослаблен войнами с бруттиями и луканами, ищет защиту у Тарента или Сиракуз.',
    },

    metapontum: {
      name: 'Метапонт', adjective: 'метапонтское', color: '#AF9F6F', flag_emoji: '🌾',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'survival',
      government: { type: 'oligarchy', legitimacy: 52, stability: 50, ruler: { type: 'council', name: 'Совет Метапонта', personal_power: 42 } },
      regions: [],
      population: { total: 18000, happiness: 52, growth_rate: 0.001 },
      economy: { treasury: 1000, tax_rate: 0.10, primary_exports: ['wheat', 'cattle'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['taras', 'croton'], stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 120, ships: 10, mercenaries: 100, morale: 55, loyalty: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Метапонт — зернопроизводящая греческая колония в Луканском заливе. Именно здесь умер Пифагор. В 304 г. город под постоянным давлением луканских племён.',
    },

    brundisium: {
      name: 'Брундизий', adjective: 'брундизийское', color: '#7FAF9F', flag_emoji: '⚓',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 55, stability: 55, ruler: { type: 'council', name: 'Совет Брундизия', personal_power: 48 } },
      regions: [],
      population: { total: 16000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 1200, tax_rate: 0.10, primary_exports: ['trade_goods', 'fish'], primary_imports: ['wheat', 'timber'], trade_partners: ['taras', 'rome', 'epirus'], stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 80, ships: 20, mercenaries: 100, morale: 60, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Будущие главные ворота Рима в Грецию. В 304 г. Брундизий — ещё небольшой мессапский порт, стратегически важный для переправы через Адриатику. Рим начинает проявлять к нему интерес.',
    },

    // ── ИЛЛИРИЯ И БАЛКАНЫ — Уровень B ─────────────────────────────

    taulantii: {
      name: 'Тавлантии', adjective: 'тавлантийское', color: '#8B7355', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 65, stability: 60, ruler: { type: 'tribal_chief', name: 'Главин', personal_power: 70 } },
      regions: [],
      population: { total: 60000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 1200, tax_rate: 0.07, primary_exports: ['slaves', 'cattle', 'furs'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['epirus', 'macedon'], stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 6000, cavalry: 800, ships: 5, mercenaries: 0, morale: 72, loyalty: 75, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Мощное иллирийское племя, господствующее над побережьем Адриатики к северу от Эпира. Регулярно воюет с Македонией и Эпиром, поставляет пиратов и наёмников для всей Греции.',
    },

    histri: {
      name: 'Гистры', adjective: 'гистрское', color: '#7B7B8B', flag_emoji: '🗡️',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 60, stability: 58, ruler: { type: 'tribal_chief', name: 'Вождь гистров', personal_power: 65 } },
      regions: [],
      population: { total: 45000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 800, tax_rate: 0.06, primary_exports: ['furs', 'amber', 'slaves'], primary_imports: ['iron', 'salt'], trade_partners: ['veneti', 'taulantii'], stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 400, ships: 20, mercenaries: 0, morale: 68, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Иллирийское племя на оконечности Истрийского полуострова. Известны пиратством на севере Адриатики, тревожат венетских и греческих торговцев.',
    },

    scordisci: {
      name: 'Скордиски', adjective: 'скордискское', color: '#6B5B3B', flag_emoji: '🪓',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 60, stability: 55, ruler: { type: 'tribal_chief', name: 'Вождь скордисков', personal_power: 65 } },
      regions: [],
      population: { total: 50000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 900, tax_rate: 0.07, primary_exports: ['slaves', 'cattle', 'iron'], primary_imports: ['trade_goods', 'wine'], trade_partners: ['macedon', 'dardani'], stockpile: { wheat: 2800 }, trade_routes: [] },
      military: { infantry: 6000, cavalry: 600, ships: 0, mercenaries: 0, morale: 72, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Кельтское племя на слиянии Савы и Дуная. В 304 г. только укрепляется в регионе — их набеги на Македонию и Грецию станут настоящей угрозой в III–II вв. до н.э.',
    },

    dardani: {
      name: 'Дарданцы', adjective: 'дарданское', color: '#5B4B3B', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 62, stability: 58, ruler: { type: 'tribal_chief', name: 'Вождь дарданцев', personal_power: 68 } },
      regions: [],
      population: { total: 40000, happiness: 56, growth_rate: 0.002 },
      economy: { treasury: 700, tax_rate: 0.07, primary_exports: ['slaves', 'cattle'], primary_imports: ['iron', 'salt'], trade_partners: ['macedon', 'scordisci'], stockpile: { wheat: 2200 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 500, ships: 0, mercenaries: 0, morale: 70, loyalty: 72, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Иллирийское племя во внутренних Балканах, постоянная угроза Македонии с севера. Дарданцы неоднократно вторгались в Македонию, и в IV–III вв. до н.э. они один из главных врагов македонских царей.',
    },

    liburnians: {
      name: 'Либурны', adjective: 'либурнское', color: '#4F7F9F', flag_emoji: '⛵',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'tribal', legitimacy: 58, stability: 55, ruler: { type: 'tribal_chief', name: 'Вождь либурнов', personal_power: 60 } },
      regions: [],
      population: { total: 25000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 900, tax_rate: 0.08, primary_exports: ['fish', 'trade_goods', 'slaves'], primary_imports: ['iron', 'wheat'], trade_partners: ['histri', 'veneti', 'taulantii'], stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 100, ships: 30, mercenaries: 0, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Иллирийские мореплаватели Адриатики. Либурнские либурны — лёгкие суда с двойным рядом вёсел — станут образцом для римских бирем. В 304 г. либурны активно торгуют и пиратствуют.',
    },

    // ── УРОВЕНЬ C — малые греческие города и племена ──────────────

    stymphalia: {
      name: 'Стимфалия', color: '#9B9B8B', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Стимфалии' } },
      regions: [],
      population: { total: 8000, happiness: 54 },
      economy: { treasury: 300, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 600, cavalry: 40, ships: 0, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Аркадский городок у одноимённого озера — легендарного места подвига Геракла.',
    },

    pellene: {
      name: 'Пеллена', color: '#9B8B7B', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Пеллены' } },
      regions: [],
      population: { total: 10000, happiness: 55 },
      economy: { treasury: 350, stockpile: { wheat: 1000 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 50, ships: 5, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ахейский город на севере Пелопоннеса, известный производством тонкой шерсти.',
    },

    dyme: {
      name: 'Диме', color: '#8B9B8B', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Диме' } },
      regions: [],
      population: { total: 9000, happiness: 55 },
      economy: { treasury: 320, stockpile: { wheat: 900 }, trade_routes: [] },
      military: { infantry: 600, cavalry: 40, ships: 8, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Западный портовый город Ахайи, будущий член Ахейского союза.',
    },

    patrai: {
      name: 'Патры', color: '#7B8B9B', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Патр' } },
      regions: [],
      population: { total: 12000, happiness: 56 },
      economy: { treasury: 500, stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 50, ships: 12, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ахейский портовый город на берегу Коринфского залива, важный для переправы в Этолию.',
    },

    epidauros: {
      name: 'Эпидавр', color: '#9BAF8B', flag_emoji: '🐍',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Эпидавра' } },
      regions: [],
      population: { total: 14000, happiness: 65 },
      economy: { treasury: 800, stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 60, ships: 10, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Священный город со знаменитым святилищем Асклепия — центром греческой медицины. Паломники со всего греческого мира приносят богатые дары.',
    },

    elatea: {
      name: 'Элатея', color: '#8BAF9B', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Элатеи' } },
      regions: [],
      population: { total: 10000, happiness: 48 },
      economy: { treasury: 400, stockpile: { wheat: 900 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 50, ships: 0, morale: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Стратегически важная крепость в Фокиде, контролирующая проходы через Центральную Грецию.',
    },

    amphissa: {
      name: 'Амфисса', color: '#AF9B7B', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Амфиссы' } },
      regions: [],
      population: { total: 8000, happiness: 50 },
      economy: { treasury: 350, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 600, cavalry: 30, ships: 0, morale: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Локрийский город у Дельф, чей спор из-за священных земель спровоцировал IV Священную войну и вмешательство Македонии.',
    },


    // ════════════════════════════════════════════════════════════════
    // ИТАЛИЯ
    // ════════════════════════════════════════════════════════════════

    // ── ЭТРУССКИЙ СОЮЗ (Уровень A) ─────────────────────────────────
    etruscan_conf: {
      name: 'Этрусский союз', adjective: 'этрусское', color: '#8B4513', flag_emoji: '🏺',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'federation', legitimacy: 52, stability: 45,
        ruler: { type: 'council', name: 'Совет двенадцати городов', personal_power: 40 },
      },
      regions: [],
      population: {
        total: 500000,
        by_profession: { farmers: 180000, craftsmen: 100000, merchants: 70000, sailors: 30000, clergy: 30000, soldiers: 30000, slaves: 60000 },
        happiness: 44, growth_rate: 0.001,
      },
      economy: {
        treasury: 18000, tax_rate: 0.11,
        primary_exports: ['iron', 'bronze', 'pottery', 'trade_goods'],
        primary_imports: ['wheat', 'slaves', 'timber'],
        trade_partners: ['rome', 'massilia', 'carthage'],
        stockpile: { wheat: 35000, fish: 5000, iron: 5000, horses: 1000, cattle: 8000 },
        trade_routes: [],
      },
      military: { infantry: 25000, cavalry: 2000, ships: 40, mercenaries: 3000, morale: 52, loyalty: 48, at_war_with: [] },
      relations: {
        rome:    { score: -40, treaties: [], at_war: false },
        samnites:{ score: 20,  treaties: [], at_war: false },
        carthage:{ score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Этрурия стремительно слабеет под натиском Рима. Двенадцатиградный союз раздроблен, каждый город думает о себе. Цере (Черветери) уже в союзе с Римом, Вейи завоёваны в 396 г. Богатства Этрурии — железо горы Амиата, бронзовые изделия, торговля — постепенно переходят под контроль Рима.',
    },

    // ── САМНИТЫ (Уровень A) ────────────────────────────────────────
    samnites: {
      name: 'Самниты', adjective: 'самнитское', color: '#6B8B3B', flag_emoji: '🐺',
      is_player: false, is_minor: false,
      ai_personality: 'aggressive', ai_priority: 'military',
      government: {
        type: 'federation', legitimacy: 70, stability: 62,
        ruler: { type: 'person', name: 'Гай Понтий', personal_power: 78 },
      },
      regions: [],
      population: {
        total: 350000,
        by_profession: { farmers: 140000, craftsmen: 50000, merchants: 20000, sailors: 5000, clergy: 15000, soldiers: 50000, slaves: 70000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 8000, tax_rate: 0.09,
        primary_exports: ['iron', 'cattle', 'slaves', 'wool'],
        primary_imports: ['trade_goods', 'wheat', 'pottery'],
        trade_partners: ['lucani', 'taras', 'etruscan_conf'],
        stockpile: { wheat: 25000, fish: 2000, iron: 4000, horses: 3000, cattle: 12000 },
        trade_routes: [],
      },
      military: { infantry: 25000, cavalry: 3000, ships: 5, mercenaries: 1000, morale: 82, loyalty: 80, at_war_with: ['rome'] },
      relations: {
        rome:        { score: -80, treaties: [], at_war: true  },
        lucani:      { score: 30,  treaties: [], at_war: false },
        etruscan_conf:{ score: 20, treaties: [], at_war: false },
        taras:       { score: 25,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Самния завершает Вторую Самнитскую войну с Римом (327–304 гг.). Гай Понтий выиграл битву при Кавдинских Ущельях, унизив Рим, но мир оказался непрочным. Самниты — самый упорный враг римской экспансии, их горные легионы превосходят римлян в тактике засад.',
    },

    // ── ЛУКАНЦЫ (Уровень A) ────────────────────────────────────────
    lucani: {
      name: 'Луканцы', adjective: 'луканское', color: '#5B7B4B', flag_emoji: '🗡️',
      is_player: false, is_minor: false,
      ai_personality: 'aggressive', ai_priority: 'military',
      government: {
        type: 'tribal', legitimacy: 60, stability: 55,
        ruler: { type: 'tribal_chief', name: 'Совет луканских вождей', personal_power: 55 },
      },
      regions: [],
      population: {
        total: 250000,
        by_profession: { farmers: 100000, craftsmen: 35000, merchants: 15000, sailors: 8000, clergy: 12000, soldiers: 40000, slaves: 40000 },
        happiness: 56, growth_rate: 0.002,
      },
      economy: {
        treasury: 5000, tax_rate: 0.08,
        primary_exports: ['cattle', 'slaves', 'timber', 'iron'],
        primary_imports: ['trade_goods', 'pottery', 'olive_oil'],
        trade_partners: ['samnites', 'brutii', 'taras'],
        stockpile: { wheat: 18000, fish: 3000, iron: 2000, horses: 2000, cattle: 10000 },
        trade_routes: [],
      },
      military: { infantry: 18000, cavalry: 2500, ships: 0, mercenaries: 500, morale: 72, loyalty: 70, at_war_with: [] },
      relations: {
        samnites:  { score: 30,  treaties: [], at_war: false },
        brutii:    { score: 25,  treaties: [], at_war: false },
        taras:     { score: -20, treaties: [], at_war: false },
        rome:      { score: -30, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Луканцы занимают большую часть Южной Италии, тесня греческие колонии. В 304 г. они союзники самнитов против Рима и регулярно воюют с Тарентом за влияние над греческими городами Апулии и Кампании.',
    },

    // ── УМБРИЙЦЫ (Уровень A) ───────────────────────────────────────
    umbrians: {
      name: 'Умбрийцы', adjective: 'умбрийское', color: '#7B6B4B', flag_emoji: '🌲',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'tribal', legitimacy: 50, stability: 45,
        ruler: { type: 'council', name: 'Совет умбрийских городов', personal_power: 42 },
      },
      regions: [],
      population: {
        total: 200000,
        by_profession: { farmers: 90000, craftsmen: 35000, merchants: 20000, sailors: 5000, clergy: 12000, soldiers: 18000, slaves: 20000 },
        happiness: 45, growth_rate: 0.001,
      },
      economy: {
        treasury: 4000, tax_rate: 0.09,
        primary_exports: ['timber', 'cattle', 'iron', 'slaves'],
        primary_imports: ['trade_goods', 'pottery', 'wheat'],
        trade_partners: ['rome', 'etruscan_conf', 'samnites'],
        stockpile: { wheat: 15000, fish: 1500, iron: 1500, horses: 800, cattle: 7000 },
        trade_routes: [],
      },
      military: { infantry: 15000, cavalry: 1000, ships: 0, mercenaries: 500, morale: 55, loyalty: 50, at_war_with: [] },
      relations: {
        rome:         { score: -30, treaties: [], at_war: false },
        etruscan_conf:{ score: 10,  treaties: [], at_war: false },
        samnites:     { score: 15,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Умбрийцы населяют Апеннины к северу от Самнии. Их романизация ускоряется после основания римских колоний: Нарния (299 г.) и другие форпосты отрезают умбрийские племена друг от друга. К 304 г. часть городов уже заключила союз с Римом.',
    },

    // ── ТАРЕНТ (Уровень A) ────────────────────────────────────────
    taras: {
      name: 'Тарент', adjective: 'тарентское', color: '#1E90FF', flag_emoji: '🐬',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'oligarchy', legitimacy: 62, stability: 55,
        ruler: { type: 'council', name: 'Совет Тарента', personal_power: 55 },
      },
      regions: [],
      population: {
        total: 85000,
        by_profession: { farmers: 18000, craftsmen: 20000, merchants: 18000, sailors: 12000, clergy: 4000, soldiers: 5000, slaves: 8000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 9000, tax_rate: 0.12,
        primary_exports: ['trade_goods', 'wool', 'fish', 'pottery'],
        primary_imports: ['wheat', 'timber', 'iron', 'slaves'],
        trade_partners: ['syracuse', 'epirus', 'corinth', 'athens'],
        stockpile: { wheat: 10000, fish: 5000, iron: 800, horses: 300, cattle: 1500 },
        trade_routes: [],
      },
      military: { infantry: 5000, cavalry: 600, ships: 50, mercenaries: 3000, morale: 65, loyalty: 60, at_war_with: [] },
      relations: {
        syracuse:  { score: 30,  treaties: [], at_war: false },
        epirus:    { score: 40,  treaties: [], at_war: false },
        rome:      { score: -25, treaties: [], at_war: false },
        lucani:    { score: -20, treaties: [], at_war: false },
        samnites:  { score: 25,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Тарент — богатейший греческий город Италии, «пята итальянского сапога». В 304 г. он ведёт постоянные войны с луканами и мессапами, нанимает иностранных полководцев. Скоро Тарент призовёт Пирра Эпирского, что положит начало Пирровой войне с Римом.',
    },

    // ── РЕГИЙ (Уровень A) ─────────────────────────────────────────
    rhegium: {
      name: 'Регий', adjective: 'регийское', color: '#20B2AA', flag_emoji: '⚓',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'oligarchy', legitimacy: 58, stability: 52,
        ruler: { type: 'council', name: 'Совет Регия', personal_power: 50 },
      },
      regions: [],
      population: {
        total: 28000,
        by_profession: { farmers: 6000, craftsmen: 7000, merchants: 6000, sailors: 4000, clergy: 1500, soldiers: 1000, slaves: 2500 },
        happiness: 55, growth_rate: 0.002,
      },
      economy: {
        treasury: 3500, tax_rate: 0.11,
        primary_exports: ['trade_goods', 'fish', 'olive_oil'],
        primary_imports: ['wheat', 'timber', 'iron'],
        trade_partners: ['syracuse', 'taras', 'locri', 'carthage'],
        stockpile: { wheat: 4000, fish: 3000, iron: 400, horses: 100, cattle: 600 },
        trade_routes: [],
      },
      military: { infantry: 2000, cavalry: 100, ships: 25, mercenaries: 500, morale: 62, loyalty: 60, at_war_with: [] },
      relations: {
        syracuse: { score: -10, treaties: [], at_war: false },
        taras:    { score: 20,  treaties: [], at_war: false },
        locri:    { score: 15,  treaties: [], at_war: false },
        brutii:   { score: -30, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Регий контролирует северный берег Мессинского пролива — жизненно важный перекрёсток между Италией и Сицилией. Город-страж пролива, соперник Сиракуз за контроль над торговлей между двумя морями.',
    },


    // ── ИТАЛИЯ — Уровень B ─────────────────────────────────────────

    brutii: {
      name: 'Бруттии', adjective: 'бруттийское', color: '#6B5B3B', flag_emoji: '🗡️',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 58, stability: 55, ruler: { type: 'tribal_chief', name: 'Совет бруттийских вождей', personal_power: 60 } },
      regions: [],
      population: { total: 120000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 2500, tax_rate: 0.08, primary_exports: ['timber', 'cattle', 'slaves'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['lucani', 'locri', 'rhegium'], stockpile: { wheat: 8000 }, trade_routes: [] },
      military: { infantry: 10000, cavalry: 800, ships: 5, mercenaries: 500, morale: 70, loyalty: 68, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Бруттии — горные племена на носке итальянского «сапога». Постоянно воюют с греческими колониями Южной Италии и луканами за пастбища и морское побережье.',
    },

    frentani: {
      name: 'Френтаны', adjective: 'френтанское', color: '#7B6B4B', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'tribal_chief', name: 'Вождь френтанов', personal_power: 55 } },
      regions: [],
      population: { total: 60000, happiness: 55, growth_rate: 0.002 },
      economy: { treasury: 1200, tax_rate: 0.08, primary_exports: ['cattle', 'wool', 'slaves'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['samnites', 'rome'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 500, ships: 0, mercenaries: 0, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Италийское племя на адриатическом побережье к северу от Самнии. В 304 г. входят в орбиту самнитского влияния, но постепенно попадают под контроль Рима.',
    },

    picentes: {
      name: 'Пиценты', adjective: 'пицентское', color: '#8B7B5B', flag_emoji: '🌾',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'tribal_chief', name: 'Вождь пиценов', personal_power: 55 } },
      regions: [],
      population: { total: 80000, happiness: 54, growth_rate: 0.002 },
      economy: { treasury: 1800, tax_rate: 0.09, primary_exports: ['wheat', 'cattle', 'fish'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['rome', 'samnites', 'umbrians'], stockpile: { wheat: 8000 }, trade_routes: [] },
      military: { infantry: 6000, cavalry: 400, ships: 10, mercenaries: 0, morale: 62, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Пиченум — плодородная область на адриатическом побережье. Пиценты в 304 г. попали в зависимость от Рима по итогам Самнитских войн, но сохраняют автономию.',
    },

    marsi: {
      name: 'Марсы', adjective: 'марсийское', color: '#5B6B3B', flag_emoji: '🐍',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 60, stability: 58, ruler: { type: 'tribal_chief', name: 'Вождь марсов', personal_power: 60 } },
      regions: [],
      population: { total: 70000, happiness: 56, growth_rate: 0.002 },
      economy: { treasury: 1500, tax_rate: 0.08, primary_exports: ['cattle', 'iron', 'slaves'], primary_imports: ['trade_goods', 'salt'], trade_partners: ['rome', 'samnites', 'umbrians'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 6500, cavalry: 600, ships: 0, mercenaries: 0, morale: 72, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Марсы — воинственное италийское племя Апеннин, союзники Рима. Их отличные солдаты стали основой римских союзнических контингентов. Позднее марсы поднимут Союзническую войну (91–88 гг. до н.э.) за право на римское гражданство.',
    },

    sabinia: {
      name: 'Сабины', adjective: 'сабинское', color: '#6B5B2B', flag_emoji: '🌾',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'council', name: 'Сенат сабинских городов', personal_power: 48 } },
      regions: [],
      population: { total: 90000, happiness: 50, growth_rate: 0.002 },
      economy: { treasury: 1800, tax_rate: 0.09, primary_exports: ['cattle', 'wheat', 'wool'], primary_imports: ['trade_goods', 'salt'], trade_partners: ['rome', 'umbrians'], stockpile: { wheat: 8000 }, trade_routes: [] },
      military: { infantry: 7000, cavalry: 600, ships: 0, mercenaries: 0, morale: 60, loyalty: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Сабины населяют горные долины к северо-востоку от Рима. В 304 г. они уже в значительной мере романизированы и подчинены Риму, но сохраняют собственную идентичность.',
    },

    apulians: {
      name: 'Апулийцы', adjective: 'апулийское', color: '#9B8B5B', flag_emoji: '🌾',
      is_player: false, is_minor: true, ai_personality: 'opportunist', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 52, stability: 50, ruler: { type: 'council', name: 'Вожди Апулии', personal_power: 45 } },
      regions: [],
      population: { total: 130000, happiness: 52, growth_rate: 0.002 },
      economy: { treasury: 3000, tax_rate: 0.09, primary_exports: ['wheat', 'cattle', 'olive_oil'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['taras', 'rome', 'samnites'], stockpile: { wheat: 12000 }, trade_routes: [] },
      military: { infantry: 9000, cavalry: 1500, ships: 5, mercenaries: 500, morale: 60, loyalty: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Апулия — плодородная равнина на «каблуке» итальянского сапога. Апулийские племена зажаты между самнитами, луканами и тарентинцами, при первой возможности ищут союза с Римом.',
    },

    messapians: {
      name: 'Мессапы', adjective: 'мессапское', color: '#7B8B6B', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 58, stability: 55, ruler: { type: 'tribal_chief', name: 'Вождь мессапов', personal_power: 60 } },
      regions: [],
      population: { total: 100000, happiness: 56, growth_rate: 0.002 },
      economy: { treasury: 2200, tax_rate: 0.08, primary_exports: ['cattle', 'olive_oil', 'fish'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['taras', 'brundisium', 'apulians'], stockpile: { wheat: 8000 }, trade_routes: [] },
      military: { infantry: 8000, cavalry: 1200, ships: 10, mercenaries: 0, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Мессапы — иллирийского происхождения, населяют «каблук» Апулии. Постоянные соперники Тарента, но связаны с ним торгово. В 304 г. поддерживают самнитов как противовес греческому и римскому влиянию.',
    },

    veneti: {
      name: 'Венеты', adjective: 'венетское', color: '#5B7B9B', flag_emoji: '🐴',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'economy',
      government: { type: 'federation', legitimacy: 65, stability: 62, ruler: { type: 'council', name: 'Совет венетских городов', personal_power: 55 } },
      regions: [],
      population: { total: 200000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 5000, tax_rate: 0.09, primary_exports: ['horses', 'amber', 'trade_goods'], primary_imports: ['iron', 'wine', 'salt'], trade_partners: ['rome', 'histri', 'massilia'], stockpile: { wheat: 15000 }, trade_routes: [] },
      military: { infantry: 12000, cavalry: 3000, ships: 20, mercenaries: 0, morale: 65, loyalty: 68, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Венеты — индоевропейское племя, давние союзники Рима против кельтов Цизальпии. Их лошади считаются лучшими в Италии. Город Патавий (Падуя) уже важный торговый центр.',
    },

    insubri: {
      name: 'Инсубры', adjective: 'инсубрское', color: '#3B6B3B', flag_emoji: '🪓',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 65, stability: 60, ruler: { type: 'tribal_chief', name: 'Вождь инсубров', personal_power: 70 } },
      regions: [],
      population: { total: 150000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 3500, tax_rate: 0.07, primary_exports: ['iron', 'amber', 'furs', 'slaves'], primary_imports: ['wine', 'trade_goods', 'salt'], trade_partners: ['cenomanni', 'rome', 'massilia'], stockpile: { wheat: 10000 }, trade_routes: [] },
      military: { infantry: 18000, cavalry: 2000, ships: 0, mercenaries: 0, morale: 78, loyalty: 75, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Инсубры — крупнейшее кельтское племя Цизальпийской Галлии, основавшее Медиолан (Милан). В 304 г. они постоянная угроза для северных союзников Рима и венетов. Железо рудников Бергамо — основа их военной силы.',
    },

    cenomanni: {
      name: 'Ценоманны', adjective: 'ценоманнское', color: '#4B7B4B', flag_emoji: '🛡️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 60, stability: 58, ruler: { type: 'tribal_chief', name: 'Вождь ценоманнов', personal_power: 65 } },
      regions: [],
      population: { total: 130000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 3000, tax_rate: 0.07, primary_exports: ['amber', 'furs', 'cattle'], primary_imports: ['iron', 'salt', 'wine'], trade_partners: ['insubri', 'veneti', 'boii'], stockpile: { wheat: 9000 }, trade_routes: [] },
      military: { infantry: 15000, cavalry: 1500, ships: 0, mercenaries: 0, morale: 72, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Кельтское племя Цизальпийской Галлии к востоку от инсубров. Позднее станут союзниками Рима против галлов и карфагенян, отличившись в битве при Магнезии.',
    },

    boii: {
      name: 'Бойи', adjective: 'бойское', color: '#2B5B2B', flag_emoji: '🪓',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 65, stability: 60, ruler: { type: 'tribal_chief', name: 'Вождь бойев', personal_power: 72 } },
      regions: [],
      population: { total: 160000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 3200, tax_rate: 0.07, primary_exports: ['furs', 'slaves', 'amber', 'cattle'], primary_imports: ['iron', 'wine', 'salt'], trade_partners: ['insubri', 'lingones', 'senones'], stockpile: { wheat: 10000 }, trade_routes: [] },
      military: { infantry: 20000, cavalry: 2500, ships: 0, mercenaries: 0, morale: 78, loyalty: 75, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Бойи населяют Цизальпийскую Галлию вокруг будущей Бононии (Болонья). Неустанные враги Рима, именно они вместе с инсубрами нанесут Риму поражение при Клузии в 295 г. Их имя сохранилось в названии Богемии (Бойо-гемум).',
    },

    senones: {
      name: 'Сеноны', adjective: 'сенонское', color: '#1B4B1B', flag_emoji: '🔥',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 62, stability: 58, ruler: { type: 'tribal_chief', name: 'Вождь сенонов', personal_power: 70 } },
      regions: [],
      population: { total: 80000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 2000, tax_rate: 0.07, primary_exports: ['slaves', 'furs', 'cattle'], primary_imports: ['iron', 'wine'], trade_partners: ['boii', 'umbrians', 'rome'], stockpile: { wheat: 6000 }, trade_routes: [] },
      military: { infantry: 12000, cavalry: 1500, ships: 0, mercenaries: 0, morale: 78, loyalty: 72, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Сеноны — те самые галлы, что разграбили Рим в 390 г. до н.э. Их территория на адриатическом побережье (Сена-Галлика) — постоянный источник угрозы. В 295 г. римляне уничтожат основную часть племени.',
    },

    lingones: {
      name: 'Лингоны', adjective: 'лингонское', color: '#4B6B2B', flag_emoji: '🌲',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 58, stability: 55, ruler: { type: 'tribal_chief', name: 'Вождь лингонов', personal_power: 58 } },
      regions: [],
      population: { total: 100000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 2200, tax_rate: 0.07, primary_exports: ['furs', 'amber', 'cattle'], primary_imports: ['iron', 'salt', 'wine'], trade_partners: ['boii', 'sequani', 'senones'], stockpile: { wheat: 7000 }, trade_routes: [] },
      military: { infantry: 12000, cavalry: 1500, ships: 0, mercenaries: 0, morale: 68, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Кельтское племя между Юрой и Альпами. В 304 г. лингоны только обосновались в Цизальпийской Галлии после переправы через Альпы — их имя сохранилось в названии Лангра.',
    },

    // ── ИТАЛИЯ — Уровень C ─────────────────────────────────────────

    vestini: {
      name: 'Вестины', color: '#7B6B4B', flag_emoji: '⚔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь вестинов' } },
      regions: [],
      population: { total: 35000, happiness: 55 },
      economy: { treasury: 700, stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 3000, cavalry: 250, ships: 0, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Самнитское племя в горах Апеннин, союзники Рима с 304 г. до н.э.',
    },

    paeligni: {
      name: 'Пелигны', color: '#6B5B3B', flag_emoji: '⚔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь пелигнов' } },
      regions: [],
      population: { total: 30000, happiness: 55 },
      economy: { treasury: 600, stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 200, ships: 0, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Горное самнитское племя Центральных Апеннин, родина поэта Овидия.',
    },

    marrucini: {
      name: 'Марруцины', color: '#7B7B4B', flag_emoji: '⚔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь марруцинов' } },
      regions: [],
      population: { total: 25000, happiness: 54 },
      economy: { treasury: 500, stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 2000, cavalry: 180, ships: 5, morale: 63, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Самнитское племя на адриатическом побережье, живут между Френтанами и Пентрийскими самнитами.',
    },

    iapygia: {
      name: 'Япигия', color: '#8B8B5B', flag_emoji: '🌾',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь япигов' } },
      regions: [],
      population: { total: 40000, happiness: 53 },
      economy: { treasury: 800, stockpile: { wheat: 3500 }, trade_routes: [] },
      military: { infantry: 3500, cavalry: 400, ships: 5, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Племена «каблука» Италии — иллирийского происхождения. Зажаты между Тарентом и Мессапами.',
    },

    sipontum: {
      name: 'Сипонт', color: '#9B9B6B', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Сипонта' } },
      regions: [],
      population: { total: 12000, happiness: 55 },
      economy: { treasury: 600, stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 50, ships: 15, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческий портовый город в Апулии у Манфредонийского залива, важный пункт торговли на адриатическом побережье.',
    },

    spina: {
      name: 'Спина', color: '#7B9B9B', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Спины' } },
      regions: [],
      population: { total: 10000, happiness: 55 },
      economy: { treasury: 800, stockpile: { wheat: 1000 }, trade_routes: [] },
      military: { infantry: 500, cavalry: 30, ships: 20, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Этрусско-греческий портовый город в дельте По, богатый торговлей янтарём с севера.',
    },

    ancona: {
      name: 'Анкона', color: '#6B9B9B', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Анконы' } },
      regions: [],
      population: { total: 12000, happiness: 57 },
      economy: { treasury: 700, stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 40, ships: 18, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческий город-колония на адриатическом побережье, основанный сиракузянами. «Анкон» по-гречески — «локоть», по форме гавани.',
    },

    genua: {
      name: 'Генуя', color: '#5B8B8B', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь лигурийцев Генуи' } },
      regions: [],
      population: { total: 8000, happiness: 55 },
      economy: { treasury: 400, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 600, cavalry: 30, ships: 10, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Лигурийское поселение у берегов Тирренского моря, будущий великий портовый город.',
    },

    ravenna: {
      name: 'Равенна', color: '#8B8B7B', flag_emoji: '🌿',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Равенны' } },
      regions: [],
      population: { total: 9000, happiness: 55 },
      economy: { treasury: 400, stockpile: { wheat: 900 }, trade_routes: [] },
      military: { infantry: 500, cavalry: 20, ships: 12, morale: 55, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Умбрийский портовый город в болотах дельты По, будущая столица Западной Римской империи.',
    },

    tridentini: {
      name: 'Тридентинцы', color: '#6B7B6B', flag_emoji: '🏔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь тридентинцев' } },
      regions: [],
      population: { total: 18000, happiness: 58 },
      economy: { treasury: 500, stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 100, ships: 0, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Племена альпийских долин вокруг будущего Тридента (Тренто), контролирующие важный альпийский перевал.',
    },

    carni: {
      name: 'Карны', color: '#6B6B7B', flag_emoji: '🏔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь карнов' } },
      regions: [],
      population: { total: 22000, happiness: 58 },
      economy: { treasury: 600, stockpile: { wheat: 1800 }, trade_routes: [] },
      military: { infantry: 2000, cavalry: 150, ships: 0, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Кельтское племя в Юлийских Альпах, контролирующее торговые пути между Цизальпийской Галлией и Иллирией.',
    },

    leponti: {
      name: 'Лепонты', color: '#7B6B7B', flag_emoji: '🏔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь лепонтов' } },
      regions: [],
      population: { total: 15000, happiness: 57 },
      economy: { treasury: 400, stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 80, ships: 0, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Кельто-лигурийское племя в альпийских долинах Тичино, умелые кузнецы и горные проводники.',
    },

    salassi: {
      name: 'Саласси', color: '#8B7B6B', flag_emoji: '⛏️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь саласси' } },
      regions: [],
      population: { total: 20000, happiness: 58 },
      economy: { treasury: 600, stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 2000, cavalry: 100, ships: 0, morale: 68, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Горное племя в Долине Аосты, контролирующее перевал Большой Сен-Бернар и золотые прииски. Их покорение обойдётся Риму дорого.',
    },

    taurini: {
      name: 'Таврины', color: '#7B8B6B', flag_emoji: '🐂',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь тавринов' } },
      regions: [],
      population: { total: 25000, happiness: 58 },
      economy: { treasury: 700, stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 200, ships: 0, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Лигурийское племя у подножия Альп на месте будущего Турина. Именно здесь Ганнибал разгромит их столицу в 218 г. до н.э.',
    },

    vagiennia: {
      name: 'Вагиенны', color: '#8B7B7B', flag_emoji: '🗡️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь вагиеннов' } },
      regions: [],
      population: { total: 18000, happiness: 57 },
      economy: { treasury: 500, stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 1800, cavalry: 120, ships: 0, morale: 63, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Лигурийское племя в горах Лигурийских Апеннин у истоков реки По.',
    },


    // ════════════════════════════════════════════════════════════════
    // СЕВЕРНАЯ АФРИКА
    // ════════════════════════════════════════════════════════════════

    // ── КИРЕНА (Уровень A) ────────────────────────────────────────
    cyrene: {
      name: 'Кирена', adjective: 'киренское', color: '#DAA520', flag_emoji: '🌿',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'oligarchy', legitimacy: 65, stability: 60,
        ruler: { type: 'person', name: 'Офелла', personal_power: 70 },
      },
      regions: [],
      population: {
        total: 300000,
        by_profession: { farmers: 100000, craftsmen: 40000, merchants: 50000, sailors: 20000, clergy: 15000, soldiers: 15000, slaves: 60000 },
        happiness: 60, growth_rate: 0.002,
      },
      economy: {
        treasury: 18000, tax_rate: 0.12,
        primary_exports: ['horses', 'wheat', 'olive_oil', 'trade_goods'],
        primary_imports: ['timber', 'iron', 'slaves'],
        trade_partners: ['ptolemaic_kingdom', 'carthage', 'rhodes', 'athens'],
        stockpile: { wheat: 35000, fish: 5000, iron: 1000, horses: 4000, cattle: 5000 },
        trade_routes: [],
      },
      military: { infantry: 12000, cavalry: 3000, ships: 30, mercenaries: 3000, morale: 68, loyalty: 62, at_war_with: [] },
      relations: {
        ptolemaic_kingdom: { score: -20, treaties: [], at_war: false },
        carthage:          { score: 10,  treaties: [], at_war: false },
        masaesyli:         { score: -15, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Кирена — богатейшая греческая колония Северной Африки. В 304 г. до н.э. полководец Офелла правит городом, опираясь на поддержку Агафокла Сиракузского. Кирена известна породистыми лошадьми, силфием (ценнейшим лекарственным растением) и пшеницей. Вскоре попадёт под власть Птолемея I.',
    },

    // ── МАВРЕТАНИЯ (Уровень A) ────────────────────────────────────
    mauretania: {
      name: 'Мавретания', adjective: 'мавретанское', color: '#CD853F', flag_emoji: '🐎',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'tribal', legitimacy: 60, stability: 55,
        ruler: { type: 'tribal_chief', name: 'Вождь мавров', personal_power: 65 },
      },
      regions: [],
      population: {
        total: 350000,
        by_profession: { farmers: 120000, craftsmen: 30000, merchants: 20000, sailors: 15000, clergy: 15000, soldiers: 50000, slaves: 100000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 6000, tax_rate: 0.07,
        primary_exports: ['horses', 'slaves', 'furs', 'ivory', 'cattle'],
        primary_imports: ['iron', 'salt', 'trade_goods', 'wine'],
        trade_partners: ['carthage', 'masaesyli', 'lixus'],
        stockpile: { wheat: 20000, fish: 4000, iron: 500, horses: 8000, cattle: 15000 },
        trade_routes: [],
      },
      military: { infantry: 20000, cavalry: 8000, ships: 5, mercenaries: 0, morale: 70, loyalty: 70, at_war_with: [] },
      relations: {
        carthage:  { score: -10, treaties: [], at_war: false },
        masaesyli: { score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Берберские племена крайнего запада Северной Африки (совр. Марокко и запад Алжира). Мавры — искусные конники, их конница будет востребована Карфагеном. В 304 г. разрозненные племена ещё не объединены в единое царство.',
    },

    // ── МАСИЛИИ (Уровень A) ───────────────────────────────────────
    massylii: {
      name: 'Масилии', adjective: 'масилийское', color: '#B8860B', flag_emoji: '🐎',
      is_player: false, is_minor: false,
      ai_personality: 'opportunist', ai_priority: 'military',
      government: {
        type: 'tribal', legitimacy: 65, stability: 60,
        ruler: { type: 'tribal_chief', name: 'Вождь масилиев', personal_power: 68 },
      },
      regions: [],
      population: {
        total: 450000,
        by_profession: { farmers: 160000, craftsmen: 40000, merchants: 30000, sailors: 10000, clergy: 20000, soldiers: 60000, slaves: 130000 },
        happiness: 60, growth_rate: 0.002,
      },
      economy: {
        treasury: 9000, tax_rate: 0.08,
        primary_exports: ['horses', 'slaves', 'ivory', 'wheat', 'cattle'],
        primary_imports: ['iron', 'trade_goods', 'salt'],
        trade_partners: ['carthage', 'masaesyli', 'cyrene'],
        stockpile: { wheat: 30000, fish: 3000, iron: 1000, horses: 10000, cattle: 20000 },
        trade_routes: [],
      },
      military: { infantry: 25000, cavalry: 12000, ships: 5, mercenaries: 2000, morale: 72, loyalty: 68, at_war_with: [] },
      relations: {
        carthage:   { score: 50, treaties: [], at_war: false },
        masaesyli:  { score: -30, treaties: [], at_war: false },
        cyrene:     { score: -10, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Восточная Нумидия — союзница Карфагена. Предки будущего царя Масиниссы, великого союзника Рима в Пунических войнах. В 304 г. масилии поставляют Карфагену лучшую в мире лёгкую конницу.',
    },

    // ── МАСЭСИЛИИ (Уровень A) ─────────────────────────────────────
    masaesyli: {
      name: 'Масэсилии', adjective: 'масэсилийское', color: '#C8A820', flag_emoji: '🐎',
      is_player: false, is_minor: false,
      ai_personality: 'opportunist', ai_priority: 'military',
      government: {
        type: 'tribal', legitimacy: 62, stability: 58,
        ruler: { type: 'tribal_chief', name: 'Вождь масэсилиев', personal_power: 65 },
      },
      regions: [],
      population: {
        total: 500000,
        by_profession: { farmers: 180000, craftsmen: 40000, merchants: 25000, sailors: 10000, clergy: 20000, soldiers: 70000, slaves: 155000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 8000, tax_rate: 0.07,
        primary_exports: ['horses', 'slaves', 'ivory', 'cattle', 'wheat'],
        primary_imports: ['iron', 'trade_goods', 'salt'],
        trade_partners: ['carthage', 'massylii', 'mauretania'],
        stockpile: { wheat: 32000, fish: 2000, iron: 800, horses: 12000, cattle: 25000 },
        trade_routes: [],
      },
      military: { infantry: 28000, cavalry: 14000, ships: 5, mercenaries: 1500, morale: 70, loyalty: 66, at_war_with: [] },
      relations: {
        carthage:  { score: 40,  treaties: [], at_war: false },
        massylii:  { score: -30, treaties: [], at_war: false },
        mauretania:{ score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Западная Нумидия — крупнейшее нумидийское царство, союзник Карфагена. Предки будущего царя Сифака, соперника Масиниссы. В 304 г. контролируют огромную территорию от Орана до Атласских гор.',
    },

    // ── МЕРОЭ (Уровень A) ─────────────────────────────────────────
    meroe: {
      name: 'Мероэ', adjective: 'мероитское', color: '#8B4513', flag_emoji: '🐘',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'economy',
      government: {
        type: 'monarchy', legitimacy: 80, stability: 75,
        ruler: { type: 'person', name: 'Царица-кандака Нахирсан', personal_power: 72 },
      },
      regions: [],
      population: {
        total: 250000,
        by_profession: { farmers: 90000, craftsmen: 40000, merchants: 30000, sailors: 10000, clergy: 30000, soldiers: 20000, slaves: 30000 },
        happiness: 65, growth_rate: 0.002,
      },
      economy: {
        treasury: 15000, tax_rate: 0.12,
        primary_exports: ['iron', 'ivory', 'slaves', 'trade_goods', 'cattle'],
        primary_imports: ['wheat', 'papyrus', 'glass', 'trade_goods'],
        trade_partners: ['ptolemaic_kingdom', 'axum', 'blemmyes'],
        stockpile: { wheat: 15000, fish: 2000, iron: 5000, horses: 1000, cattle: 8000 },
        trade_routes: [],
      },
      military: { infantry: 15000, cavalry: 2000, ships: 10, mercenaries: 1000, morale: 72, loyalty: 75, at_war_with: [] },
      relations: {
        ptolemaic_kingdom: { score: -20, treaties: [], at_war: false },
        blemmyes:          { score: -15, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Нубийское царство со столицей в Мероэ — наследник древнего Куша. В 304 г. Мероэ переживает период расцвета: железные кузницы, слоновая кость и контроль над торговыми путями в Центральную Африку. Женщины-правительницы (кандаки) известны воинственностью и властью.',
    },

    // ── ГАРАМАНТЫ (Уровень A) ────────────────────────────────────
    garamantes: {
      name: 'Гараманты', adjective: 'гарамантское', color: '#D2691E', flag_emoji: '🐫',
      is_player: false, is_minor: false,
      ai_personality: 'aggressive', ai_priority: 'military',
      government: {
        type: 'tribal', legitimacy: 62, stability: 58,
        ruler: { type: 'tribal_chief', name: 'Верховный вождь гарамантов', personal_power: 70 },
      },
      regions: [],
      population: {
        total: 300000,
        by_profession: { farmers: 80000, craftsmen: 30000, merchants: 20000, sailors: 0, clergy: 20000, soldiers: 60000, slaves: 90000 },
        happiness: 60, growth_rate: 0.002,
      },
      economy: {
        treasury: 7000, tax_rate: 0.07,
        primary_exports: ['slaves', 'ivory', 'furs', 'cattle'],
        primary_imports: ['iron', 'salt', 'trade_goods'],
        trade_partners: ['carthage', 'massylii', 'nasamonia'],
        stockpile: { wheat: 12000, fish: 500, iron: 500, horses: 5000, cattle: 12000 },
        trade_routes: [],
      },
      military: { infantry: 15000, cavalry: 10000, ships: 0, mercenaries: 0, morale: 72, loyalty: 72, at_war_with: [] },
      relations: {
        carthage:  { score: -10, treaties: [], at_war: false },
        nasamonia: { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Гараманты — Берберские кочевники Сахары, контролирующие транссахарские торговые пути. Их уникальная система подземных ирригационных каналов (фоггара) позволяет жить в пустыне. В 304 г. они совершают регулярные набеги на прибрежные земли и торгуют рабами.',
    },

    // ── НАСАМОНИЯ (Уровень A) ────────────────────────────────────
    nasamonia: {
      name: 'Насамония', adjective: 'насамонийское', color: '#E8C87A', flag_emoji: '🏜️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'tribal', legitimacy: 58, stability: 55,
        ruler: { type: 'tribal_chief', name: 'Вождь насамонов', personal_power: 62 },
      },
      regions: [],
      population: {
        total: 150000,
        by_profession: { farmers: 50000, craftsmen: 15000, merchants: 10000, sailors: 5000, clergy: 10000, soldiers: 30000, slaves: 30000 },
        happiness: 55, growth_rate: 0.001,
      },
      economy: {
        treasury: 3000, tax_rate: 0.06,
        primary_exports: ['slaves', 'cattle', 'furs'],
        primary_imports: ['iron', 'salt', 'wheat'],
        trade_partners: ['garamantes', 'cyrene', 'psyllia'],
        stockpile: { wheat: 8000, fish: 2000, iron: 300, horses: 2000, cattle: 8000 },
        trade_routes: [],
      },
      military: { infantry: 10000, cavalry: 4000, ships: 0, mercenaries: 0, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {
        garamantes: { score: -20, treaties: [], at_war: false },
        cyrene:     { score: -10, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Ливийское племя вокруг большого сирта (совр. Ливия). Насамоны — кочевники-пастухи, ныряльщики за обломками кораблей и торговцы. Геродот описывал их ритуал ночёвки на могилах предков для получения пророческих снов.',
    },


    // ── АФРИКА — Уровень B ────────────────────────────────────────

    lixus: {
      name: 'Ликсус', adjective: 'ликсусское', color: '#C8A04A', flag_emoji: '⚓',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 65, stability: 62, ruler: { type: 'council', name: 'Совет Ликсуса', personal_power: 55 } },
      regions: [],
      population: { total: 22000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 2200, tax_rate: 0.10, primary_exports: ['fish', 'trade_goods', 'ivory'], primary_imports: ['iron', 'wheat', 'pottery'], trade_partners: ['carthage', 'mauretania'], stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 100, ships: 20, mercenaries: 200, morale: 60, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Финикийская колония на атлантическом берегу Марокко, одна из старейших в мире. Промышляет ловом тунца и торговлей с внутренними берберскими племенами.',
    },

    utica: {
      name: 'Утика', adjective: 'утикийское', color: '#B8902A', flag_emoji: '🏛️',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 70, stability: 65, ruler: { type: 'council', name: 'Совет Утики', personal_power: 58 } },
      regions: [],
      population: { total: 30000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 3500, tax_rate: 0.11, primary_exports: ['trade_goods', 'pottery', 'purple_dye'], primary_imports: ['wheat', 'iron', 'timber'], trade_partners: ['carthage', 'massylii'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 100, ships: 25, mercenaries: 300, morale: 62, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Утика основана финикийцами раньше Карфагена (ок. 1100 г. до н.э.) и формально старше материнского города. Находится в тени Карфагена, но сохраняет значительную автономию.',
    },

    kerkouane: {
      name: 'Керкуан', adjective: 'керкуанское', color: '#C8B040', flag_emoji: '🏺',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 62, stability: 60, ruler: { type: 'council', name: 'Совет Керкуана', personal_power: 50 } },
      regions: [],
      population: { total: 15000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 1800, tax_rate: 0.11, primary_exports: ['purple_dye', 'fish', 'trade_goods'], primary_imports: ['wheat', 'timber'], trade_partners: ['carthage', 'utica'], stockpile: { wheat: 1800 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 50, ships: 15, mercenaries: 100, morale: 58, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Пунический город на мысе Боне (Тунис), производящий лучший финикийский пурпур из мурекса. Полностью уничтожен Римом в 146 г. до н.э. — единственный пунический город, не отстроенный после разрушения.',
    },

    phazania: {
      name: 'Фазания', adjective: 'фазанийское', color: '#D4A060', flag_emoji: '🏜️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'tribal_chief', name: 'Верховный вождь фазанов', personal_power: 62 } },
      regions: [],
      population: { total: 80000, happiness: 56, growth_rate: 0.001 },
      economy: { treasury: 1500, tax_rate: 0.06, primary_exports: ['slaves', 'ivory', 'cattle'], primary_imports: ['iron', 'salt', 'trade_goods'], trade_partners: ['garamantes', 'nasamonia'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 3000, ships: 0, mercenaries: 0, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Племена пустыни Феццан (совр. юго-западная Ливия), контролирующие оазисы транссахарских путей между Сахарой и суданскими землями.',
    },

    gyzantia: {
      name: 'Гизантия', adjective: 'гизантийское', color: '#E0B060', flag_emoji: '🍯',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'tribal_chief', name: 'Вождь гизантов', personal_power: 58 } },
      regions: [],
      population: { total: 90000, happiness: 56, growth_rate: 0.001 },
      economy: { treasury: 1500, tax_rate: 0.06, primary_exports: ['cattle', 'furs', 'slaves'], primary_imports: ['salt', 'iron'], trade_partners: ['nasamonia', 'phazania'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 6000, cavalry: 2500, ships: 0, mercenaries: 0, morale: 62, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'По Геродоту, гизанты смешивают мёд с саранчой в пищу. Пастушеские племена Триполитании к западу от Большого сирта.',
    },

    gindania: {
      name: 'Гинданцы', adjective: 'гинданское', color: '#D8A850', flag_emoji: '🏜️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'tribal_chief', name: 'Вождь гинданцев', personal_power: 60 } },
      regions: [],
      population: { total: 75000, happiness: 56, growth_rate: 0.001 },
      economy: { treasury: 1200, tax_rate: 0.06, primary_exports: ['cattle', 'ivory', 'slaves'], primary_imports: ['salt', 'iron'], trade_partners: ['nasamonia', 'masaesyli'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 2000, ships: 0, mercenaries: 0, morale: 62, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ливийское племя к западу от великих сыртов, знаменитое тем, что женщины украшают лодыжки кожаными браслетами по числу любовников.',
    },

    machyles: {
      name: 'Махлии', adjective: 'махлийское', color: '#C8A040', flag_emoji: '🏜️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 55, stability: 52, ruler: { type: 'tribal_chief', name: 'Вождь махлиев', personal_power: 58 } },
      regions: [],
      population: { total: 60000, happiness: 55, growth_rate: 0.001 },
      economy: { treasury: 1000, tax_rate: 0.06, primary_exports: ['cattle', 'slaves'], primary_imports: ['salt', 'iron'], trade_partners: ['garamantes', 'cyrene'], stockpile: { wheat: 3500 }, trade_routes: [] },
      military: { infantry: 4000, cavalry: 1500, ships: 0, mercenaries: 0, morale: 60, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ливийское племя у озера Тритонис (совр. шотт-эль-Джерид). Соседи Лотофагов из поэм Гомера.',
    },

    musulamii: {
      name: 'Мусуламии', adjective: 'мусуламийское', color: '#B89030', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 58, stability: 55, ruler: { type: 'tribal_chief', name: 'Вождь мусуламиев', personal_power: 65 } },
      regions: [],
      population: { total: 120000, happiness: 57, growth_rate: 0.002 },
      economy: { treasury: 2000, tax_rate: 0.07, primary_exports: ['cattle', 'slaves', 'horses'], primary_imports: ['iron', 'salt'], trade_partners: ['massylii', 'masaesyli'], stockpile: { wheat: 7000 }, trade_routes: [] },
      military: { infantry: 8000, cavalry: 4000, ships: 0, mercenaries: 0, morale: 68, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Воинственное нумидийское племя в горных районах между Карфагеном и сахарскими кочевниками. Поднимут знаменитое восстание под предводительством Такфарина против Рима (17–24 гг. н.э.).',
    },

    daphnitaea: {
      name: 'Дафнитеи', adjective: 'дафнитейское', color: '#C8B840', flag_emoji: '🏜️',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 52, stability: 50, ruler: { type: 'tribal_chief', name: 'Вождь дафнитеев', personal_power: 55 } },
      regions: [],
      population: { total: 80000, happiness: 54, growth_rate: 0.001 },
      economy: { treasury: 1200, tax_rate: 0.06, primary_exports: ['cattle', 'slaves'], primary_imports: ['salt', 'iron'], trade_partners: ['nasamonia', 'garamantes'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 5000, cavalry: 2000, ships: 0, mercenaries: 0, morale: 60, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Берберские племена внутренней Ливии между Киренаикой и Феццаном.',
    },

    blemmyes: {
      name: 'Блеммии', adjective: 'блеммийское', color: '#A07040', flag_emoji: '⚔️',
      is_player: false, is_minor: true, ai_personality: 'aggressive', ai_priority: 'military',
      government: { type: 'tribal', legitimacy: 58, stability: 55, ruler: { type: 'tribal_chief', name: 'Вождь блеммиев', personal_power: 62 } },
      regions: [],
      population: { total: 40000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 800, tax_rate: 0.06, primary_exports: ['ivory', 'slaves', 'gold'], primary_imports: ['iron', 'trade_goods'], trade_partners: ['meroe', 'ptolemaic_kingdom'], stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 4000, cavalry: 500, ships: 0, mercenaries: 0, morale: 70, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Нубийское племя к востоку от Нила в Нубийской пустыне. Известны античным авторам как «безголовые люди» с лицом на груди — легенда. В реальности — воинственные кочевники, терзавшие границы Египта.',
    },

    dodekaschoinos: {
      name: 'Додекасхойнос', adjective: 'додекасхойносское', color: '#B09050', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 50, stability: 48, ruler: { type: 'tribal_chief', name: 'Местный правитель', personal_power: 45 } },
      regions: [],
      population: { total: 60000, happiness: 52, growth_rate: 0.001 },
      economy: { treasury: 1000, tax_rate: 0.08, primary_exports: ['ivory', 'cattle', 'slaves'], primary_imports: ['wheat', 'trade_goods'], trade_partners: ['meroe', 'ptolemaic_kingdom'], stockpile: { wheat: 3500 }, trade_routes: [] },
      military: { infantry: 3000, cavalry: 500, ships: 10, mercenaries: 0, morale: 55, loyalty: 52, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Буферная зона «двенадцати схойнов» (ок. 120 км) вдоль Нила между Египтом и Мероэ. Спорная территория, номинально под контролем Птолемея, фактически управляемая местными нубийскими вождями.',
    },

    sembritia: {
      name: 'Сембриты', adjective: 'сембритское', color: '#905030', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 50, stability: 48, ruler: { type: 'tribal_chief', name: 'Вождь сембритов', personal_power: 52 } },
      regions: [],
      population: { total: 20000, happiness: 54 },
      economy: { treasury: 500, stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 200, ships: 5, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Нильское племя к югу от Мероэ, потомки беглых египетских воинов, переселившихся в Нубию.',
    },

    azania: {
      name: 'Азания', adjective: 'азанийское', color: '#608050', flag_emoji: '🌴',
      is_player: false, is_minor: true, ai_personality: 'isolationist', ai_priority: 'survival',
      government: { type: 'tribal', legitimacy: 52, stability: 52, ruler: { type: 'tribal_chief', name: 'Вождь азанийцев', personal_power: 55 } },
      regions: [],
      population: { total: 15000, happiness: 58 },
      economy: { treasury: 400, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 0, ships: 5, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Восточноафриканское побережье к югу от Рога Африки. Греки и арабы торгуют здесь слоновой костью и черепаховым панцирем.',
    },

    axum: {
      name: 'Аксум', adjective: 'аксумское', color: '#507040', flag_emoji: '🌟',
      is_player: false, is_minor: true, ai_personality: 'isolationist', ai_priority: 'survival',
      government: { type: 'monarchy', legitimacy: 62, stability: 60, ruler: { type: 'person', name: 'Вождь аксумитов', personal_power: 60 } },
      regions: [],
      population: { total: 25000, happiness: 60 },
      economy: { treasury: 600, stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 200, ships: 5, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Зарождающееся государство в горах Эфиопии. В 304 г. до н.э. Аксум лишь складывается — расцвет и контроль над торговыми путями Красного моря ещё впереди.',
    },

    // ── АФРИКА — Уровень C ────────────────────────────────────────

    rusadir: {
      name: 'Русадир', color: '#B89040', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Русадира' } },
      regions: [],
      population: { total: 8000, happiness: 58 },
      economy: { treasury: 500, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 400, cavalry: 30, ships: 12, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Финикийская колония на северном берегу Марокко (совр. Мелилья), опорный пункт карфагенской торговли.',
    },

    psyllia: {
      name: 'Псиллы', color: '#D8C870', flag_emoji: '🐍',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь псиллов' } },
      regions: [],
      population: { total: 30000, happiness: 54 },
      economy: { treasury: 600, stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 1000, ships: 0, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ливийское племя, знаменитое иммунитетом к змеиному яду — их использовали как знахарей и укротителей змей.',
    },

    takapes: {
      name: 'Тапакы', color: '#C8B050', flag_emoji: '🏜️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь тапаков' } },
      regions: [],
      population: { total: 40000, happiness: 55 },
      economy: { treasury: 800, stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 3000, cavalry: 1500, ships: 0, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Берберские племена южного Туниса. Дали название городу Тапсу (Такапес), будущему опорному пункту в войнах Цезаря.',
    },

    qohaito: {
      name: 'Кохайто', color: '#806040', flag_emoji: '🌄',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь кохайто' } },
      regions: [],
      population: { total: 12000, happiness: 58 },
      economy: { treasury: 300, stockpile: { wheat: 1000 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 100, ships: 0, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Нагорное поселение в Эритрее, предшественник аксумской цивилизации.',
    },

    saba: {
      name: 'Саба', color: '#C8A030', flag_emoji: '👑',
      is_player: false, is_minor: true,
      government: { type: 'monarchy', ruler: { name: 'Мукарриб Сабы' } },
      regions: [],
      population: { total: 40000, happiness: 65 },
      economy: { treasury: 2000, stockpile: { wheat: 2000 }, trade_routes: [] },
      military: { infantry: 3000, cavalry: 500, ships: 10, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Южноаравийское царство, известное торговлей ладаном и мирром — библейская страна царицы Савской.',
    },

    ma_in: {
      name: 'Маин', color: '#D8B040', flag_emoji: '🌿',
      is_player: false, is_minor: true,
      government: { type: 'monarchy', ruler: { name: 'Царь Маина' } },
      regions: [],
      population: { total: 35000, happiness: 62 },
      economy: { treasury: 1500, stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 300, ships: 8, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Южноаравийское царство — конкурент Сабы в торговле благовониями. Контролирует северные торговые пути ладана.',
    },

    qataban: {
      name: 'Катабан', color: '#E0C050', flag_emoji: '🌿',
      is_player: false, is_minor: true,
      government: { type: 'monarchy', ruler: { name: 'Царь Катабана' } },
      regions: [],
      population: { total: 30000, happiness: 62 },
      economy: { treasury: 1200, stockpile: { wheat: 1200 }, trade_routes: [] },
      military: { infantry: 2000, cavalry: 300, ships: 5, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Южноаравийское царство у побережья Аравийского моря, торговец ладаном и алоэ.',
    },

    hadramaut: {
      name: 'Хадрамаут', color: '#D8B838', flag_emoji: '🌴',
      is_player: false, is_minor: true,
      government: { type: 'monarchy', ruler: { name: 'Царь Хадрамаута' } },
      regions: [],
      population: { total: 25000, happiness: 60 },
      economy: { treasury: 1000, stockpile: { wheat: 1000 }, trade_routes: [] },
      military: { infantry: 1800, cavalry: 200, ships: 8, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Восточноаравийское царство (совр. Йемен), контролирующее морской путь через Аравийское море.',
    },

    thamud: {
      name: 'Тамуд', color: '#D0A840', flag_emoji: '🐪',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь тамудян' } },
      regions: [],
      population: { total: 20000, happiness: 58 },
      economy: { treasury: 500, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 600, ships: 0, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Североаравийское племя в Хиджазе, упомянутое в Коране и античных источниках. Торговцы и верблюдоводы.',
    },

    kindah: {
      name: 'Кинда', color: '#C89030', flag_emoji: '⚔️',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь Кинды' } },
      regions: [],
      population: { total: 18000, happiness: 58 },
      economy: { treasury: 400, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 500, ships: 0, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Центральноаравийское племя, будущие основатели одного из первых аравийских царств.',
    },

    gerrah: {
      name: 'Герра', color: '#E0C060', flag_emoji: '🌊',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Герры' } },
      regions: [],
      population: { total: 20000, happiness: 62 },
      economy: { treasury: 1500, stockpile: { wheat: 1000 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 300, ships: 15, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Торговый город-государство на берегу Персидского залива (совр. Эль-Хасса, Саудовская Аравия), посредник между аравийской и персидской торговлей.',
    },


    // ════════════════════════════════════════════════════════════════
    // БЛИЖНИЙ ВОСТОК И ДИАДОХИ
    // ════════════════════════════════════════════════════════════════

    // ── ДЕРЖАВА СЕЛЕВКА (Уровень A) ───────────────────────────────
    seleukid_empire: {
      name: 'Держава Селевка', adjective: 'селевкидское', color: '#FFD700', flag_emoji: '🐘',
      is_player: false, is_minor: false,
      ai_personality: 'expansionist', ai_priority: 'military',
      government: {
        type: 'empire', legitimacy: 72, stability: 62,
        ruler: { type: 'person', name: 'Селевк I Никатор', personal_power: 90 },
      },
      regions: [],
      population: {
        total: 6000000,
        by_profession: { farmers: 2500000, craftsmen: 800000, merchants: 600000, sailors: 150000, clergy: 250000, soldiers: 300000, slaves: 400000 },
        happiness: 52, growth_rate: 0.002,
      },
      economy: {
        treasury: 50000, tax_rate: 0.14,
        primary_exports: ['trade_goods', 'purple_dye', 'iron', 'horses'],
        primary_imports: ['wheat', 'timber', 'slaves'],
        trade_partners: ['ptolemaic_kingdom', 'bactria', 'india', 'rhodes'],
        stockpile: { wheat: 200000, fish: 15000, iron: 20000, horses: 15000, cattle: 30000 },
        trade_routes: [],
      },
      military: { infantry: 80000, cavalry: 15000, ships: 80, mercenaries: 20000, morale: 78, loyalty: 70, at_war_with: [] },
      relations: {
        ptolemaic_kingdom: { score: -50, treaties: [], at_war: false },
        lysimachus_kingdom:{ score: -40, treaties: [], at_war: false },
        antipatrid_kingdom:{ score: -20, treaties: [], at_war: false },
        bactria:           { score: 20,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Селевк I только что выиграл битву при Ипсе (301 г.) против Антигона Одноглазого, получив контроль над большей частью Азии. Его держава простирается от Сирии до Индии. Селевк — опытнейший из диадохов, основатель царских городов: Антиохии, Селевкии.',
    },

    // ── ПТОЛЕМЕЕВСКИЙ ЕГИПЕТ (Уровень A) ─────────────────────────
    ptolemaic_kingdom: {
      name: 'Птолемеевское царство', adjective: 'птолемеевское', color: '#4682B4', flag_emoji: '🏺',
      is_player: false, is_minor: false,
      ai_personality: 'expansionist', ai_priority: 'economy',
      government: {
        type: 'empire', legitimacy: 78, stability: 72,
        ruler: { type: 'person', name: 'Птолемей I Сотер', personal_power: 85 },
      },
      regions: [],
      population: {
        total: 7000000,
        by_profession: { farmers: 3000000, craftsmen: 900000, merchants: 700000, sailors: 300000, clergy: 400000, soldiers: 250000, slaves: 450000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 200000, tax_rate: 0.15,
        primary_exports: ['wheat', 'papyrus', 'linen', 'glass', 'trade_goods'],
        primary_imports: ['timber', 'iron', 'horses', 'slaves'],
        trade_partners: ['rhodes', 'seleukid_empire', 'meroe', 'cyrene'],
        stockpile: { wheat: 500000, fish: 50000, iron: 10000, horses: 8000, cattle: 40000 },
        trade_routes: [],
      },
      military: { infantry: 40000, cavalry: 8000, ships: 200, mercenaries: 15000, morale: 72, loyalty: 68, at_war_with: [] },
      relations: {
        seleukid_empire:   { score: -50, treaties: [], at_war: false },
        lysimachus_kingdom:{ score: 20,  treaties: [], at_war: false },
        antipatrid_kingdom:{ score: 10,  treaties: [], at_war: false },
        rhodes:            { score: 40,  treaties: [], at_war: false },
        cyrene:            { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'В 304 г. до н.э. Птолемей I принял царский титул и строит Александрийский мусей и библиотеку. Египет — богатейшая держава эллинистического мира. Птолемей искусно использует дипломатию и флот, избегая сухопутных войн и приобретая Кипр, Киренаику и земли Леванта.',
    },

    // ── АНТИПАТРИДСКОЕ ЦАРСТВО (Уровень A) ───────────────────────
    antipatrid_kingdom: {
      name: 'Антипатридское царство', adjective: 'антипатридское', color: '#4169E1', flag_emoji: '⚡',
      is_player: false, is_minor: false,
      ai_personality: 'expansionist', ai_priority: 'military',
      government: {
        type: 'empire', legitimacy: 65, stability: 58,
        ruler: { type: 'person', name: 'Кассандр', personal_power: 80 },
      },
      regions: [],
      population: {
        total: 2500000,
        by_profession: { farmers: 1000000, craftsmen: 400000, merchants: 250000, sailors: 100000, clergy: 100000, soldiers: 150000, slaves: 500000 },
        happiness: 48, growth_rate: 0.002,
      },
      economy: {
        treasury: 20000, tax_rate: 0.13,
        primary_exports: ['timber', 'iron', 'horses', 'slaves'],
        primary_imports: ['wheat', 'trade_goods', 'olive_oil'],
        trade_partners: ['athens', 'corinth', 'sparta', 'lysimachus_kingdom'],
        stockpile: { wheat: 80000, fish: 10000, iron: 8000, horses: 5000, cattle: 15000 },
        trade_routes: [],
      },
      military: { infantry: 35000, cavalry: 5000, ships: 60, mercenaries: 8000, morale: 70, loyalty: 65, at_war_with: [] },
      relations: {
        lysimachus_kingdom: { score: 20,  treaties: [], at_war: false },
        seleukid_empire:    { score: -20, treaties: [], at_war: false },
        antigonid_kingdom:  { score: -60, treaties: [], at_war: false },
        ptolemaic_kingdom:  { score: 10,  treaties: [], at_war: false },
        athens:             { score: -40, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Кассандр — сын Антипатра, правит Македонией и Грецией. В 304 г. он удерживает власть, несмотря на угрозы со стороны Деметрия Полиоркета. Кассандр приказал казнить Роксану и Александра IV — уничтожив прямую линию Александра Великого.',
    },

    // ── ДЕРЖАВА АНТИГОНИДОВ (Уровень A) ──────────────────────────
    antigonid_kingdom: {
      name: 'Держава Антигонидов', adjective: 'антигонидское', color: '#9400D3', flag_emoji: '🏰',
      is_player: false, is_minor: false,
      ai_personality: 'expansionist', ai_priority: 'military',
      government: {
        type: 'empire', legitimacy: 60, stability: 50,
        ruler: { type: 'person', name: 'Деметрий I Полиоркет', personal_power: 88 },
      },
      regions: [],
      population: {
        total: 4000000,
        by_profession: { farmers: 1600000, craftsmen: 600000, merchants: 400000, sailors: 200000, clergy: 150000, soldiers: 250000, slaves: 800000 },
        happiness: 44, growth_rate: 0.002,
      },
      economy: {
        treasury: 25000, tax_rate: 0.14,
        primary_exports: ['trade_goods', 'timber', 'iron', 'slaves'],
        primary_imports: ['wheat', 'horses', 'papyrus'],
        trade_partners: ['antipatrid_kingdom', 'athens', 'rhodian_trade'],
        stockpile: { wheat: 120000, fish: 20000, iron: 12000, horses: 6000, cattle: 20000 },
        trade_routes: [],
      },
      military: { infantry: 50000, cavalry: 8000, ships: 150, mercenaries: 15000, morale: 75, loyalty: 62, at_war_with: [] },
      relations: {
        antipatrid_kingdom: { score: -60, treaties: [], at_war: false },
        ptolemaic_kingdom:  { score: -30, treaties: [], at_war: false },
        seleukid_empire:    { score: -40, treaties: [], at_war: false },
        lysimachus_kingdom: { score: -30, treaties: [], at_war: false },
        rhodes:             { score: -40, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'После гибели Антигона Одноглазого при Ипсе (301 г.) его сын Деметрий Полиоркет сохранил флот и часть территорий. В 304 г. он завершает осаду Родоса и ищет путь к трону Македонии. Деметрий — блестящий полководец и изобретатель осадных машин.',
    },

    // ── ДЕРЖАВА ЛИСИМАХА (Уровень A) ─────────────────────────────
    lysimachus_kingdom: {
      name: 'Держава Лисимаха', adjective: 'лисимаховское', color: '#2E8B57', flag_emoji: '🦁',
      is_player: false, is_minor: false,
      ai_personality: 'expansionist', ai_priority: 'military',
      government: {
        type: 'empire', legitimacy: 68, stability: 60,
        ruler: { type: 'person', name: 'Лисимах', personal_power: 82 },
      },
      regions: [],
      population: {
        total: 1800000,
        by_profession: { farmers: 750000, craftsmen: 280000, merchants: 200000, sailors: 80000, clergy: 80000, soldiers: 130000, slaves: 280000 },
        happiness: 50, growth_rate: 0.002,
      },
      economy: {
        treasury: 18000, tax_rate: 0.13,
        primary_exports: ['wheat', 'timber', 'furs', 'slaves', 'horses'],
        primary_imports: ['trade_goods', 'iron', 'olive_oil'],
        trade_partners: ['bosporan_kingdom', 'antipatrid_kingdom', 'ptolemaic_kingdom'],
        stockpile: { wheat: 70000, fish: 10000, iron: 6000, horses: 5000, cattle: 15000 },
        trade_routes: [],
      },
      military: { infantry: 30000, cavalry: 6000, ships: 50, mercenaries: 8000, morale: 72, loyalty: 65, at_war_with: [] },
      relations: {
        seleukid_empire:    { score: -40, treaties: [], at_war: false },
        antipatrid_kingdom: { score: 20,  treaties: [], at_war: false },
        ptolemaic_kingdom:  { score: 20,  treaties: [], at_war: false },
        antigonid_kingdom:  { score: -30, treaties: [], at_war: false },
        odrysian_kingdom:   { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Лисимах контролирует Фракию, западный берег Малой Азии и часть Македонии. В 304 г. он недавно получил часть добычи после Ипса и укрепляет своё положение. Лисимах известен тем, что провёл ночь в клетке со львом по приказу Александра — и выжил, задушив зверя.',
    },


    // ── ПОНТ (Уровень A) ──────────────────────────────────────────
    pontus: {
      name: 'Понт', adjective: 'понтийское', color: '#006400', flag_emoji: '🌊',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'military',
      government: {
        type: 'monarchy', legitimacy: 70, stability: 65,
        ruler: { type: 'person', name: 'Митридат I', personal_power: 78 },
      },
      regions: [],
      population: {
        total: 600000,
        by_profession: { farmers: 250000, craftsmen: 80000, merchants: 60000, sailors: 40000, clergy: 30000, soldiers: 60000, slaves: 80000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 10000, tax_rate: 0.12,
        primary_exports: ['wheat', 'fish', 'iron', 'slaves', 'timber'],
        primary_imports: ['trade_goods', 'olive_oil', 'wine'],
        trade_partners: ['bosporan_kingdom', 'sinope', 'rhodes', 'seleukid_empire'],
        stockpile: { wheat: 40000, fish: 15000, iron: 5000, horses: 3000, cattle: 12000 },
        trade_routes: [],
      },
      military: { infantry: 20000, cavalry: 4000, ships: 40, mercenaries: 3000, morale: 72, loyalty: 70, at_war_with: [] },
      relations: {
        seleukid_empire:    { score: -30, treaties: [], at_war: false },
        bosporan_kingdom:   { score: 25,  treaties: [], at_war: false },
        antipatrid_kingdom: { score: -10, treaties: [], at_war: false },
        paphlagonia:        { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Понтийское царство основано Митридатом I ок. 302 г. до н.э. — персидской династией, укрепившейся на черноморском побережье Малой Азии. В 304 г. Митридат только формирует государство, опираясь на греческие прибрежные города (Синопа, Амис) и контроль над торговыми путями Понта Эвксинского.',
    },

    // ── КАППАДОКИЯ (Уровень A) ────────────────────────────────────
    cappadocia: {
      name: 'Каппадокия', adjective: 'каппадокийское', color: '#8B4513', flag_emoji: '🐎',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 68, stability: 60,
        ruler: { type: 'person', name: 'Ариарат II', personal_power: 72 },
      },
      regions: [],
      population: {
        total: 800000,
        by_profession: { farmers: 350000, craftsmen: 80000, merchants: 50000, sailors: 5000, clergy: 40000, soldiers: 80000, slaves: 195000 },
        happiness: 55, growth_rate: 0.002,
      },
      economy: {
        treasury: 12000, tax_rate: 0.11,
        primary_exports: ['horses', 'cattle', 'slaves', 'iron'],
        primary_imports: ['trade_goods', 'wine', 'olive_oil', 'timber'],
        trade_partners: ['seleukid_empire', 'pontus', 'armenia'],
        stockpile: { wheat: 40000, fish: 1000, iron: 4000, horses: 12000, cattle: 20000 },
        trade_routes: [],
      },
      military: { infantry: 25000, cavalry: 8000, ships: 0, mercenaries: 3000, morale: 68, loyalty: 65, at_war_with: [] },
      relations: {
        seleukid_empire: { score: -20, treaties: [], at_war: false },
        pontus:          { score: -15, treaties: [], at_war: false },
        armenia:         { score: 20,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Каппадокия — персидская сатрапия, де-факто независимая. Ариарат II сохраняет власть, лавируя между диадохами. Край знаменит табунами лошадей и серебряными рудниками. В 301 г. Ариарат поддержал Антигона при Ипсе, но успел замириться с победителями.',
    },

    // ── АРМЕНИЯ (Уровень A) ───────────────────────────────────────
    armenia: {
      name: 'Армения', adjective: 'армянское', color: '#DC143C', flag_emoji: '🦅',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 72, stability: 65,
        ruler: { type: 'person', name: 'Оронт II', personal_power: 70 },
      },
      regions: [],
      population: {
        total: 1500000,
        by_profession: { farmers: 650000, craftsmen: 150000, merchants: 80000, sailors: 0, clergy: 80000, soldiers: 120000, slaves: 420000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 14000, tax_rate: 0.10,
        primary_exports: ['horses', 'iron', 'cattle', 'slaves', 'furs'],
        primary_imports: ['trade_goods', 'wine', 'olive_oil'],
        trade_partners: ['cappadocia', 'seleukid_empire', 'atropatene'],
        stockpile: { wheat: 60000, fish: 2000, iron: 6000, horses: 15000, cattle: 25000 },
        trade_routes: [],
      },
      military: { infantry: 40000, cavalry: 12000, ships: 0, mercenaries: 2000, morale: 70, loyalty: 70, at_war_with: [] },
      relations: {
        seleukid_empire: { score: -15, treaties: [], at_war: false },
        cappadocia:      { score: 20,  treaties: [], at_war: false },
        atropatene:      { score: 15,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Армения — обширная горная страна на перекрёстке Малой Азии, Кавказа и Иранского нагорья. В 304 г. Оронт II правит как персидский сатрап, сохраняя фактическую независимость. Армянские лошади и катафракты — лучшие в мире по мнению греков.',
    },

    // ── ВИФИНИЯ (Уровень A) ───────────────────────────────────────
    bithynia: {
      name: 'Вифиния', adjective: 'вифинское', color: '#20B2AA', flag_emoji: '⚓',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 65, stability: 62,
        ruler: { type: 'person', name: 'Зипойт I', personal_power: 72 },
      },
      regions: [],
      population: {
        total: 250000,
        by_profession: { farmers: 100000, craftsmen: 35000, merchants: 25000, sailors: 20000, clergy: 15000, soldiers: 25000, slaves: 30000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 6000, tax_rate: 0.11,
        primary_exports: ['timber', 'fish', 'wheat', 'slaves'],
        primary_imports: ['trade_goods', 'iron', 'wine'],
        trade_partners: ['byzantion', 'antipatrid_kingdom', 'pontus'],
        stockpile: { wheat: 18000, fish: 8000, iron: 2000, horses: 1500, cattle: 5000 },
        trade_routes: [],
      },
      military: { infantry: 10000, cavalry: 1500, ships: 25, mercenaries: 1000, morale: 68, loyalty: 68, at_war_with: [] },
      relations: {
        lysimachus_kingdom: { score: -30, treaties: [], at_war: false },
        antipatrid_kingdom: { score: -20, treaties: [], at_war: false },
        pontus:             { score: -15, treaties: [], at_war: false },
        byzantion:          { score: 15,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Зипойт I провозгласил независимость Вифинии от Лисимаха ок. 297 г. до н.э. В 304 г. Вифиния балансирует между диадохами, используя лесистые горы как защиту. Главный ресурс — строевой лес для корабельного строительства и контроль над проливом Боспор.',
    },

    // ── ПАФЛАГОНИЯ (Уровень A) ────────────────────────────────────
    paphlagonia: {
      name: 'Пафлагония', adjective: 'пафлагонское', color: '#5F9EA0', flag_emoji: '🌲',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 60, stability: 55,
        ruler: { type: 'person', name: 'Местный правитель', personal_power: 60 },
      },
      regions: [],
      population: {
        total: 400000,
        by_profession: { farmers: 170000, craftsmen: 55000, merchants: 35000, sailors: 20000, clergy: 20000, soldiers: 40000, slaves: 60000 },
        happiness: 55, growth_rate: 0.002,
      },
      economy: {
        treasury: 7000, tax_rate: 0.10,
        primary_exports: ['timber', 'iron', 'fish', 'slaves'],
        primary_imports: ['trade_goods', 'wine'],
        trade_partners: ['pontus', 'bithynia', 'seleukid_empire'],
        stockpile: { wheat: 25000, fish: 8000, iron: 3000, horses: 2000, cattle: 8000 },
        trade_routes: [],
      },
      military: { infantry: 15000, cavalry: 2500, ships: 15, mercenaries: 1000, morale: 62, loyalty: 60, at_war_with: [] },
      relations: {
        pontus:          { score: -20, treaties: [], at_war: false },
        bithynia:        { score: -15, treaties: [], at_war: false },
        seleukid_empire: { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Пафлагония — горная страна на черноморском побережье между Вифинией и Понтом. Богатейшие леса и железные руды делают её лакомой добычей для соседей. В 304 г. сохраняет шаткую независимость между сильными соседями.',
    },

    // ── НАБАТЕЯ (Уровень A) ───────────────────────────────────────
    nabataea: {
      name: 'Набатея', adjective: 'набатейское', color: '#D2691E', flag_emoji: '🌿',
      is_player: false, is_minor: false,
      ai_personality: 'mercantile', ai_priority: 'economy',
      government: {
        type: 'monarchy', legitimacy: 75, stability: 70,
        ruler: { type: 'person', name: 'Царь набатеев', personal_power: 72 },
      },
      regions: [],
      population: {
        total: 300000,
        by_profession: { farmers: 80000, craftsmen: 50000, merchants: 80000, sailors: 15000, clergy: 20000, soldiers: 25000, slaves: 30000 },
        happiness: 65, growth_rate: 0.002,
      },
      economy: {
        treasury: 20000, tax_rate: 0.10,
        primary_exports: ['incense', 'trade_goods', 'horses', 'slaves'],
        primary_imports: ['iron', 'timber', 'wheat', 'wine'],
        trade_partners: ['ptolemaic_kingdom', 'seleukid_empire', 'judea'],
        stockpile: { wheat: 15000, fish: 2000, iron: 1000, horses: 3000, cattle: 5000 },
        trade_routes: [],
      },
      military: { infantry: 8000, cavalry: 5000, ships: 20, mercenaries: 1000, morale: 72, loyalty: 75, at_war_with: [] },
      relations: {
        ptolemaic_kingdom: { score: -10, treaties: [], at_war: false },
        seleukid_empire:   { score: -15, treaties: [], at_war: false },
        judea:             { score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Набатеи контролируют торговлю благовониями по «Дороге ладана» от Аравии до Средиземноморья. В 304 г. они только что успешно отразили две экспедиции Антигона, опираясь на неприступность Петры и умение воевать в пустыне. Их торговый потенциал огромен.',
    },

    // ── ИУДЕЯ (Уровень A) ────────────────────────────────────────
    judea: {
      name: 'Иудея', adjective: 'иудейское', color: '#1C1C8C', flag_emoji: '✡️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'theocracy', legitimacy: 78, stability: 70,
        ruler: { type: 'person', name: 'Первосвященник Симон I', personal_power: 72 },
      },
      regions: [],
      population: {
        total: 350000,
        by_profession: { farmers: 150000, craftsmen: 60000, merchants: 40000, sailors: 5000, clergy: 50000, soldiers: 15000, slaves: 30000 },
        happiness: 62, growth_rate: 0.002,
      },
      economy: {
        treasury: 8000, tax_rate: 0.10,
        primary_exports: ['olive_oil', 'trade_goods', 'pottery', 'wine'],
        primary_imports: ['wheat', 'iron', 'timber'],
        trade_partners: ['ptolemaic_kingdom', 'nabataea', 'samaria'],
        stockpile: { wheat: 20000, fish: 3000, iron: 1000, horses: 500, cattle: 4000 },
        trade_routes: [],
      },
      military: { infantry: 6000, cavalry: 500, ships: 5, mercenaries: 500, morale: 68, loyalty: 75, at_war_with: [] },
      relations: {
        ptolemaic_kingdom: { score: -20, treaties: [], at_war: false },
        seleukid_empire:   { score: -20, treaties: [], at_war: false },
        nabataea:          { score: 10,  treaties: [], at_war: false },
        samaria:           { score: -20, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Иудея в 304 г. — под властью Птолемея I, захватившего Иерусалим в 302 г. до н.э. Первосвященник Симон I управляет внутренними делами через Синедрион. Эллинизация только начинается и встречает сопротивление религиозных традиционалистов. Иерусалимский храм — центр иудейской жизни.',
    },

    // ── ОДРИССКОЕ ЦАРСТВО (Уровень A) ────────────────────────────
    odrysian_kingdom: {
      name: 'Одрисское царство', adjective: 'одрисское', color: '#8B008B', flag_emoji: '⚔️',
      is_player: false, is_minor: false,
      ai_personality: 'aggressive', ai_priority: 'military',
      government: {
        type: 'monarchy', legitimacy: 62, stability: 55,
        ruler: { type: 'person', name: 'Севт III', personal_power: 72 },
      },
      regions: [],
      population: {
        total: 300000,
        by_profession: { farmers: 120000, craftsmen: 40000, merchants: 30000, sailors: 15000, clergy: 15000, soldiers: 50000, slaves: 30000 },
        happiness: 56, growth_rate: 0.002,
      },
      economy: {
        treasury: 5000, tax_rate: 0.09,
        primary_exports: ['slaves', 'furs', 'horses', 'amber', 'cattle'],
        primary_imports: ['iron', 'wine', 'trade_goods'],
        trade_partners: ['lysimachus_kingdom', 'bosporan_kingdom', 'antipatrid_kingdom'],
        stockpile: { wheat: 20000, fish: 5000, iron: 2000, horses: 4000, cattle: 10000 },
        trade_routes: [],
      },
      military: { infantry: 15000, cavalry: 5000, ships: 10, mercenaries: 1000, morale: 70, loyalty: 68, at_war_with: [] },
      relations: {
        lysimachus_kingdom: { score: -30, treaties: [], at_war: false },
        antipatrid_kingdom: { score: -20, treaties: [], at_war: false },
        scythians:          { score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Одрисское царство — фракийская держава в долинах Фракии. Севт III основал новую столицу Севтополь и противостоит экспансии Лисимаха. Фракийская конница ценится по всему эллинистическому миру как наёмники.',
    },


    // ── СОФЕНА (Уровень A) ────────────────────────────────────────
    sophene: {
      name: 'Софена', adjective: 'софенское', color: '#9B4040', flag_emoji: '🏔️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 62, stability: 58,
        ruler: { type: 'person', name: 'Сатрап Софены', personal_power: 62 },
      },
      regions: [],
      population: {
        total: 350000,
        by_profession: { farmers: 150000, craftsmen: 50000, merchants: 30000, sailors: 0, clergy: 20000, soldiers: 40000, slaves: 60000 },
        happiness: 54, growth_rate: 0.002,
      },
      economy: {
        treasury: 7000, tax_rate: 0.10,
        primary_exports: ['iron', 'horses', 'cattle', 'slaves'],
        primary_imports: ['trade_goods', 'wine'],
        trade_partners: ['armenia', 'cappadocia', 'seleukid_empire'],
        stockpile: { wheat: 22000, fish: 500, iron: 4000, horses: 5000, cattle: 10000 },
        trade_routes: [],
      },
      military: { infantry: 15000, cavalry: 4000, ships: 0, mercenaries: 1000, morale: 65, loyalty: 62, at_war_with: [] },
      relations: {
        armenia:         { score: -20, treaties: [], at_war: false },
        seleukid_empire: { score: -20, treaties: [], at_war: false },
        cappadocia:      { score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Горная область между Арменией и Евфратом. В 304 г. Софена — спорная территория на границе армянских, селевкидских и каппадокийских интересов, управляемая полунезависимым династом персидского происхождения.',
    },

    // ── АТРОПАТЕНА (Уровень A) ────────────────────────────────────
    atropatene: {
      name: 'Мидия Атропатена', adjective: 'атропатенское', color: '#8B6914', flag_emoji: '🔥',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 70, stability: 65,
        ruler: { type: 'person', name: 'Атропат', personal_power: 75 },
      },
      regions: [],
      population: {
        total: 400000,
        by_profession: { farmers: 170000, craftsmen: 50000, merchants: 30000, sailors: 0, clergy: 30000, soldiers: 50000, slaves: 70000 },
        happiness: 58, growth_rate: 0.002,
      },
      economy: {
        treasury: 8000, tax_rate: 0.10,
        primary_exports: ['horses', 'cattle', 'iron', 'slaves'],
        primary_imports: ['trade_goods', 'wine'],
        trade_partners: ['armenia', 'seleukid_empire', 'persis'],
        stockpile: { wheat: 25000, fish: 500, iron: 3000, horses: 8000, cattle: 12000 },
        trade_routes: [],
      },
      military: { infantry: 18000, cavalry: 6000, ships: 0, mercenaries: 1000, morale: 68, loyalty: 68, at_war_with: [] },
      relations: {
        seleukid_empire: { score: -15, treaties: [], at_war: false },
        armenia:         { score: 20,  treaties: [], at_war: false },
        persis:          { score: 15,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Атропат — персидский сатрап, не подчинившийся Александру и сохранивший власть. Северо-западная Мидия носит его имя (Азербайджан). В 304 г. Атропатена — буфер между Арменией и Селевкидами, опираясь на природную крепость Иранского нагорья.',
    },

    // ── ПЕРСИДА (Уровень A) ───────────────────────────────────────
    persis: {
      name: 'Персида', adjective: 'персидское', color: '#CC7722', flag_emoji: '🏛️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 68, stability: 60,
        ruler: { type: 'person', name: 'Фратаферн', personal_power: 65 },
      },
      regions: [],
      population: {
        total: 500000,
        by_profession: { farmers: 200000, craftsmen: 80000, merchants: 60000, sailors: 5000, clergy: 50000, soldiers: 50000, slaves: 55000 },
        happiness: 55, growth_rate: 0.002,
      },
      economy: {
        treasury: 12000, tax_rate: 0.11,
        primary_exports: ['horses', 'trade_goods', 'iron', 'cattle'],
        primary_imports: ['timber', 'wheat', 'wine'],
        trade_partners: ['seleukid_empire', 'atropatene', 'india'],
        stockpile: { wheat: 30000, fish: 1000, iron: 5000, horses: 10000, cattle: 15000 },
        trade_routes: [],
      },
      military: { infantry: 20000, cavalry: 7000, ships: 10, mercenaries: 2000, morale: 65, loyalty: 60, at_war_with: [] },
      relations: {
        seleukid_empire: { score: -20, treaties: [], at_war: false },
        atropatene:      { score: 15,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Персида — историческое сердце державы Ахеменидов. Под властью Селевка, но сохраняет местную персидскую аристократию и зороастрийские традиции. Персеполь ещё стоит, хотя и разграблен Александром. Местные фратараки сохраняют автономию.',
    },

    // ── ГОРДИЕНА (Уровень A) ──────────────────────────────────────
    gordyene: {
      name: 'Гордиена', adjective: 'гордиенское', color: '#6B4B8B', flag_emoji: '🏔️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 58, stability: 55,
        ruler: { type: 'person', name: 'Правитель Гордиены', personal_power: 60 },
      },
      regions: [],
      population: {
        total: 250000,
        by_profession: { farmers: 100000, craftsmen: 35000, merchants: 20000, sailors: 0, clergy: 15000, soldiers: 30000, slaves: 50000 },
        happiness: 53, growth_rate: 0.002,
      },
      economy: {
        treasury: 5000, tax_rate: 0.10,
        primary_exports: ['iron', 'timber', 'cattle', 'horses'],
        primary_imports: ['trade_goods', 'wheat'],
        trade_partners: ['armenia', 'seleukid_empire', 'sophene'],
        stockpile: { wheat: 15000, fish: 500, iron: 3000, horses: 4000, cattle: 8000 },
        trade_routes: [],
      },
      military: { infantry: 12000, cavalry: 3000, ships: 0, mercenaries: 500, morale: 65, loyalty: 62, at_war_with: [] },
      relations: {
        armenia:         { score: -15, treaties: [], at_war: false },
        seleukid_empire: { score: -20, treaties: [], at_war: false },
        sophene:         { score: 10,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Гордиена — горная область в курдских горах к северу от Ниневии. В 304 г. формально под властью Селевка, но фактически управляется местными династами. Богатые медные и железные рудники.',
    },

    // ── КОММАГЕНА (Уровень A) ────────────────────────────────────
    commagene: {
      name: 'Коммагена', adjective: 'коммагенское', color: '#7B5B8B', flag_emoji: '🌉',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'monarchy', legitimacy: 62, stability: 58,
        ruler: { type: 'person', name: 'Птолемей Коммагенский', personal_power: 62 },
      },
      regions: [],
      population: {
        total: 300000,
        by_profession: { farmers: 120000, craftsmen: 50000, merchants: 40000, sailors: 5000, clergy: 20000, soldiers: 30000, slaves: 35000 },
        happiness: 56, growth_rate: 0.002,
      },
      economy: {
        treasury: 6500, tax_rate: 0.11,
        primary_exports: ['iron', 'trade_goods', 'cattle', 'horses'],
        primary_imports: ['wheat', 'wine', 'timber'],
        trade_partners: ['seleukid_empire', 'armenia', 'sophene'],
        stockpile: { wheat: 18000, fish: 1000, iron: 3000, horses: 3000, cattle: 7000 },
        trade_routes: [],
      },
      military: { infantry: 12000, cavalry: 2500, ships: 5, mercenaries: 500, morale: 62, loyalty: 60, at_war_with: [] },
      relations: {
        seleukid_empire: { score: -15, treaties: [], at_war: false },
        armenia:         { score: 10,  treaties: [], at_war: false },
        sophene:         { score: 15,  treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Коммагена контролирует важнейшую переправу через Евфрат у Самосаты. В 304 г. — буферное государство между Селевкидами и Арменией. Смешение персидских, армянских и греческих традиций.',
    },

    // ── САМАРИЯ (Уровень A) ──────────────────────────────────────
    samaria: {
      name: 'Самария', adjective: 'самарийское', color: '#4B7B8B', flag_emoji: '🏛️',
      is_player: false, is_minor: false,
      ai_personality: 'defensive', ai_priority: 'survival',
      government: {
        type: 'oligarchy', legitimacy: 52, stability: 48,
        ruler: { type: 'council', name: 'Совет Самарии', personal_power: 48 },
      },
      regions: [],
      population: {
        total: 200000,
        by_profession: { farmers: 90000, craftsmen: 35000, merchants: 25000, sailors: 5000, clergy: 20000, soldiers: 10000, slaves: 15000 },
        happiness: 48, growth_rate: 0.002,
      },
      economy: {
        treasury: 5000, tax_rate: 0.11,
        primary_exports: ['olive_oil', 'wheat', 'trade_goods'],
        primary_imports: ['iron', 'timber', 'trade_goods'],
        trade_partners: ['ptolemaic_kingdom', 'judea', 'nabataea'],
        stockpile: { wheat: 12000, fish: 1500, iron: 800, horses: 500, cattle: 3000 },
        trade_routes: [],
      },
      military: { infantry: 5000, cavalry: 400, ships: 5, mercenaries: 500, morale: 55, loyalty: 50, at_war_with: [] },
      relations: {
        ptolemaic_kingdom: { score: -15, treaties: [], at_war: false },
        judea:             { score: -20, treaties: [], at_war: false },
        seleukid_empire:   { score: -15, treaties: [], at_war: false },
      },
      active_laws: [], characters: [],
      historical_note: 'Самария — бывшая столица Израильского царства, заселённая ассирийскими переселенцами. В 304 г. находится под властью Птолемея, но самаритяне — давние враги иудеев, строящие собственный храм на горе Гаризим.',
    },


    // ════════════════════════════════════════════════════════════════
    // ПРИЧЕРНОМОРЬЕ И МАЛАЯ АЗИЯ — Уровень B
    // ════════════════════════════════════════════════════════════════

    byzantion: {
      name: 'Византий', adjective: 'византийское', color: '#C41E3A', flag_emoji: '⚓',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 72, stability: 68, ruler: { type: 'council', name: 'Совет Византия', personal_power: 60 } },
      regions: [],
      population: { total: 45000, happiness: 65, growth_rate: 0.002 },
      economy: { treasury: 5000, tax_rate: 0.12, primary_exports: ['trade_goods', 'fish'], primary_imports: ['wheat', 'timber', 'iron'], trade_partners: ['bosporan_kingdom', 'athens', 'bithynia'], stockpile: { wheat: 6000 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 200, ships: 40, mercenaries: 500, morale: 70, loyalty: 72, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Byzantion — ключ к Боспору, берущий пошлины со всех судов, проходящих из Чёрного в Эгейское море. В 304 г. успешно отстаивает нейтралитет, богатея на транзитной торговле.',
    },

    sinope: {
      name: 'Синопа', adjective: 'синопское', color: '#5B8B9B', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 65, stability: 62, ruler: { type: 'council', name: 'Совет Синопы', personal_power: 55 } },
      regions: [],
      population: { total: 30000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 3000, tax_rate: 0.11, primary_exports: ['fish', 'trade_goods', 'iron'], primary_imports: ['wheat', 'timber'], trade_partners: ['pontus', 'bosporan_kingdom', 'byzantion'], stockpile: { wheat: 4000 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 100, ships: 25, mercenaries: 300, morale: 62, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Синопа — родина Диогена Синопского. Главный греческий город Южного Причерноморья, будущая столица Понтийского царства.',
    },

    trapezous: {
      name: 'Трапезунт', adjective: 'трапезунтское', color: '#4B9B8B', flag_emoji: '⛰️',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 62, stability: 60, ruler: { type: 'council', name: 'Совет Трапезунта', personal_power: 52 } },
      regions: [],
      population: { total: 22000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 2200, tax_rate: 0.11, primary_exports: ['trade_goods', 'iron', 'furs'], primary_imports: ['wheat', 'wine'], trade_partners: ['sinope', 'pontus', 'bosporan_kingdom'], stockpile: { wheat: 2800 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 80, ships: 15, mercenaries: 200, morale: 60, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Трапезунт — восточный конец Южного Причерноморья, ворота в Кавказ и Армению. Через него идёт торговля с армянским нагорьем.',
    },

    chersonesus: {
      name: 'Херсонес', adjective: 'херсонесское', color: '#4B8BAB', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'republic', legitimacy: 70, stability: 68, ruler: { type: 'council', name: 'Совет Херсонеса', personal_power: 58 } },
      regions: [],
      population: { total: 20000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 2500, tax_rate: 0.11, primary_exports: ['wheat', 'fish', 'slaves'], primary_imports: ['trade_goods', 'wine', 'pottery'], trade_partners: ['bosporan_kingdom', 'scythians', 'athens'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 100, ships: 20, mercenaries: 300, morale: 68, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческий город-государство в Крыму. Постоянно под угрозой скифов и в союзе с Боспорским царством. Самодостаточная демократия, гордящаяся независимостью.',
    },

    olbia: {
      name: 'Ольвия', adjective: 'ольвийское', color: '#5B9BAB', flag_emoji: '🌾',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 62, stability: 58, ruler: { type: 'council', name: 'Совет Ольвии', personal_power: 50 } },
      regions: [],
      population: { total: 15000, happiness: 55, growth_rate: 0.001 },
      economy: { treasury: 1500, tax_rate: 0.10, primary_exports: ['wheat', 'fish', 'slaves', 'furs'], primary_imports: ['wine', 'pottery', 'trade_goods'], trade_partners: ['scythians', 'bosporan_kingdom', 'athens'], stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 50, ships: 15, mercenaries: 100, morale: 55, loyalty: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ольвия — греческая колония в устье Буга. Главный посредник в торговле между скифами и греческим миром. Скифские цари регулярно угрожают городу, требуя откупа.',
    },

    orgame: {
      name: 'Оргаме', adjective: 'оргамское', color: '#6B9BAB', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 58, stability: 55, ruler: { type: 'council', name: 'Совет Оргаме', personal_power: 48 } },
      regions: [],
      population: { total: 18000, happiness: 56, growth_rate: 0.001 },
      economy: { treasury: 1200, tax_rate: 0.10, primary_exports: ['wheat', 'fish', 'furs'], primary_imports: ['wine', 'trade_goods'], trade_partners: ['scythians', 'istros', 'bosporan_kingdom'], stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 50, ships: 12, mercenaries: 100, morale: 55, loyalty: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческое поселение в дельте Дуная, торговый посредник между греческим миром и гетскими племенами северного Причерноморья.',
    },

    istros: {
      name: 'Истрия', adjective: 'истрийское', color: '#5B8BAB', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 62, stability: 60, ruler: { type: 'council', name: 'Совет Истрии', personal_power: 52 } },
      regions: [],
      population: { total: 16000, happiness: 58, growth_rate: 0.001 },
      economy: { treasury: 1400, tax_rate: 0.10, primary_exports: ['wheat', 'fish', 'furs'], primary_imports: ['wine', 'pottery', 'trade_goods'], trade_partners: ['orgame', 'scythians', 'getae'], stockpile: { wheat: 2800 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 50, ships: 15, mercenaries: 100, morale: 58, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческая колония у Чёрного моря близ дельты Дуная. Торгует с гетами и скифами, дающая грекам доступ к придунайским равнинам.',
    },

    apollonia_pontica: {
      name: 'Аполлония Понтийская', adjective: 'аполлонийское', color: '#4B7B9B', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 65, stability: 62, ruler: { type: 'council', name: 'Совет Аполлонии', personal_power: 52 } },
      regions: [],
      population: { total: 14000, happiness: 60, growth_rate: 0.001 },
      economy: { treasury: 1500, tax_rate: 0.11, primary_exports: ['fish', 'wheat', 'trade_goods'], primary_imports: ['wine', 'pottery', 'iron'], trade_partners: ['byzantion', 'bosporan_kingdom', 'athens'], stockpile: { wheat: 2200 }, trade_routes: [] },
      military: { infantry: 700, cavalry: 40, ships: 18, mercenaries: 100, morale: 62, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Милетская колония на болгарском берегу Чёрного моря. Знаменита гигантской статуей Аполлона, которую Лукулл увезёт в Рим в 72 г. до н.э.',
    },

    miletos: {
      name: 'Милет', adjective: 'милетское', color: '#4169E1', flag_emoji: '🏛️',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 62, stability: 58, ruler: { type: 'council', name: 'Совет Милета', personal_power: 55 } },
      regions: [],
      population: { total: 35000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 4500, tax_rate: 0.12, primary_exports: ['trade_goods', 'wool', 'pottery'], primary_imports: ['wheat', 'timber', 'iron'], trade_partners: ['rhodes', 'seleukid_empire', 'bosporan_kingdom'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 2000, cavalry: 150, ships: 35, mercenaries: 500, morale: 60, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Некогда величайший греческий торговый город, основавший сотни колоний. В 304 г. под властью Антигонидов, но сохраняет торговое значение. Родина Фалеса, Анаксимандра, Гекатея.',
    },

    halikarnassos: {
      name: 'Галикарнасс', adjective: 'галикарнасское', color: '#5B79C1', flag_emoji: '🏺',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 60, stability: 58, ruler: { type: 'council', name: 'Совет Галикарнасса', personal_power: 52 } },
      regions: [],
      population: { total: 25000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 2800, tax_rate: 0.11, primary_exports: ['trade_goods', 'marble', 'fish'], primary_imports: ['wheat', 'timber', 'iron'], trade_partners: ['rhodes', 'kos', 'seleukid_empire'], stockpile: { wheat: 3500 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 100, ships: 20, mercenaries: 300, morale: 58, loyalty: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Родина Геродота, место знаменитого Мавзолея (одного из семи чудес света). В 304 г. — под контролем Антигонидов, известен как торговый и культурный центр.',
    },

    arados: {
      name: 'Арад', adjective: 'арадское', color: '#8B7040', flag_emoji: '⚓',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 68, stability: 65, ruler: { type: 'council', name: 'Совет Арада', personal_power: 55 } },
      regions: [],
      population: { total: 20000, happiness: 62, growth_rate: 0.002 },
      economy: { treasury: 2500, tax_rate: 0.11, primary_exports: ['purple_dye', 'trade_goods', 'glass'], primary_imports: ['wheat', 'timber', 'iron'], trade_partners: ['seleukid_empire', 'sidon', 'ptolemaic_kingdom'], stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 50, ships: 25, mercenaries: 200, morale: 65, loyalty: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Арад — финикийский город-остров у берегов Сирии. Единственный финикийский город, не захваченный Александром Великим: осада острова не удалась. В 304 г. под властью Селевка.',
    },

    sidon: {
      name: 'Сидон', adjective: 'сидонское', color: '#9B5040', flag_emoji: '🌊',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 62, stability: 58, ruler: { type: 'council', name: 'Совет Сидона', personal_power: 55 } },
      regions: [],
      population: { total: 40000, happiness: 58, growth_rate: 0.002 },
      economy: { treasury: 5000, tax_rate: 0.12, primary_exports: ['purple_dye', 'glass', 'trade_goods'], primary_imports: ['wheat', 'timber'], trade_partners: ['ptolemaic_kingdom', 'arados', 'byblos'], stockpile: { wheat: 5000 }, trade_routes: [] },
      military: { infantry: 2000, cavalry: 100, ships: 30, mercenaries: 500, morale: 60, loyalty: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Сидон — финикийский торговый город, знаменитый производством пурпурной краски и стекла. В 304 г. под властью Птолемея после перехода от Антигонидов.',
    },

    byblos: {
      name: 'Библ', adjective: 'библское', color: '#8B6040', flag_emoji: '📜',
      is_player: false, is_minor: true, ai_personality: 'mercantile', ai_priority: 'economy',
      government: { type: 'oligarchy', legitimacy: 65, stability: 62, ruler: { type: 'council', name: 'Совет Библа', personal_power: 52 } },
      regions: [],
      population: { total: 18000, happiness: 60, growth_rate: 0.002 },
      economy: { treasury: 2200, tax_rate: 0.11, primary_exports: ['trade_goods', 'purple_dye', 'papyrus'], primary_imports: ['wheat', 'timber', 'iron'], trade_partners: ['sidon', 'arados', 'ptolemaic_kingdom'], stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 50, ships: 20, mercenaries: 200, morale: 60, loyalty: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Библ — один из древнейших городов мира, давший греческое название книгам (biblos — папирус). В 304 г. под властью Птолемея, сохраняет финикийские традиции.',
    },

    bambyce: {
      name: 'Бамбика', adjective: 'бамбикское', color: '#9B7050', flag_emoji: '🌙',
      is_player: false, is_minor: true, ai_personality: 'defensive', ai_priority: 'survival',
      government: { type: 'theocracy', legitimacy: 72, stability: 68, ruler: { type: 'council', name: 'Жречество Атаргатис', personal_power: 65 } },
      regions: [],
      population: { total: 25000, happiness: 65, growth_rate: 0.002 },
      economy: { treasury: 3000, tax_rate: 0.10, primary_exports: ['trade_goods', 'incense'], primary_imports: ['wheat', 'iron'], trade_partners: ['seleukid_empire', 'arados', 'palmyra_tribes'], stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 200, ships: 0, mercenaries: 300, morale: 65, loyalty: 70, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Бамбика (Иераполис-Бамбике) — священный город богини Атаргатис в Северной Сирии. Тысячи паломников приносят богатые дары. Город-теократия, живущий за счёт религиозного туризма.',
    },

    // ── МАЛАЯ АЗИЯ — Уровень C ────────────────────────────────────

    kyzikios: {
      name: 'Кизик', adjective: 'кизикское', color: '#5B7BAB', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Кизика' } },
      regions: [],
      population: { total: 25000, happiness: 62 },
      economy: { treasury: 3000, stockpile: { wheat: 3500 }, trade_routes: [] },
      military: { infantry: 1200, cavalry: 100, ships: 25, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Богатый греческий город на Мраморном море, знаменитый золотыми монетами — кизикинами, ходившими по всему Причерноморью.',
    },

    kibyratia: {
      name: 'Кибиратия', adjective: 'кибиратийское', color: '#7B6B8B', flag_emoji: '🏔️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Правитель Кибиратии' } },
      regions: [],
      population: { total: 35000, happiness: 56 },
      economy: { treasury: 1500, stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 300, ships: 5, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Горная область в Писидии и Ликии с собственной традицией металлообработки и разведения лошадей.',
    },

    oinoandia: {
      name: 'Ойноанда', adjective: 'ойноандское', color: '#7B8B6B', flag_emoji: '🏔️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Ойноанды' } },
      regions: [],
      population: { total: 15000, happiness: 58 },
      economy: { treasury: 700, stockpile: { wheat: 1500 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 100, ships: 0, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Ликийский горный город, будущий дом философского послания эпикурейца Диогена Ойноандского.',
    },

    olbe: {
      name: 'Ольба', adjective: 'ольбское', color: '#8B7B5B', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'theocracy', ruler: { name: 'Жречество Зевса Ольбийского' } },
      regions: [],
      population: { total: 25000, happiness: 60 },
      economy: { treasury: 1200, stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 150, ships: 5, morale: 60, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Теократический город в Киликии под управлением жречества Зевса. Четыре провинции вокруг священного центра.',
    },

    sagallasia: {
      name: 'Сагалассия', adjective: 'сагалассийское', color: '#7B9B6B', flag_emoji: '🏔️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Правитель Сагалассии' } },
      regions: [],
      population: { total: 18000, happiness: 58 },
      economy: { treasury: 800, stockpile: { wheat: 1800 }, trade_routes: [] },
      military: { infantry: 1500, cavalry: 150, ships: 0, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Писидийский город в горах Тавра, знаменитый упорным сопротивлением Александру Великому в 333 г. до н.э.',
    },

    knidos: {
      name: 'Книд', adjective: 'книдское', color: '#4B8BAB', flag_emoji: '🏛️',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Книда' } },
      regions: [],
      population: { total: 15000, happiness: 62 },
      economy: { treasury: 1500, stockpile: { wheat: 1800 }, trade_routes: [] },
      military: { infantry: 800, cavalry: 50, ships: 20, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Книд — дорийский город, родина астронома Евдокса и скульптора Праксителя. Его Афродита Книдская считалась прекраснейшей статуей мира.',
    },

    kos: {
      name: 'Кос', adjective: 'косское', color: '#5BAB9B', flag_emoji: '🐍',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Коса' } },
      regions: [],
      population: { total: 20000, happiness: 65 },
      economy: { treasury: 2000, stockpile: { wheat: 2500 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 50, ships: 20, morale: 62, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Остров Кос — родина Гиппократа и центр медицины. Знаменит производством шёлка, вина и медицинских школ.',
    },

    phasis: {
      name: 'Фасис', adjective: 'фасисское', color: '#4B9B6B', flag_emoji: '🌊',
      is_player: false, is_minor: true,
      government: { type: 'oligarchy', ruler: { name: 'Совет Фасиса' } },
      regions: [],
      population: { total: 8000, happiness: 56 },
      economy: { treasury: 600, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 400, cavalry: 30, ships: 8, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Греческая колония в устье реки Фасис (совр. Риони, Грузия) — конечная точка аргонавтов. Ворота в Колхиду.',
    },

    heniochia: {
      name: 'Гениохи', adjective: 'гениохское', color: '#5B7B6B', flag_emoji: '⚓',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь гениохов' } },
      regions: [],
      population: { total: 12000, happiness: 58 },
      economy: { treasury: 400, stockpile: { wheat: 800 }, trade_routes: [] },
      military: { infantry: 1000, cavalry: 100, ships: 15, morale: 65, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Кавказские пираты Чёрного моря, известные дерзкими набегами на прибрежные города.',
    },

    mariandynia: {
      name: 'Марианды', adjective: 'марианднское', color: '#6B8B7B', flag_emoji: '🌲',
      is_player: false, is_minor: true,
      government: { type: 'tribal', ruler: { name: 'Вождь марианднов' } },
      regions: [],
      population: { total: 35000, happiness: 52 },
      economy: { treasury: 700, stockpile: { wheat: 3000 }, trade_routes: [] },
      military: { infantry: 2500, cavalry: 200, ships: 5, morale: 58, at_war_with: [] },
      relations: {},
      active_laws: [], characters: [],
      historical_note: 'Вифинское племя к востоку от Гераклеи Понтийской, поставляющее в город рабов-гелотов.',
    },


  // ===== ШАГ 7: СТЕПЬ, ЦЕНТРАЛЬНАЯ АЗИЯ, ИНДИЯ =====

  // === LEVEL A ===

  scythians: {
    name: "Скифское царство",
    adjective: "скифский",
    color: "#8B6914",
    flag_emoji: "🏹",
    is_player: false,
    is_minor: false,
    ai_personality: "raider",
    ai_priority: ["military", "expansion", "trade"],
    government: { type: "monarchy", stability: 55, corruption: 40 },
    regions: ["northern_pontic_steppe", "crimea_steppes", "dnieper_bend", "dniester_lower", "don_lower", "azov_coast", "kuban_steppe", "caucasus_foothills_north", "tanais_region", "zaporizhia_steppe"],
    population: {
      by_profession: {
        farmers: 80000, craftsmen: 15000, merchants: 8000,
        soldiers: 40000, nobles: 3000, priests: 2000, slaves: 10000
      }
    },
    economy: {
      gold: 280,
      income_per_turn: 60,
      trade_routes: ["olbia", "byzantion", "chersonesus", "tanais"],
      stockpile: { grain: 600, wood: 120, iron: 80, horses: 800, gold_ore: 40 }
    },
    military: {
      infantry: 15000,
      cavalry: 45000,
      ships: 0,
      at_war_with: []
    },
    relations: {
      macedon: -20, rome: 0, carthage: 0, egypt: 10,
      seleucid_empire: -30, roxolani: -40, iazyges: -30,
      chersonesus: 20, olbia: 30, bosporan_kingdom: 40
    },
    active_laws: [],
    characters: [],
    historical_note: "Скифы в 304 г. до н.э. — могущественный кочевой народ Причерноморья, контролирующий обширные степи от Дуная до Дона. Их царь Атей погиб в 339 г. до н.э. в битве с Филиппом II Македонским, и народ переживает период частичного упадка, теснимый сарматами с востока. Скифская конница — одна из лучших в мире."
  },

  maurya_empire: {
    name: "Империя Маурьев",
    adjective: "маурийский",
    color: "#FF8C00",
    flag_emoji: "🦚",
    is_player: false,
    is_minor: false,
    ai_personality: "expansionist",
    ai_priority: ["expansion", "economy", "military"],
    government: { type: "monarchy", stability: 70, corruption: 35 },
    regions: ["magadha", "pataliputra_region", "anga", "videha", "kosala", "kashi", "vajji", "malla", "panchala", "avanti", "surashtra", "sindhu_lower", "taxila", "gandhara_core", "kalinga_coast", "deccan_north", "andhra_north"],
    population: {
      by_profession: {
        farmers: 2500000, craftsmen: 400000, merchants: 200000,
        soldiers: 300000, nobles: 20000, priests: 50000, slaves: 150000
      }
    },
    economy: {
      gold: 2000,
      income_per_turn: 320,
      trade_routes: ["bactria", "parthia", "seleucid_empire", "gandhara"],
      stockpile: { grain: 8000, wood: 2000, iron: 1500, spices: 3000, cotton: 2500 }
    },
    military: {
      infantry: 250000,
      cavalry: 30000,
      ships: 800,
      at_war_with: []
    },
    relations: {
      seleucid_empire: 40, bactria: 20, parthia: 10, egypt: 20,
      macedon: 10, rome: 0, gandhara: 60
    },
    active_laws: [],
    characters: [],
    historical_note: "Империя Маурьев под управлением Чандрагупты Маурьи к 304 г. до н.э. стала крупнейшей державой Индийского субконтинента. В 305 г. до н.э. Чандрагупта разгромил армию Селевка I Никатора и получил северо-западные индийские территории. Советник Чанакья (Каутилья) написал знаменитый трактат об управлении государством «Артхашастра»."
  },

  // === LEVEL B ===

  parthia: {
    name: "Парфия",
    adjective: "парфянский",
    color: "#8B0000",
    flag_emoji: "🏹",
    is_player: false,
    is_minor: false,
    ai_personality: "balanced",
    ai_priority: ["economy", "military", "diplomacy"],
    government: { type: "satrapy", stability: 55, corruption: 40 },
    regions: ["parthiene", "hyrcania", "nisa_region", "margiana"],
    population: { total: 350000 },
    economy: {
      gold: 180,
      income_per_turn: 45,
      trade_routes: ["seleucid_empire", "bactria", "maurya_empire"],
      stockpile: { grain: 400, horses: 600, iron: 100, textiles: 200 }
    },
    military: { infantry: 8000, cavalry: 12000, ships: 0, at_war_with: [] },
    relations: { seleucid_empire: 50, bactria: 30, scythians: -20, maurya_empire: 10 },
    active_laws: [], characters: [],
    historical_note: "В 304 г. до н.э. Парфия — восточная сатрапия государства Селевкидов. Местные иранские племена парнов обеспечивают отличную конницу. Спустя полвека Парфия обретёт независимость под предводительством Аршака I."
  },

  bactria: {
    name: "Бактрия",
    adjective: "бактрийский",
    color: "#4169E1",
    flag_emoji: "🐪",
    is_player: false,
    is_minor: false,
    ai_personality: "balanced",
    ai_priority: ["trade", "economy", "military"],
    government: { type: "satrapy", stability: 60, corruption: 35 },
    regions: ["bactria_core", "sogdia", "maracanda_region", "chorasmia_south", "ferghana_west"],
    population: { total: 500000 },
    economy: {
      gold: 250,
      income_per_turn: 65,
      trade_routes: ["seleucid_empire", "parthia", "maurya_empire", "scythians"],
      stockpile: { grain: 500, gold_ore: 300, horses: 700, lapis_lazuli: 400 }
    },
    military: { infantry: 12000, cavalry: 18000, ships: 0, at_war_with: [] },
    relations: { seleucid_empire: 55, parthia: 40, maurya_empire: 20, scythians: -30, saka: -40 },
    active_laws: [], characters: [],
    historical_note: "Бактрия в 304 г. до н.э. — богатейшая восточная сатрапия Селевкидов, расположенная на великом торговом пути из Индии в Средиземноморье. Смешение греческой и иранской культур создаёт уникальную цивилизацию. В середине III в. до н.э. здесь возникнет независимое Греко-Бактрийское царство."
  },

  roxolani: {
    name: "Роксоланы",
    adjective: "роксоланский",
    color: "#6B8E23",
    flag_emoji: "🐴",
    is_player: false,
    is_minor: false,
    ai_personality: "raider",
    ai_priority: ["military", "expansion"],
    government: { type: "tribal", stability: 45, corruption: 20 },
    regions: ["don_middle", "volga_lower", "caspian_steppe"],
    population: { total: 120000 },
    economy: {
      gold: 60,
      income_per_turn: 15,
      trade_routes: ["scythians", "bosporan_kingdom"],
      stockpile: { horses: 900, cattle: 500, furs: 200 }
    },
    military: { infantry: 5000, cavalry: 20000, ships: 0, at_war_with: [] },
    relations: { scythians: -40, iazyges: 30, siraces: 20, aorsi: 40 },
    active_laws: [], characters: [],
    historical_note: "Роксоланы — сарматское племя, теснящее скифов с востока. Их тяжёлая кавалерия в доспехах из костяных пластин произведёт впечатление даже на римлян в будущем. В 304 г. до н.э. активно расширяются в причерноморские степи."
  },

  maeotae: {
    name: "Меоты",
    adjective: "меотский",
    color: "#20B2AA",
    flag_emoji: "🐟",
    is_player: false,
    is_minor: true,
    ai_personality: "balanced",
    ai_priority: ["trade", "economy"],
    government: { type: "tribal", stability: 50, corruption: 25 },
    regions: ["azov_east_coast", "kuban_lower", "taman_peninsula"],
    population: { total: 80000 },
    economy: {
      gold: 50,
      income_per_turn: 18,
      trade_routes: ["bosporan_kingdom", "scythians"],
      stockpile: { fish: 600, grain: 300, furs: 150 }
    },
    military: { infantry: 6000, cavalry: 4000, ships: 80, at_war_with: [] },
    relations: { scythians: 10, bosporan_kingdom: 50, roxolani: -10 },
    active_laws: [], characters: [],
    historical_note: "Меоты — оседлые земледельцы и рыболовы на восточном берегу Меотийского озера (Азовское море). Тесно связаны с Боспорским царством, поставляя зерно и рыбу."
  },

  saka: {
    name: "Саки",
    adjective: "сакский",
    color: "#CD853F",
    flag_emoji: "🏹",
    is_player: false,
    is_minor: false,
    ai_personality: "raider",
    ai_priority: ["military", "expansion"],
    government: { type: "tribal", stability: 40, corruption: 20 },
    regions: ["aral_steppe", "jaxartes_middle", "fergana_steppe", "pamir_foothills"],
    population: { total: 200000 },
    economy: {
      gold: 80,
      income_per_turn: 20,
      trade_routes: ["bactria", "chorasmia"],
      stockpile: { horses: 1200, furs: 300, gold_ore: 100 }
    },
    military: { infantry: 10000, cavalry: 30000, ships: 0, at_war_with: [] },
    relations: { bactria: -40, parthia: -30, maurya_empire: -20, scythians: 20 },
    active_laws: [], characters: [],
    historical_note: "Саки (восточные скифы) — иранские кочевники Центральной Азии, упоминаемые в персидских и греческих источниках. Несколько их племён угрожают Бактрии с севера, и их давление в конечном счёте сыграет роль в падении Греко-Бактрийского царства."
  },

  // === LEVEL C ===

  iazyges: {
    name: "Языги",
    adjective: "языгский",
    color: "#9ACD32",
    flag_emoji: "⚔️",
    is_player: false,
    is_minor: true,
    ai_personality: "raider",
    ai_priority: ["military"],
    government: { type: "tribal", stability: 40, corruption: 15 },
    regions: ["dnieper_left", "desna_lower"],
    population: { total: 60000 },
    economy: { gold: 30, income_per_turn: 8, trade_routes: [], stockpile: { horses: 400, cattle: 200 } },
    military: { infantry: 3000, cavalry: 8000, ships: 0, at_war_with: [] },
    relations: { scythians: -30, roxolani: 30 },
    active_laws: [], characters: [],
    historical_note: "Языги — западное сарматское племя, постепенно вытесняющее скифов с их западных территорий."
  },

  siraces: {
    name: "Сираки",
    adjective: "сиракский",
    color: "#DAA520",
    flag_emoji: "⚔️",
    is_player: false,
    is_minor: true,
    ai_personality: "balanced",
    ai_priority: ["military", "trade"],
    government: { type: "tribal", stability: 50, corruption: 20 },
    regions: ["kuban_middle", "stavropol_steppe"],
    population: { total: 70000 },
    economy: { gold: 40, income_per_turn: 12, trade_routes: ["bosporan_kingdom"], stockpile: { horses: 500, furs: 150 } },
    military: { infantry: 4000, cavalry: 10000, ships: 0, at_war_with: [] },
    relations: { scythians: -20, bosporan_kingdom: 20, roxolani: 30, maeotae: 10 },
    active_laws: [], characters: [],
    historical_note: "Сираки — сарматское племя у предгорий Кавказа, союзники Боспорского царства и посредники в торговле между степью и греческими городами."
  },

  aorsi: {
    name: "Аорсы",
    adjective: "аорсский",
    color: "#7B68EE",
    flag_emoji: "🐴",
    is_player: false,
    is_minor: true,
    ai_personality: "raider",
    ai_priority: ["military"],
    government: { type: "tribal", stability: 45, corruption: 15 },
    regions: ["ural_lower", "caspian_north_coast"],
    population: { total: 80000 },
    economy: { gold: 35, income_per_turn: 10, trade_routes: ["roxolani"], stockpile: { horses: 700, furs: 200 } },
    military: { infantry: 4000, cavalry: 15000, ships: 0, at_war_with: [] },
    relations: { roxolani: 40, siraces: 20, scythians: -30 },
    active_laws: [], characters: [],
    historical_note: "Аорсы — сарматское племя Прикаспийских степей, в будущем прославятся как посредники в торговле между Китаем и Средиземноморьем."
  },

  chorasmia: {
    name: "Хорезм",
    adjective: "хорезмийский",
    color: "#B8860B",
    flag_emoji: "🌾",
    is_player: false,
    is_minor: true,
    ai_personality: "balanced",
    ai_priority: ["trade", "economy"],
    government: { type: "monarchy", stability: 55, corruption: 30 },
    regions: ["amu_darya_delta"],
    population: { total: 120000 },
    economy: { gold: 90, income_per_turn: 22, trade_routes: ["bactria", "saka"], stockpile: { grain: 400, cotton: 300 } },
    military: { infantry: 5000, cavalry: 8000, ships: 0, at_war_with: [] },
    relations: { bactria: 30, seleucid_empire: 20, saka: -20 },
    active_laws: [], characters: [],
    historical_note: "Хорезм — независимое оазисное царство в дельте Амударьи, богатое благодаря орошаемому земледелию и торговле."
  },

  gedrosia: {
    name: "Гедросия",
    adjective: "гедросийский",
    color: "#A0522D",
    flag_emoji: "🏜️",
    is_player: false,
    is_minor: true,
    ai_personality: "balanced",
    ai_priority: ["economy"],
    government: { type: "satrapy", stability: 45, corruption: 35 },
    regions: ["gedrosia_desert"],
    population: { total: 90000 },
    economy: { gold: 60, income_per_turn: 15, trade_routes: ["maurya_empire", "parthia"], stockpile: { grain: 150, spices: 200 } },
    military: { infantry: 4000, cavalry: 3000, ships: 100, at_war_with: [] },
    relations: { seleucid_empire: 40, maurya_empire: 30, parthia: 20 },
    active_laws: [], characters: [],
    historical_note: "Гедросия — суровая прибрежная провинция на юге Персии, печально прославленная катастрофическим переходом армии Александра Македонского через пустыню."
  },

  gandhara: {
    name: "Гандхара",
    adjective: "гандхарский",
    color: "#DEB887",
    flag_emoji: "🕌",
    is_player: false,
    is_minor: true,
    ai_personality: "balanced",
    ai_priority: ["trade", "economy"],
    government: { type: "satrapy", stability: 60, corruption: 30 },
    regions: ["taxila_region", "peshawar_valley"],
    population: { total: 200000 },
    economy: { gold: 120, income_per_turn: 35, trade_routes: ["maurya_empire", "bactria"], stockpile: { grain: 600, iron: 200, lapis_lazuli: 250 } },
    military: { infantry: 8000, cavalry: 5000, ships: 0, at_war_with: [] },
    relations: { maurya_empire: 60, bactria: 40, seleucid_empire: 20 },
    active_laws: [], characters: [],
    historical_note: "Гандхара — культурный перекрёсток у подножия Гиндукуша, где сходятся индийская и эллинистическая цивилизации. Таксила — один из крупнейших образовательных центров древнего мира."
  }
  ,

  // ===== ШАГ 8: КИТАЙ И ВОСТОЧНАЯ АЗИЯ =====

  // === LEVEL A ===

  qin: {
    name: "Царство Цинь",
    adjective: "циньский",
    color: "#8B0000",
    flag_emoji: "🐉",
    is_player: false,
    is_minor: false,
    ai_personality: "expansionist",
    ai_priority: ["expansion", "military", "economy"],
    government: { type: "monarchy", stability: 75, corruption: 30 },
    regions: ["guanzhong_plain", "wei_river_valley", "hanzhong", "sichuan_basin", "shaanxi_north", "gansu_corridor", "longxi", "northern_shaanxi", "southern_shanxi", "northwest_henan"],
    population: {
      by_profession: {
        farmers: 2000000, craftsmen: 300000, merchants: 100000,
        soldiers: 200000, nobles: 15000, priests: 10000, slaves: 50000
      }
    },
    economy: {
      gold: 1500,
      income_per_turn: 250,
      trade_routes: ["bactria", "xiongnu"],
      stockpile: { grain: 6000, iron: 2000, wood: 1500, silk: 1000, bronze: 800 }
    },
    military: {
      infantry: 150000,
      cavalry: 20000,
      ships: 200,
      at_war_with: []
    },
    relations: {
      chu: -60, zhao: -50, wei: -50, qi: -40, han: -40, yan: -30,
      xiongnu: -40, donghu: -20, gojoseon: 0
    },
    active_laws: [],
    characters: [],
    historical_note: "К 304 г. до н.э. Цинь — сильнейшее из Воюющих царств Китая, уже поглотившее несколько соперников и захватившее плодородный Сычуаньский бассейн. Реформы Шан Яна (356–338 гг. до н.э.) создали высокоэффективную военную и административную машину, основанную на жёстком легизме. До объединения Китая под властью Цинь Ши Хуанди остаётся ещё 83 года."
  },

  chu: {
    name: "Царство Чу",
    adjective: "чуский",
    color: "#006400",
    flag_emoji: "🐲",
    is_player: false,
    is_minor: false,
    ai_personality: "balanced",
    ai_priority: ["expansion", "military", "economy"],
    government: { type: "monarchy", stability: 55, corruption: 45 },
    regions: ["yangtze_middle", "hubei_plain", "hunan_north", "jiangxi_north", "anhui_south", "henan_south", "jiangsu_north", "zhejiang_north", "guangdong_north", "guizhou_north"],
    population: {
      by_profession: {
        farmers: 2500000, craftsmen: 280000, merchants: 150000,
        soldiers: 180000, nobles: 20000, priests: 15000, slaves: 80000
      }
    },
    economy: {
      gold: 1200,
      income_per_turn: 210,
      trade_routes: ["qi", "wei"],
      stockpile: { grain: 7000, wood: 3000, silk: 1500, lacquer: 800, bronze: 600 }
    },
    military: {
      infantry: 130000,
      cavalry: 15000,
      ships: 600,
      at_war_with: []
    },
    relations: {
      qin: -60, zhao: 20, wei: 10, qi: 20, han: -10, yan: 10,
      xiongnu: -10, gojoseon: 0
    },
    active_laws: [],
    characters: [],
    historical_note: "Чу — крупнейшее по территории Воюющее царство, занимающее весь юг Китая. Несмотря на постоянные потери в войнах с Цинь, Чу остаётся мощной державой с богатейшей культурой — именно здесь расцветает поэзия Цюй Юаня. Царство сочетает древние местные традиции с элементами общекитайской культуры Чжоу."
  },

  // === LEVEL B ===

  zhao: {
    name: "Царство Чжао",
    adjective: "чжаоский",
    color: "#4682B4",
    flag_emoji: "🏹",
    is_player: false,
    is_minor: false,
    ai_personality: "militarist",
    ai_priority: ["military", "expansion", "diplomacy"],
    government: { type: "monarchy", stability: 60, corruption: 40 },
    regions: ["hebei_south", "shanxi_north", "inner_mongolia_south", "shanxi_south"],
    population: { total: 1500000 },
    economy: {
      gold: 600,
      income_per_turn: 95,
      trade_routes: ["yan", "wei", "xiongnu"],
      stockpile: { grain: 2500, horses: 1200, iron: 600 }
    },
    military: { infantry: 80000, cavalry: 25000, ships: 0, at_war_with: [] },
    relations: { qin: -50, chu: 20, wei: 30, qi: 20, han: 20, yan: -10, xiongnu: -30, donghu: -20 },
    active_laws: [], characters: [],
    historical_note: "Чжао — северное Воюющее царство, граничащее со степями. Реформы Улинвана (307 г. до н.э.) ввели кочевнический стиль верховой езды и конную стрельбу из лука, создав мощную кавалерию. Армия Чжао в 304 г. до н.э. — одна из сильнейших в Китае."
  },

  wei: {
    name: "Царство Вэй",
    adjective: "вэйский",
    color: "#9932CC",
    flag_emoji: "⚔️",
    is_player: false,
    is_minor: false,
    ai_personality: "balanced",
    ai_priority: ["economy", "trade", "military"],
    government: { type: "monarchy", stability: 50, corruption: 45 },
    regions: ["henan_north", "shanxi_southeast", "hebei_south_west"],
    population: { total: 1200000 },
    economy: {
      gold: 550,
      income_per_turn: 90,
      trade_routes: ["zhao", "han", "qi", "qin"],
      stockpile: { grain: 2000, iron: 500, bronze: 400 }
    },
    military: { infantry: 70000, cavalry: 12000, ships: 100, at_war_with: [] },
    relations: { qin: -50, chu: 10, zhao: 30, qi: 20, han: 30, yan: 20 },
    active_laws: [], characters: [],
    historical_note: "Вэй — центральное Воюющее царство, некогда сильнейшее среди всех семи, но к 304 г. до н.э. ослабленное войнами с Цинь. Расположено на перекрёстке торговых путей, что делает его богатым, но уязвимым."
  },

  qi: {
    name: "Царство Ци",
    adjective: "циский",
    color: "#DAA520",
    flag_emoji: "📚",
    is_player: false,
    is_minor: false,
    ai_personality: "balanced",
    ai_priority: ["economy", "trade", "diplomacy"],
    government: { type: "monarchy", stability: 65, corruption: 35 },
    regions: ["shandong_peninsula", "hebei_east", "jiangsu_north_coast"],
    population: { total: 1800000 },
    economy: {
      gold: 800,
      income_per_turn: 130,
      trade_routes: ["yan", "wei", "zhao"],
      stockpile: { grain: 3000, fish: 1000, salt: 2000, silk: 800 }
    },
    military: { infantry: 90000, cavalry: 8000, ships: 400, at_war_with: [] },
    relations: { qin: -40, chu: 20, zhao: 20, wei: 20, han: 10, yan: -20 },
    active_laws: [], characters: [],
    historical_note: "Ци — богатейшее восточное Воюющее царство на берегу Жёлтого моря. Академия Цзися в столице Линьцзы — крупнейший интеллектуальный центр древнего мира, где собрались учёные всех школ: конфуцианцы, легисты, даосы, моисты."
  },

  han: {
    name: "Царство Хань",
    adjective: "ханьский",
    color: "#DC143C",
    flag_emoji: "⚔️",
    is_player: false,
    is_minor: false,
    ai_personality: "defensive",
    ai_priority: ["military", "economy", "diplomacy"],
    government: { type: "monarchy", stability: 50, corruption: 40 },
    regions: ["henan_central", "shanxi_south_east"],
    population: { total: 900000 },
    economy: {
      gold: 400,
      income_per_turn: 65,
      trade_routes: ["wei", "chu", "zhao"],
      stockpile: { grain: 1500, iron: 800, bronze: 300 }
    },
    military: { infantry: 50000, cavalry: 5000, ships: 50, at_war_with: [] },
    relations: { qin: -40, chu: -10, zhao: 20, wei: 30, qi: 10, yan: 20 },
    active_laws: [], characters: [],
    historical_note: "Хань — наименьшее из Воюющих царств, зажатое между могучими соседями. Известно превосходными арбалетами, которые делали их пехоту грозной боевой силой. Хань будет первым из семи царств покорено Цинь в 230 г. до н.э."
  },

  yan: {
    name: "Царство Янь",
    adjective: "яньский",
    color: "#20B2AA",
    flag_emoji: "❄️",
    is_player: false,
    is_minor: false,
    ai_personality: "defensive",
    ai_priority: ["economy", "diplomacy", "military"],
    government: { type: "monarchy", stability: 55, corruption: 35 },
    regions: ["hebei_north", "liaoning_west", "beijing_region"],
    population: { total: 1000000 },
    economy: {
      gold: 450,
      income_per_turn: 70,
      trade_routes: ["qi", "zhao", "gojoseon"],
      stockpile: { grain: 2000, furs: 500, horses: 600 }
    },
    military: { infantry: 55000, cavalry: 18000, ships: 200, at_war_with: [] },
    relations: { qin: -30, chu: 10, zhao: -10, qi: -20, han: 20, donghu: -40, gojoseon: 20 },
    active_laws: [], characters: [],
    historical_note: "Янь — северо-восточное Воюющее царство, отрезанное от остального Китая и граничащее с кочевниками дунху. В 300 г. до н.э. Янь проигрывает опустошительную войну Ци, потеряв столицу. Именно из Янь позднее сбежит неудачливый убийца будущего первого императора Китая Цинь Ши Хуанди."
  },

  // === LEVEL C ===

  xiongnu: {
    name: "Сюнну",
    adjective: "сюннуский",
    color: "#8B4513",
    flag_emoji: "🏹",
    is_player: false,
    is_minor: false,
    ai_personality: "raider",
    ai_priority: ["military", "expansion"],
    government: { type: "tribal", stability: 45, corruption: 20 },
    regions: ["outer_mongolia_central", "inner_mongolia_north", "gobi_steppe"],
    population: { total: 300000 },
    economy: { gold: 100, income_per_turn: 25, trade_routes: ["qin", "zhao"], stockpile: { horses: 1500, cattle: 800, furs: 400 } },
    military: { infantry: 10000, cavalry: 60000, ships: 0, at_war_with: [] },
    relations: { qin: -40, zhao: -30, yan: -30, donghu: -40, yuezhi: -30 },
    active_laws: [], characters: [],
    historical_note: "Сюнну — кочевой союз племён Монгольских степей. В 304 г. до н.э. ещё не объединены под единым шаньюем, но уже представляют серьёзную угрозу для северных китайских царств. В следующем веке Модэ-шаньюй создаст великую кочевую империю."
  },

  donghu: {
    name: "Дунху",
    adjective: "дунхуский",
    color: "#556B2F",
    flag_emoji: "🐎",
    is_player: false,
    is_minor: true,
    ai_personality: "raider",
    ai_priority: ["military", "expansion"],
    government: { type: "tribal", stability: 40, corruption: 15 },
    regions: ["liaoning_north", "inner_mongolia_east"],
    population: { total: 150000 },
    economy: { gold: 50, income_per_turn: 12, trade_routes: ["yan"], stockpile: { horses: 800, furs: 300 } },
    military: { infantry: 8000, cavalry: 25000, ships: 0, at_war_with: [] },
    relations: { xiongnu: -40, yan: -30, zhao: -20, gojoseon: -10 },
    active_laws: [], characters: [],
    historical_note: "Дунху — восточные кочевники к северу от Янь и Чжао. Впоследствии разгромлены Сюнну и растворятся в других народах, дав начало сяньби и ухуань."
  },

  yuezhi: {
    name: "Юэчжи",
    adjective: "юэчжийский",
    color: "#B8860B",
    flag_emoji: "🐪",
    is_player: false,
    is_minor: true,
    ai_personality: "balanced",
    ai_priority: ["trade", "military"],
    government: { type: "tribal", stability: 50, corruption: 20 },
    regions: ["gansu_west", "qilian_mountains"],
    population: { total: 200000 },
    economy: { gold: 70, income_per_turn: 18, trade_routes: ["bactria", "qin", "xiongnu"], stockpile: { horses: 1000, jade: 300, furs: 200 } },
    military: { infantry: 10000, cavalry: 30000, ships: 0, at_war_with: [] },
    relations: { xiongnu: -30, qin: -20, bactria: 20, saka: 10 },
    active_laws: [], characters: [],
    historical_note: "Юэчжи — индоевропейские кочевники в Ганьсу, посредники в торговле нефритом между Китаем и Центральной Азией. Впоследствии вытесненные сюнну на запад, они основают Кушанское царство."
  },

  gojoseon: {
    name: "Древний Чосон",
    adjective: "чосонский",
    color: "#CC3333",
    flag_emoji: "🌅",
    is_player: false,
    is_minor: true,
    ai_personality: "defensive",
    ai_priority: ["economy", "diplomacy"],
    government: { type: "monarchy", stability: 60, corruption: 30 },
    regions: ["korea_northwest", "manchuria_south"],
    population: { total: 400000 },
    economy: { gold: 150, income_per_turn: 30, trade_routes: ["yan", "qi"], stockpile: { grain: 1000, bronze: 400, iron: 200 } },
    military: { infantry: 15000, cavalry: 3000, ships: 100, at_war_with: [] },
    relations: { yan: 20, qi: 20, donghu: -10, xiongnu: -20 },
    active_laws: [], characters: [],
    historical_note: "Древний Чосон — первое корейское государство со столицей у Пхеньяна. В 304 г. до н.э. принимает беженцев из охваченного войной Китая и поддерживает торговые отношения с Янь и Ци."
  },

  yayoi_japan: {
    name: "Яёй (Япония)",
    adjective: "яёйский",
    color: "#FF6347",
    flag_emoji: "⛩️",
    is_player: false,
    is_minor: true,
    ai_personality: "defensive",
    ai_priority: ["economy"],
    government: { type: "tribal", stability: 55, corruption: 10 },
    regions: ["northern_kyushu", "western_honshu"],
    population: { total: 200000 },
    economy: { gold: 30, income_per_turn: 10, trade_routes: [], stockpile: { grain: 500, bronze: 150 } },
    military: { infantry: 8000, cavalry: 0, ships: 200, at_war_with: [] },
    relations: { gojoseon: 10 },
    active_laws: [], characters: [],
    historical_note: "Яёйская культура 304 г. до н.э. — переходный период в истории Японии, когда с Корейского полуострова распространяется влажное рисоводство и бронзовые изделия. Японские острова состоят из множества мелких племенных вождеств."
  }
  },
  regions: {},

  // ── Мировой рынок ──
  // Структура записи (Этап 1–2):
  //   base            — базовая цена (константа из GOODS)
  //   price           — текущая рыночная цена (обновляется updateMarketPrices)
  //   supply/demand   — суммарные за тик (агрегируются в updateMarketPrices)
  //   world_stockpile — накопленный мировой запас; null = инициализируется в первый тик
  //   shortage_streak — тиков подряд в зоне дефицита (для экспоненты)
  //   price_history   — массив последних 24 цен (для графиков)
  //   production_cost — себестоимость рецептов (Этап 3, пока null)
  //   price_floor     — нижняя граница = max(production_cost*0.5, base*0.5)
  market: {
    // ── Зерновые ──
    wheat:       { base: 10,  price: 10,  supply: 1000, demand: 1000, world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 5     },
    barley:      { base: 7,   price: 7,   supply: 600,  demand: 600,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 3.5   },
    // ── Морепродукты ──
    fish:        { base: 15,  price: 15,  supply: 500,  demand: 500,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 7.5   },
    tuna:        { base: 22,  price: 22,  supply: 80,   demand: 80,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 11    },
    // ── Масло и фрукты ──
    olives:      { base: 18,  price: 18,  supply: 300,  demand: 300,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 9     },
    olive_oil:   { base: 32,  price: 32,  supply: 200,  demand: 200,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 16    },
    honey:       { base: 45,  price: 45,  supply: 80,   demand: 80,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 22.5  },
    // ── Напитки ──
    wine:        { base: 30,  price: 30,  supply: 250,  demand: 250,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 15    },
    // ── Консерванты ──
    salt:        { base: 18,  price: 18,  supply: 300,  demand: 300,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 9     },
    // ── Металлы ──
    iron:        { base: 45,  price: 45,  supply: 150,  demand: 150,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 22.5  },
    bronze:      { base: 55,  price: 55,  supply: 80,   demand: 80,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 27.5  },
    // ── Дерево ──
    timber:      { base: 22,  price: 22,  supply: 250,  demand: 250,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 11    },
    // ── Текстиль ──
    wool:        { base: 20,  price: 20,  supply: 180,  demand: 180,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 10    },
    cloth:       { base: 28,  price: 28,  supply: 200,  demand: 200,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 14    },
    leather:     { base: 28,  price: 28,  supply: 120,  demand: 120,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 14    },
    // ── Инструменты ──
    tools:       { base: 35,  price: 35,  supply: 100,  demand: 100,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 17.5  },
    pottery:     { base: 15,  price: 15,  supply: 300,  demand: 300,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 7.5   },
    // ── Письменность ──
    papyrus:     { base: 38,  price: 38,  supply: 60,   demand: 60,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 19    },
    wax:         { base: 25,  price: 25,  supply: 80,   demand: 80,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 12.5  },
    // ── Роскошь ──
    incense:     { base: 85,  price: 85,  supply: 30,   demand: 30,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 42.5  },
    purple_dye:  { base: 320, price: 320, supply: 5,    demand: 5,    world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 160   },
    // ── Торговля ──
    trade_goods: { base: 25,  price: 25,  supply: 150,  demand: 150,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 12.5  },
    // ── Сицилийское сырьё ──
    sulfur:      { base: 40,  price: 40,  supply: 40,   demand: 40,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 20    },
    // ── Скот ──
    horses:      { base: 120, price: 120, supply: 80,   demand: 80,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 60    },
    cattle:      { base: 70,  price: 70,  supply: 120,  demand: 120,  world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 35    },
    // ── Рабочая сила ──
    slaves:      { base: 200, price: 200, supply: 50,   demand: 50,   world_stockpile: null, price_history: [], shortage_streak: 0, production_cost: null, price_floor: 100   },
  },
};
