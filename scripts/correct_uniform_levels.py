#!/usr/bin/env python3
"""
correct_uniform_levels.py
=========================
Исправляет placeholder-уровни зданий, расставленных с одинаковым level
без учёта численности населения.

Признак placeholder: все экземпляры здания имеют ровно одно и то же значение.

Действие: ЗАМЕНЯЕТ level на ceil(population / pop_per_level),
          ограниченный [1, max_level].

Дополнительно: добавляет lumber_camp в 25 регионов с charcoal_kiln,
               где terrain/biome позволяет.
"""

import re
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGIONS_PATH = os.path.join(BASE, 'data', 'regions_data.js')
BIOMES_PATH  = os.path.join(BASE, 'data', 'biomes.js')

DRY_RUN = '--dry-run' in sys.argv or '-n' in sys.argv

# ── Параметры замены уровней ──────────────────────────────────────────────────
# building_id → (placeholder_level, pop_per_level, max_level)
# placeholder_level: единственный уровень, встречающийся в данных
# pop_per_level:  население на одну единицу здания
# max_level:      верхний предел

UNIFORM_FIX = {
    # Скотоводство: 6 фермеров/ед.; для деревни 3000 чел. хватит 1 единицы
    'cattle_farm':       (8,  3_000, 15),
    # Углежжение: 6 рабочих/ед.; небольшие печи — нужны часто
    'charcoal_kiln':     (5,  2_500, 10),
    # Рынок: 200 торговцев/ед.; крупный объект
    'market':            (2,  8_000,  8),
    # Конные хозяйства: аналогично cattle_farm
    'horse_ranch':       (6,  5_000, 10),
    # Гончарная мастерская: 200 ремесленников/ед.
    'pottery_workshop':  (5,  4_000,  8),
    # Гарумный цех: 12 ремесленников/ед., только прибрежные регионы
    'garum_workshop':    (4,  3_000,  8),
    # Ткацкая мастерская: 30 рабочих/ед.
    'textile_mill':      (None, 2_500, 8),   # не uniform, но тоже поправить
}

# ── lumber_camp для charcoal_kiln-регионов ───────────────────────────────────
LUMBER_BIOMES   = {'temperate_forest','alpine','subtropical',
                   'mediterranean_coast','mediterranean_hills'}
LUMBER_TERRAINS = {'mountains','hills'}


def parse_biomes():
    text = open(BIOMES_PATH).read()
    m = re.search(r'const REGION_BIOMES\s*=\s*(\{[^;]+\})', text, re.DOTALL)
    raw = re.sub(r',\s*}', '}', m.group(1))
    return json.loads(raw)


