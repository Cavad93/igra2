#!/usr/bin/env python3
"""Classify all Land/Coastal regions in map.json into 13 biomes."""

import json
import os

# ── Biome metadata ─────────────────────────────────────────────────────────────
# Единственный источник истины для всех полей биомов.
# Запуск скрипта регенерирует data/biomes.js — не редактировать JS вручную.
BIOME_META = {
    "mediterranean_coast": {
        "name": "Средиземноморское побережье",
        "description": "Прибрежные регионы Средиземного моря — мягкий климат, торговые пути, рыболовство",
        "color": "#4A9E8F",
        "icon": "🌊",
        "production_bonus": {"food": 1.1, "trade": 1.3, "fish": 1.5},
        "movement_cost": 1.0,
        "agriculture": {"suitability": 0.70, "arable": 0.40, "wheat_share": 0.45, "yield_kg": 1000, "stability": "средняя"},
    },
    "mediterranean_hills": {
        "name": "Средиземноморские холмы",
        "description": "Внутренние холмы и равнины Средиземноморья — виноградники, оливы, зерно",
        "color": "#8FBF5A",
        "icon": "🫒",
        "production_bonus": {"food": 1.2, "wine": 1.4, "olives": 1.4},
        "movement_cost": 1.2,
        "agriculture": {"suitability": 0.60, "arable": 0.55, "wheat_share": 0.50, "yield_kg": 800, "stability": "средняя"},
    },
    "river_valley": {
        "name": "Речная долина",
        "description": "Великие речные долины древнего мира — плодородные наносные почвы, ирригация",
        "color": "#5DB87A",
        "icon": "💧",
        "production_bonus": {"food": 1.5, "grain": 1.6, "population": 1.2},
        "movement_cost": 0.9,
        "agriculture": {"suitability": 0.95, "arable": 0.75, "wheat_share": 0.55, "yield_kg": 1350, "stability": "высокая"},
    },
    "desert": {
        "name": "Пустыня",
        "description": "Настоящая пустыня — Сахара, Аравия, Ливия. Осадки < 200 мм/год",
        "color": "#D4AA5A",
        "icon": "🏜️",
        "production_bonus": {"trade": 0.8, "food": 0.4},
        "movement_cost": 1.8,
        "agriculture": {"suitability": 0.02, "arable": 0.02, "wheat_share": 0.00, "yield_kg": 0, "stability": "нет"},
    },
    "steppe": {
        "name": "Степь",
        "description": "Евразийская степь — Скифия, Сарматия, Центральная Азия. Пастбища и конница",
        "color": "#C8C06A",
        "icon": "🐎",
        "production_bonus": {"horses": 1.5, "livestock": 1.3, "food": 0.7},
        "movement_cost": 0.9,
        "agriculture": {"suitability": 0.40, "arable": 0.35, "wheat_share": 0.40, "yield_kg": 500, "stability": "оч.низкая"},
    },
    "temperate_forest": {
        "name": "Умеренный лес",
        "description": "Листопадные леса Галлии, Германии, Британии, Иллирии",
        "color": "#3A7D44",
        "icon": "🌲",
        "production_bonus": {"lumber": 1.5, "hunting": 1.3, "food": 0.9},
        "movement_cost": 1.5,
        "agriculture": {"suitability": 0.50, "arable": 0.40, "wheat_share": 0.35, "yield_kg": 650, "stability": "средняя"},
    },
    "alpine": {
        "name": "Высокогорье",
        "description": "Альпы, Кавказ, Загрос, Тавр, Атлас — горные массивы выше 1500 м",
        "color": "#8A9BAF",
        "icon": "⛰️",
        "production_bonus": {"mining": 1.4, "livestock": 1.1, "food": 0.6},
        "movement_cost": 2.5,
        "agriculture": {"suitability": 0.10, "arable": 0.08, "wheat_share": 0.20, "yield_kg": 200, "stability": "оч.низкая"},
    },
    "semi_arid": {
        "name": "Полузасушливый",
        "description": "Нумидия, Мавретания, Анатолийское плато — переход между пустыней и Средиземноморьем",
        "color": "#C4A66A",
        "icon": "☀️",
        "production_bonus": {"livestock": 1.2, "food": 0.7, "trade": 0.9},
        "movement_cost": 1.4,
        "agriculture": {"suitability": 0.35, "arable": 0.25, "wheat_share": 0.30, "yield_kg": 450, "stability": "низкая"},
    },
    "subtropical": {
        "name": "Субтропики",
        "description": "Левант, Финикия, Вавилония, западная Персия — плодородный полумесяц",
        "color": "#7DB87A",
        "icon": "🌴",
        "production_bonus": {"food": 1.3, "trade": 1.2, "dates": 1.4},
        "movement_cost": 1.1,
        "agriculture": {"suitability": 0.45, "arable": 0.45, "wheat_share": 0.30, "yield_kg": 600, "stability": "низкая"},
    },
    "savanna": {
        "name": "Саванна",
        "description": "Тропическая саванна — Нубия, Эфиопия, Судан, западная Африка",
        "color": "#B8A838",
        "icon": "🦁",
        "production_bonus": {"ivory": 1.5, "livestock": 1.1, "food": 0.8},
        "movement_cost": 1.3,
        "agriculture": {"suitability": 0.15, "arable": 0.15, "wheat_share": 0.10, "yield_kg": 150, "stability": "низкая"},
    },
    "volcanic": {
        "name": "Вулканический",
        "description": "Вулканические зоны — Этна, Везувий, Эолийские острова, Санторини",
        "color": "#8B3A2A",
        "icon": "🌋",
        "production_bonus": {"food": 1.4, "minerals": 1.3, "sulfur": 1.6},
        "movement_cost": 1.6,
        "agriculture": {"suitability": 0.85, "arable": 0.50, "wheat_share": 0.40, "yield_kg": 1500, "stability": "высокая"},
    },
    "arctic": {
        "name": "Арктика / Субарктика",
        "description": "Северная Скандинавия и Русский север — суровый климат, тундра",
        "color": "#C8DDE8",
        "icon": "❄️",
        "production_bonus": {"fish": 1.2, "furs": 1.5, "food": 0.3},
        "movement_cost": 2.0,
        "agriculture": {"suitability": 0.00, "arable": 0.00, "wheat_share": 0.00, "yield_kg": 0, "stability": "нет"},
    },
    "tropical": {
        "name": "Тропики",
        "description": "Экваториальная Африка, южная Индия, Юго-Восточная Азия — влажные джунгли",
        "color": "#1A7A3A",
        "icon": "🌿",
        "production_bonus": {"exotic_goods": 1.6, "lumber": 1.3, "food": 0.9},
        "movement_cost": 1.7,
        "agriculture": {"suitability": 0.20, "arable": 0.20, "wheat_share": 0.15, "yield_kg": 250, "stability": "низкая"},
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
        meta_lines.append(
            f'  "{biome_id}": {{\n'
            f'    "id": "{biome_id}",\n'
            f'    "name": {json.dumps(meta["name"], ensure_ascii=False)},\n'
            f'    "description": {json.dumps(meta["description"], ensure_ascii=False)},\n'
            f'    "color": "{meta["color"]}",\n'
            f'    "icon": "{meta["icon"]}",\n'
            f'    "production_bonus": {bonus_str},\n'
            f'    "movement_cost": {meta["movement_cost"]},\n'
            f'    "agriculture": {agri_str}\n'
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
