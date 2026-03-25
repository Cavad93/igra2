#!/usr/bin/env python3
"""
scale_mine_levels.py
====================
Масштабирует уровни рудников и добывающих зданий по:
  - населению региона (больше людей = больше рабочих в шахтах)
  - силе месторождения (deposits[key] > 1.0 = богатое)

Формула: level = max(1, min(max_level, ceil(pop / pop_per_level) * deposit_mult))
deposit_mult: deposits[key] (1.5 = 50% бонус к уровню)

Только повышает level (не понижает существующие высокие значения).
"""
import re
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGIONS_PATH = os.path.join(BASE, 'data', 'regions_data.js')

# (building_id, deposit_key, pop_per_level, max_level)
MINE_PARAMS = [
    ('iron_mine',     'iron',          8_000,  4),
    ('copper_mine',   'copper',        10_000, 4),
    ('silver_mine',   'silver',        12_000, 3),
    ('gold_mine',     'gold',          15_000, 3),
    ('tin_mine',      'tin',           10_000, 3),
    ('sulfur_mine',   'sulfur',        10_000, 3),
    ('quarry',        'stone',         8_000,  4),
    ('salt_works',    'salt',          6_000,  5),  # соль — ключевой товар
    ('amber_gathering','amber',        10_000, 3),
    ('fur_trapping',  'furs',          8_000,  3),
    ('incense_grove', 'incense',       8_000,  3),
    ('elephant_corral','war_elephants',10_000, 3),
    ('tuna_trap',     None,            5_000,  5),  # тунец — у берегов
    ('fishery',       None,            4_000,  5),  # рыбная ловля
    ('garum_workshop',None,            8_000,  4),  # рыбный соус
    ('lumber_camp',   None,            6_000,  4),  # лесозаготовка
    ('charcoal_kiln', None,            6_000,  4),  # углежжение
    ('papyrus_bed',   None,            8_000,  4),  # папирусные угодья
]

DRY_RUN = '--dry-run' in sys.argv or '-n' in sys.argv


def compute_level(pop, deposit_strength, pop_per_level, max_level):
    base_level = max(1, (pop + pop_per_level - 1) // pop_per_level)
    # Сильное месторождение → +50% к уровню (округление вверх)
    mult = deposit_strength if deposit_strength > 1.0 else 1.0
    level = int(base_level * mult + 0.5)
    return max(1, min(max_level, level))


def process():
    text = open(REGIONS_PATH).read()
    region_re = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")

    # Индекс: building_id → (deposit_key, pop_per_level, max_level)
    mine_index = {b[0]: b for b in MINE_PARAMS}

    stats = {}  # building_id → {'n': count, 'before': sum, 'after': sum}

    def replace_region(m):
        rid  = m.group(1)
        body = m.group(0)

        pop_m = re.search(r'population:(\d+)', body)
        pop   = int(pop_m.group(1)) if pop_m else 1000

        # Парсим deposits
        dep_m = re.search(r'deposits:\{([^}]*)\}', body)
        deposits = {}
        if dep_m:
            for kv in re.finditer(r'(\w+):([\d.]+)', dep_m.group(1)):
                deposits[kv.group(1)] = float(kv.group(2))

        def replace_slot(sm):
            slot = sm.group(0)
            bld_m = re.search(r'building_id:["\'](\w+)["\']', slot)
            if not bld_m:
                return slot
            bld_id = bld_m.group(1)
            if bld_id not in mine_index:
                return slot

            _, deposit_key, pop_per, max_lvl = mine_index[bld_id]
            dep_strength = deposits.get(deposit_key, 1.0) if deposit_key else 1.0

            new_lvl = compute_level(pop, dep_strength, pop_per, max_lvl)

            lvl_m = re.search(r'level:(\d+)', slot)
            if not lvl_m:
                return slot
            old_lvl = int(lvl_m.group(1))
            final_lvl = max(old_lvl, new_lvl)

            if final_lvl == old_lvl:
                return slot

            if bld_id not in stats:
                stats[bld_id] = {'n': 0, 'before': 0, 'after': 0}
            stats[bld_id]['n']      += 1
            stats[bld_id]['before'] += old_lvl
            stats[bld_id]['after']  += final_lvl

            return slot.replace(f'level:{old_lvl}', f'level:{final_lvl}', 1)

        return re.sub(r'\{slot_id:[^}]+\}', replace_slot, body)

    result = region_re.sub(replace_region, text)

    total = sum(v['n'] for v in stats.values())
    print(f"\n=== ОБНОВЛЕНО: {total} слотов ===")
    for bld_id in sorted(stats, key=lambda x: -stats[x]['n']):
        v = stats[bld_id]
        avg_b = v['before'] / v['n']
        avg_a = v['after']  / v['n']
        print(f"  {bld_id:20s} n:{v['n']:5d}  avg {avg_b:.1f} → {avg_a:.1f}")

    if DRY_RUN:
        print("\n[DRY RUN] Файл не изменён.")
        return

    print("\nЗапись...")
    open(REGIONS_PATH, 'w').write(result)
    print("Готово.")


if __name__ == '__main__':
    process()