def compute_level(pop, pop_per_level, max_level):
    return max(1, min(max_level, (pop + pop_per_level - 1) // pop_per_level))


def make_lumber_slot(rid, slot_idx, level):
    return (f'{{slot_id:"{rid}_g{slot_idx}",'
            f'building_id:"lumber_camp",'
            f'status:"active",'
            f'level:{level},'
            f'workers:{{craftsmen:15,farmers:5}},'
            f'founded_turn:0,revenue:0,wages_paid:0}}')


def process():
    biomes = parse_biomes()
    text   = open(REGIONS_PATH).read()
    region_re = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")

    # Проверяем: какие здания реально имеют uniform level
    # (определяем здесь, не полагаясь только на словарь)
    level_sets = {}   # building_id → set of levels
    for m in region_re.finditer(text):
        slots = m.group(0)
        for s in re.finditer(r'\{slot_id:[^}]+\}', slots):
            bld_m = re.search(r'building_id:["\'](\w+)["\']', s.group(0))
            lvl_m = re.search(r'level:(\d+)', s.group(0))
            if bld_m and lvl_m:
                b = bld_m.group(1)
                level_sets.setdefault(b, set()).add(int(lvl_m.group(1)))

    # textile_mill разрешаем всегда (не проверяем uniform)
    uniform_buildings = set()
    for b, (placeholder, _, _) in UNIFORM_FIX.items():
        if b == 'textile_mill':
            uniform_buildings.add(b)
            continue
        if placeholder is not None and level_sets.get(b) == {placeholder}:
            uniform_buildings.add(b)
        elif placeholder is None:
            uniform_buildings.add(b)

    print("Здания с uniform уровнями (будут масштабированы):")
    for b in sorted(uniform_buildings):
        pl, ppl, ml = UNIFORM_FIX[b]
        lvls = level_sets.get(b, set())
        print(f"  {b}: текущие уровни={lvls}, pop_per_level={ppl}, max={ml}")

    # Регионы для lumber_camp
    lumber_additions = {}
    for m in region_re.finditer(text):
        rid  = m.group(1)
        body = m.group(0)
        blds = re.findall(r'building_id:["\'](\w+)["\'],', body)
        if 'charcoal_kiln' not in blds or 'lumber_camp' in blds:
            continue
        biome   = biomes.get(rid.lstrip('r'), 'semi_arid')
        terrain_m = re.search(r"terrain:'([^']+)'", body)
        terrain = terrain_m.group(1) if terrain_m else ''
        if biome in LUMBER_BIOMES and terrain in LUMBER_TERRAINS:
            slot_ids = re.findall(r'slot_id:["\']r\d+_g(\d+)["\']', body)
            max_slot = max((int(x) for x in slot_ids), default=0)
            pop_m = re.search(r'population:(\d+)', body)
            pop   = int(pop_m.group(1)) if pop_m else 1000
            level = max(1, min(4, (pop + 5999) // 6000))
            lumber_additions[rid] = (max_slot + 1, level)

    print(f"\nRegions receiving lumber_camp: {len(lumber_additions)}")

    # Статистика изменений
    stats = {}   # building_id → {'n', 'sum_before', 'sum_after'}

    def replace_region(m):
        rid  = m.group(1)
        body = m.group(0)

        pop_m = re.search(r'population:(\d+)', body)
        pop   = int(pop_m.group(1)) if pop_m else 1000

        # Заменяем уровни в слотах
        def replace_slot(sm):
            slot   = sm.group(0)
            bld_m2 = re.search(r'building_id:["\'](\w+)["\']', slot)
            if not bld_m2:
                return slot
            bld_id = bld_m2.group(1)
            if bld_id not in uniform_buildings:
                return slot

            _, pop_per, max_lvl = UNIFORM_FIX[bld_id]
            new_lvl = compute_level(pop, pop_per, max_lvl)

            lvl_m2 = re.search(r'level:(\d+)', slot)
            if not lvl_m2:
                return slot
            old_lvl = int(lvl_m2.group(1))

            if old_lvl == new_lvl:
                return slot

            if bld_id not in stats:
                stats[bld_id] = {'n': 0, 'sum_before': 0, 'sum_after': 0}
            stats[bld_id]['n']          += 1
            stats[bld_id]['sum_before'] += old_lvl
            stats[bld_id]['sum_after']  += new_lvl

            return slot.replace(f'level:{old_lvl}', f'level:{new_lvl}', 1)

        new_body = re.sub(r'\{slot_id:[^}]+\}', replace_slot, body)

        # Добавляем lumber_camp если нужно
        if rid in lumber_additions:
            slot_idx, level = lumber_additions[rid]
            new_slot = make_lumber_slot(rid, slot_idx, level)
            inner_start = new_body.index('building_slots:[') + len('building_slots:[')
            depth, inner_end = 0, inner_start
            for i, ch in enumerate(new_body[inner_start:], inner_start):
                if ch == '[': depth += 1
                elif ch == ']':
                    if depth == 0: inner_end = i; break
                    depth -= 1
            existing = new_body[inner_start:inner_end].rstrip()
            new_body = new_body[:inner_start] + existing + ',' + new_slot + new_body[inner_end:]

        return new_body

    result = region_re.sub(replace_region, text)

    # Отчёт
    total = sum(v['n'] for v in stats.values())
    print(f"\n=== ИСПРАВЛЕНО УРОВНЕЙ: {total} слотов ===")
    for b in sorted(stats, key=lambda x: -stats[x]['n']):
        v = stats[b]
        ab = v['sum_before'] / v['n']
        aa = v['sum_after']  / v['n']
        print(f"  {b:22s} n:{v['n']:5d}  avg {ab:.1f} → {aa:.1f}")

    print(f"\nlumber_camp добавлен в {len(lumber_additions)} регионов")

    if DRY_RUN:
        print("\n[DRY RUN] Файл не изменён.")
        return

    print("\nЗапись...")
    open(REGIONS_PATH, 'w').write(result)
    print("Готово.")


if __name__ == '__main__':
    process()
