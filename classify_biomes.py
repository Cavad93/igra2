#!/usr/bin/env python3
"""Classify all Land/Coastal regions in map.json into 13 biomes."""

import json
import os

# ── Biome metadata ─────────────────────────────────────────────────────────────
# Единственный источник истины для всех полей биомов.
# Запуск скрипта регенерирует data/biomes.js — не редактировать JS вручную.
BIOME_META = {
    # goods_bonus: мультипликатор к базовой выработке здания для каждого товара.
    # 1.0 = нейтрально, >1.0 = благоприятный биом, <1.0 = неблагоприятный.
    # 0.0 = товар физически невозможен в этом биоме (ресурса нет).
    # Охват: все 41 товар игры.
    # Обработанные товары (bronze, cloth, tools, weapons, armor, pottery, garum, wax)
    #   имеют 1.0 везде — их выход зависит от сырья, а не от биома.
    "mediterranean_coast": {
        "name": "Средиземноморское побережье",
        "description": "Прибрежные регионы Средиземного моря — мягкий климат, торговые пути, рыболовство",
        "color": "#4A9E8F",
        "icon": "🌊",
        "production_bonus": {"food": 1.1, "trade": 1.3, "fish": 1.5},
        "movement_cost": 1.0,
        "agriculture": {"suitability": 0.70, "arable": 0.40, "wheat_share": 0.45, "yield_kg": 1000, "stability": "средняя"},
        "goods_bonus": {
            # еда
            "wheat": 1.15, "barley": 1.10, "fish": 1.30, "tuna": 1.20, "olives": 1.20,
            "olive_oil": 1.20, "wine": 1.10, "honey": 1.10, "garum": 1.20, "meat": 0.80, "salt": 1.20,
            # сырьё и материалы
            "wool": 0.90, "cloth": 1.00, "leather": 0.90, "iron": 0.80, "bronze": 1.00,
            "timber": 0.70, "tools": 1.00, "pottery": 1.00,
            # специальные
            "papyrus": 0.30, "wax": 1.00, "incense": 0.10, "purple_dye": 1.50,
            "trade_goods": 1.25, "sulfur": 0.50,
            # животные/люди
            "horses": 0.50, "cattle": 0.80, "slaves": 1.00, "war_elephants": 0.00,
            # руда и минералы
            "copper": 0.40, "tin": 0.20, "silver": 0.20, "gold": 0.10,
            "charcoal": 0.60, "stone": 0.80, "hemp": 0.80, "pitch": 0.50,
            # люкс
            "amber": 0.10, "furs": 0.20,
            # крафт
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "mediterranean_hills": {
        "name": "Средиземноморские холмы",
        "description": "Внутренние холмы и равнины Средиземноморья — виноградники, оливы, зерно",
        "color": "#8FBF5A",
        "icon": "🫒",
        "production_bonus": {"food": 1.2, "wine": 1.4, "olives": 1.4},
        "movement_cost": 1.2,
        "agriculture": {"suitability": 0.60, "arable": 0.55, "wheat_share": 0.50, "yield_kg": 800, "stability": "средняя"},
        "goods_bonus": {
            "wheat": 1.00, "barley": 1.00, "fish": 0.70, "tuna": 0.00, "olives": 1.35,
            "olive_oil": 1.35, "wine": 1.40, "honey": 1.20, "garum": 0.60, "meat": 0.90, "salt": 0.70,
            "wool": 1.10, "cloth": 1.00, "leather": 1.00, "iron": 1.00, "bronze": 1.00,
            "timber": 0.80, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.10, "wax": 1.10, "incense": 0.10, "purple_dye": 0.10,
            "trade_goods": 0.80, "sulfur": 0.70,
            "horses": 0.60, "cattle": 0.90, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.60, "tin": 0.30, "silver": 0.50, "gold": 0.30,
            "charcoal": 0.80, "stone": 1.00, "hemp": 0.70, "pitch": 0.60,
            "amber": 0.10, "furs": 0.30,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "river_valley": {
        "name": "Речная долина",
        "description": "Великие речные долины древнего мира — плодородные наносные почвы, ирригация",
        "color": "#5DB87A",
        "icon": "💧",
        "production_bonus": {"food": 1.5, "grain": 1.6, "population": 1.2},
        "movement_cost": 0.9,
        "agriculture": {"suitability": 0.95, "arable": 0.75, "wheat_share": 0.55, "yield_kg": 1350, "stability": "высокая"},
        "goods_bonus": {
            "wheat": 1.40, "barley": 1.30, "fish": 1.00, "tuna": 0.00, "olives": 0.60,
            "olive_oil": 0.60, "wine": 0.70, "honey": 1.00, "garum": 0.60, "meat": 0.80, "salt": 0.60,
            "wool": 0.70, "cloth": 1.15, "leather": 0.80, "iron": 0.50, "bronze": 1.00,
            "timber": 0.60, "tools": 1.00, "pottery": 1.10,
            "papyrus": 1.20, "wax": 0.90, "incense": 0.10, "purple_dye": 0.10,
            "trade_goods": 0.90, "sulfur": 0.20,
            "horses": 0.60, "cattle": 0.90, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.20, "tin": 0.10, "silver": 0.10, "gold": 0.20,
            "charcoal": 0.50, "stone": 0.90, "hemp": 1.10, "pitch": 0.40,
            "amber": 0.10, "furs": 0.30,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "desert": {
        "name": "Пустыня",
        "description": "Настоящая пустыня — Сахара, Аравия, Ливия. Осадки < 200 мм/год",
        "color": "#D4AA5A",
        "icon": "🏜️",
        "production_bonus": {"trade": 0.8, "food": 0.4},
        "movement_cost": 1.8,
        "agriculture": {"suitability": 0.02, "arable": 0.02, "wheat_share": 0.00, "yield_kg": 0, "stability": "нет"},
        "goods_bonus": {
            "wheat": 0.05, "barley": 0.10, "fish": 0.00, "tuna": 0.00, "olives": 0.10,
            "olive_oil": 0.10, "wine": 0.10, "honey": 0.20, "garum": 0.10, "meat": 0.50, "salt": 1.10,
            "wool": 0.50, "cloth": 1.00, "leather": 0.60, "iron": 0.30, "bronze": 1.00,
            "timber": 0.10, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.00, "wax": 0.30, "incense": 0.30, "purple_dye": 0.00,
            "trade_goods": 0.80, "sulfur": 0.40,
            "horses": 0.40, "cattle": 0.30, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.30, "tin": 0.10, "silver": 0.20, "gold": 0.20,
            "charcoal": 0.10, "stone": 0.70, "hemp": 0.20, "pitch": 0.00,
            "amber": 0.00, "furs": 0.10,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "steppe": {
        "name": "Степь",
        "description": "Евразийская степь — Скифия, Сарматия, Центральная Азия. Пастбища и конница",
        "color": "#C8C06A",
        "icon": "🐎",
        "production_bonus": {"horses": 1.5, "livestock": 1.3, "food": 0.7},
        "movement_cost": 0.9,
        "agriculture": {"suitability": 0.40, "arable": 0.35, "wheat_share": 0.40, "yield_kg": 500, "stability": "оч.низкая"},
        "goods_bonus": {
            "wheat": 0.85, "barley": 0.90, "fish": 0.10, "tuna": 0.00, "olives": 0.20,
            "olive_oil": 0.20, "wine": 0.40, "honey": 0.80, "garum": 0.20, "meat": 1.30, "salt": 0.30,
            "wool": 1.20, "cloth": 1.00, "leather": 1.10, "iron": 0.60, "bronze": 1.00,
            "timber": 0.30, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.00, "wax": 0.70, "incense": 0.00, "purple_dye": 0.00,
            "trade_goods": 0.80, "sulfur": 0.30,
            "horses": 1.50, "cattle": 1.10, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.30, "tin": 0.20, "silver": 0.30, "gold": 0.20,
            "charcoal": 0.30, "stone": 0.50, "hemp": 0.90, "pitch": 0.20,
            "amber": 0.30, "furs": 0.60,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "temperate_forest": {
        "name": "Умеренный лес",
        "description": "Листопадные леса Галлии, Германии, Британии, Иллирии",
        "color": "#3A7D44",
        "icon": "🌲",
        "production_bonus": {"lumber": 1.5, "hunting": 1.3, "food": 0.9},
        "movement_cost": 1.5,
        "agriculture": {"suitability": 0.50, "arable": 0.40, "wheat_share": 0.35, "yield_kg": 650, "stability": "средняя"},
        "goods_bonus": {
            "wheat": 0.80, "barley": 0.85, "fish": 0.20, "tuna": 0.00, "olives": 0.10,
            "olive_oil": 0.10, "wine": 0.60, "honey": 1.30, "garum": 0.30, "meat": 1.20, "salt": 0.20,
            "wool": 1.10, "cloth": 1.00, "leather": 1.10, "iron": 0.90, "bronze": 1.00,
            "timber": 1.30, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.10, "wax": 1.20, "incense": 0.00, "purple_dye": 0.00,
            "trade_goods": 0.70, "sulfur": 0.20,
            "horses": 0.80, "cattle": 1.20, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.50, "tin": 0.80, "silver": 0.40, "gold": 0.30,
            "charcoal": 1.30, "stone": 0.70, "hemp": 1.20, "pitch": 1.30,
            "amber": 0.80, "furs": 1.30,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "alpine": {
        "name": "Высокогорье",
        "description": "Альпы, Кавказ, Загрос, Тавр, Атлас — горные массивы выше 1500 м",
        "color": "#8A9BAF",
        "icon": "⛰️",
        "production_bonus": {"mining": 1.4, "livestock": 1.1, "food": 0.6},
        "movement_cost": 2.5,
        "agriculture": {"suitability": 0.10, "arable": 0.08, "wheat_share": 0.20, "yield_kg": 200, "stability": "оч.низкая"},
        "goods_bonus": {
            "wheat": 0.20, "barley": 0.25, "fish": 0.00, "tuna": 0.00, "olives": 0.20,
            "olive_oil": 0.20, "wine": 0.30, "honey": 0.70, "garum": 0.10, "meat": 1.10, "salt": 0.20,
            "wool": 1.10, "cloth": 1.00, "leather": 0.90, "iron": 1.15, "bronze": 1.00,
            "timber": 1.20, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.00, "wax": 0.70, "incense": 0.00, "purple_dye": 0.00,
            "trade_goods": 0.60, "sulfur": 0.50,
            "horses": 0.70, "cattle": 0.90, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 1.10, "tin": 0.60, "silver": 0.80, "gold": 0.60,
            "charcoal": 1.00, "stone": 1.30, "hemp": 0.40, "pitch": 0.80,
            "amber": 0.10, "furs": 0.60,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "semi_arid": {
        "name": "Полузасушливый",
        "description": "Нумидия, Мавретания, Анатолийское плато — переход между пустыней и Средиземноморьем",
        "color": "#C4A66A",
        "icon": "☀️",
        "production_bonus": {"livestock": 1.2, "food": 0.7, "trade": 0.9},
        "movement_cost": 1.4,
        "agriculture": {"suitability": 0.35, "arable": 0.25, "wheat_share": 0.30, "yield_kg": 450, "stability": "низкая"},
        "goods_bonus": {
            "wheat": 0.45, "barley": 0.55, "fish": 0.00, "tuna": 0.00, "olives": 0.40,
            "olive_oil": 0.40, "wine": 0.50, "honey": 0.40, "garum": 0.20, "meat": 1.20, "salt": 1.15,
            "wool": 1.00, "cloth": 1.00, "leather": 1.00, "iron": 0.70, "bronze": 1.00,
            "timber": 0.20, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.00, "wax": 0.50, "incense": 0.20, "purple_dye": 0.00,
            "trade_goods": 0.90, "sulfur": 0.40,
            "horses": 1.10, "cattle": 0.80, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.60, "tin": 0.30, "silver": 0.40, "gold": 0.30,
            "charcoal": 0.20, "stone": 0.80, "hemp": 0.50, "pitch": 0.10,
            "amber": 0.00, "furs": 0.20,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "subtropical": {
        "name": "Субтропики",
        "description": "Левант, Финикия, Вавилония, западная Персия — плодородный полумесяц",
        "color": "#7DB87A",
        "icon": "🌴",
        "production_bonus": {"food": 1.3, "trade": 1.2, "dates": 1.4},
        "movement_cost": 1.1,
        "agriculture": {"suitability": 0.45, "arable": 0.45, "wheat_share": 0.30, "yield_kg": 600, "stability": "низкая"},
        "goods_bonus": {
            "wheat": 0.70, "barley": 0.75, "fish": 1.10, "tuna": 0.50, "olives": 0.50,
            "olive_oil": 0.50, "wine": 0.70, "honey": 0.80, "garum": 0.60, "meat": 0.90, "salt": 0.60,
            "wool": 0.70, "cloth": 1.00, "leather": 0.80, "iron": 0.60, "bronze": 1.00,
            "timber": 0.70, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.20, "wax": 0.80, "incense": 1.40, "purple_dye": 0.50,
            "trade_goods": 1.10, "sulfur": 0.30,
            "horses": 0.70, "cattle": 0.80, "slaves": 1.00, "war_elephants": 0.30,
            "copper": 0.50, "tin": 0.20, "silver": 0.30, "gold": 0.20,
            "charcoal": 0.60, "stone": 0.70, "hemp": 0.80, "pitch": 0.50,
            "amber": 0.00, "furs": 0.20,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "savanna": {
        "name": "Саванна",
        "description": "Тропическая саванна — Нубия, Эфиопия, Судан, западная Африка",
        "color": "#B8A838",
        "icon": "🦁",
        "production_bonus": {"ivory": 1.5, "livestock": 1.1, "food": 0.8},
        "movement_cost": 1.3,
        "agriculture": {"suitability": 0.15, "arable": 0.15, "wheat_share": 0.10, "yield_kg": 150, "stability": "низкая"},
        "goods_bonus": {
            "wheat": 0.30, "barley": 0.35, "fish": 0.30, "tuna": 0.00, "olives": 0.10,
            "olive_oil": 0.10, "wine": 0.30, "honey": 0.60, "garum": 0.20, "meat": 1.10, "salt": 0.40,
            "wool": 0.90, "cloth": 1.00, "leather": 1.00, "iron": 0.40, "bronze": 1.00,
            "timber": 0.40, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.10, "wax": 0.60, "incense": 0.80, "purple_dye": 0.00,
            "trade_goods": 0.70, "sulfur": 0.20,
            "horses": 0.60, "cattle": 0.80, "slaves": 1.00, "war_elephants": 1.50,
            "copper": 0.40, "tin": 0.20, "silver": 0.30, "gold": 0.50,
            "charcoal": 0.40, "stone": 0.50, "hemp": 0.40, "pitch": 0.20,
            "amber": 0.00, "furs": 0.30,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "volcanic": {
        "name": "Вулканический",
        "description": "Вулканические зоны — Этна, Везувий, Эолийские острова, Санторини",
        "color": "#8B3A2A",
        "icon": "🌋",
        "production_bonus": {"food": 1.4, "minerals": 1.3, "sulfur": 1.6},
        "movement_cost": 1.6,
        "agriculture": {"suitability": 0.85, "arable": 0.50, "wheat_share": 0.40, "yield_kg": 1500, "stability": "высокая"},
        "goods_bonus": {
            "wheat": 1.05, "barley": 1.00, "fish": 0.90, "tuna": 0.90, "olives": 1.10,
            "olive_oil": 1.10, "wine": 1.15, "honey": 0.90, "garum": 0.80, "meat": 0.70, "salt": 0.80,
            "wool": 0.80, "cloth": 1.00, "leather": 0.80, "iron": 0.90, "bronze": 1.00,
            "timber": 0.60, "tools": 1.00, "pottery": 1.10,
            "papyrus": 0.10, "wax": 0.90, "incense": 0.00, "purple_dye": 0.50,
            "trade_goods": 0.90, "sulfur": 1.40,
            "horses": 0.40, "cattle": 0.70, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.60, "tin": 0.20, "silver": 0.40, "gold": 0.30,
            "charcoal": 0.60, "stone": 1.20, "hemp": 0.70, "pitch": 0.40,
            "amber": 0.00, "furs": 0.10,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "arctic": {
        "name": "Арктика / Субарктика",
        "description": "Северная Скандинавия и Русский север — суровый климат, тундра",
        "color": "#C8DDE8",
        "icon": "❄️",
        "production_bonus": {"fish": 1.2, "furs": 1.5, "food": 0.3},
        "movement_cost": 2.0,
        "agriculture": {"suitability": 0.00, "arable": 0.00, "wheat_share": 0.00, "yield_kg": 0, "stability": "нет"},
        "goods_bonus": {
            "wheat": 0.05, "barley": 0.05, "fish": 1.20, "tuna": 1.10, "olives": 0.00,
            "olive_oil": 0.00, "wine": 0.00, "honey": 0.50, "garum": 0.80, "meat": 1.00, "salt": 0.30,
            "wool": 0.80, "cloth": 1.00, "leather": 0.90, "iron": 0.50, "bronze": 1.00,
            "timber": 1.10, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.00, "wax": 0.60, "incense": 0.00, "purple_dye": 0.00,
            "trade_goods": 0.60, "sulfur": 0.10,
            "horses": 0.60, "cattle": 0.60, "slaves": 1.00, "war_elephants": 0.00,
            "copper": 0.30, "tin": 0.40, "silver": 0.20, "gold": 0.10,
            "charcoal": 0.90, "stone": 0.60, "hemp": 0.60, "pitch": 0.80,
            "amber": 1.50, "furs": 1.50,
            "weapons": 1.00, "armor": 1.00,
        },
    },
    "tropical": {
        "name": "Тропики",
        "description": "Экваториальная Африка, южная Индия, Юго-Восточная Азия — влажные джунгли",
        "color": "#1A7A3A",
        "icon": "🌿",
        "production_bonus": {"exotic_goods": 1.6, "lumber": 1.3, "food": 0.9},
        "movement_cost": 1.7,
        "agriculture": {"suitability": 0.20, "arable": 0.20, "wheat_share": 0.15, "yield_kg": 250, "stability": "низкая"},
        "goods_bonus": {
            "wheat": 0.15, "barley": 0.20, "fish": 1.15, "tuna": 0.30, "olives": 0.10,
            "olive_oil": 0.10, "wine": 0.40, "honey": 0.90, "garum": 0.40, "meat": 0.80, "salt": 0.20,
            "wool": 0.50, "cloth": 1.00, "leather": 0.70, "iron": 0.30, "bronze": 1.00,
            "timber": 1.30, "tools": 1.00, "pottery": 1.00,
            "papyrus": 0.30, "wax": 0.80, "incense": 0.50, "purple_dye": 0.00,
            "trade_goods": 0.70, "sulfur": 0.20,
            "horses": 0.40, "cattle": 0.60, "slaves": 1.00, "war_elephants": 0.40,
            "copper": 0.30, "tin": 0.20, "silver": 0.10, "gold": 0.40,
            "charcoal": 1.10, "stone": 0.40, "hemp": 0.70, "pitch": 0.80,
            "amber": 0.00, "furs": 0.50,
            "weapons": 1.00, "armor": 1.00,
        },
    },
}

# ── Classification rules (priority top-to-bottom) ─────────────────────────────
def classify(region_type, lon, lat):
    # RULE 1 — Volcanoes
    if 14.8 <= lon <= 15.4 and 37.4 <= lat <= 38.2:
        return "volcanic"
    if 14.2 <= lon <= 14.7 and 40.7 <= lat <= 41.1:
        return "volcanic"
    if 25.3 <= lon <= 25.6 and 36.3 <= lat <= 36.6:
        return "volcanic"

    # RULE 2 — River valleys
    if 29 <= lon <= 34 and 22 <= lat <= 32:
        return "river_valley"
    if 38 <= lon <= 48 and 31 <= lat <= 37:
        return "river_valley"
    if 8 <= lon <= 13 and 44 <= lat <= 46:
        return "river_valley"
    if 30 <= lon <= 33 and 30 <= lat <= 32:
        return "river_valley"

    # RULE 3 — Deserts
    if -10 <= lon <= 35 and 15 <= lat <= 30 and region_type == "Land":
        return "desert"
    if 35 <= lon <= 60 and 15 <= lat <= 30:
        return "desert"

    # RULE 4 — Steppe
    if 25 <= lon <= 60 and 44 <= lat <= 56:
        return "steppe"
    if 60 <= lon <= 90 and 35 <= lat <= 52:
        return "steppe"

    # RULE 5 — Alpine
    if 6 <= lon <= 16 and 45.5 <= lat <= 48:
        return "alpine"
    if 38 <= lon <= 50 and 41 <= lat <= 44:
        return "alpine"
    if 44 <= lon <= 50 and 32 <= lat <= 38:
        return "alpine"
    if 30 <= lon <= 42 and 37 <= lat <= 40:
        return "alpine"
    if -5 <= lon <= 10 and 32 <= lat <= 36:
        return "alpine"

    # RULE 6 — Temperate forest + Arctic
    if lat > 62:
        return "arctic"
    if -5 <= lon <= 18 and 47 <= lat <= 55:
        return "temperate_forest"
    if -8 <= lon <= 2 and 50 <= lat <= 60:
        return "temperate_forest"
    if 15 <= lon <= 30 and 43 <= lat <= 48:
        return "temperate_forest"

    # RULE 7 — Subtropical
    if 35 <= lon <= 42 and 30 <= lat <= 38:
        return "subtropical"
    if 42 <= lon <= 48 and 30 <= lat <= 36:
        return "subtropical"
    if 48 <= lon <= 56 and 30 <= lat <= 38:
        return "subtropical"

    # RULE 8 — Mediterranean coast
    if region_type == "Coastal" and -10 <= lon <= 42 and 28 <= lat <= 47:
        return "mediterranean_coast"

    # RULE 9 — Savanna
    if 5 <= lat <= 20 and lon < 50:
        return "savanna"

    # RULE 10 — Fallback
    if lat > 47:
        return "temperate_forest"
    if 40 <= lat <= 47 and lon < 40:
        return "mediterranean_hills"
    if 30 <= lat < 40:
        return "semi_arid"
    if 15 <= lat < 30:
        return "desert"
    return "tropical"


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    with open("map.json", encoding="utf-8") as f:
        data = json.load(f)

    geometry = data["geometry"]
    skip_types = {"Ocean", "Strait", "Lake", "Impassible", "Place Holder Regions"}

    # Collect regions per biome
    biome_regions = {b: [] for b in BIOME_META}

    total = 0
    for region_id, region in geometry.items():
        rtype = region.get("type", "")
        if rtype in skip_types:
            continue

        coords = json.loads(region["centroid"])["coordinates"]
        lon, lat = coords[0], coords[1]

        biome = classify(rtype, lon, lat)
        biome_regions[biome].append(int(region_id))
        total += 1

    # Build REGION_BIOMES lookup: { region_id_str: biome_id }
    region_biomes = {}
    for biome_id, regions in biome_regions.items():
        for rid in sorted(regions):
            region_biomes[str(rid)] = biome_id

    # Serialise BIOME_META as JS object literal
    meta_lines = []
    for biome_id, meta in BIOME_META.items():
        agri = meta["agriculture"]
        agri_str = (
            f'{{ "suitability": {agri["suitability"]}, "arable": {agri["arable"]}, '
            f'"wheat_share": {agri["wheat_share"]}, "yield_kg": {agri["yield_kg"]}, '
            f'"stability": "{agri["stability"]}" }}'
        )
        bonus_str = json.dumps(meta["production_bonus"], ensure_ascii=False)
        goods_str = json.dumps(meta["goods_bonus"], ensure_ascii=False)
        meta_lines.append(
            f'  "{biome_id}": {{\n'
            f'    "id": "{biome_id}",\n'
            f'    "name": {json.dumps(meta["name"], ensure_ascii=False)},\n'
            f'    "description": {json.dumps(meta["description"], ensure_ascii=False)},\n'
            f'    "color": "{meta["color"]}",\n'
            f'    "icon": "{meta["icon"]}",\n'
            f'    "production_bonus": {bonus_str},\n'
            f'    "movement_cost": {meta["movement_cost"]},\n'
            f'    "agriculture": {agri_str},\n'
            f'    "goods_bonus": {goods_str}\n'
            f'  }}'
        )
    biome_meta_js = "const BIOME_META = {\n" + ",\n".join(meta_lines) + "\n};"

    # Serialise REGION_BIOMES as a compact single-line JSON object
    region_biomes_js = "const REGION_BIOMES = " + json.dumps(region_biomes, ensure_ascii=False) + ";"

    js_content = (
        "// AUTO-GENERATED by classify_biomes.py — do not edit directly\n"
        "// Biome metadata and per-region lookup\n\n"
        + biome_meta_js + "\n\n"
        + region_biomes_js + "\n"
    )

    out_path = os.path.join("data", "biomes.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    # Summary
    print(f"✓ Classified {total} regions → wrote {out_path}")
    print()
    print(f"{'Biome':<25} {'Count':>6}")
    print("-" * 33)
    for biome_id in BIOME_META:
        n = len(biome_regions[biome_id])
        print(f"{biome_id:<25} {n:>6}")


if __name__ == "__main__":
    main()
