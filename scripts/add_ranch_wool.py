#!/usr/bin/env python3
"""
add_ranch_wool.py
=================
Добавляет ranch (пастбище → шерсть) по всем регионам plains/hills/mountains.
textile_mill требует wool как обязательный вход — без ranch cloth не производится.

Также проверяет цепочку: cattle_farm присутствует → butchery (уже OK).
"""
import re
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGIONS_PATH = os.path.join(BASE, 'data', 'regions_data.js')

# ranch: terrain=[plains, hills, mountains], workers={farmers:300}
RANCH_TERRAINS = {'plains', 'hills', 'mountains'}

# Масштаб: на каждые pop_per_level жителей — +1 единица пастбища
POP_PER_LEVEL = 8_000
MAX_LEVEL      = 12

DRY_RUN = '--dry-run' in sys.argv or '-n' in sys.argv


def make_slot(rid, slot_idx, level):
    return (f'{{slot_id:"{rid}_g{slot_idx}",'
            f'building_id:"ranch",'
            f'status:"active",'
            f'level:{level},'
            f'workers:{{farmers:300}},'
            f'founded_turn:0,revenue:0,wages_paid:0}}')


def process():
    text = open(REGIONS_PATH).read()
    region_re = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")

    additions = {}
    stats = {'added': 0, 'skipped_terrain': 0, 'skipped_has_ranch': 0}

    for m in region_re.finditer(text):
        rid  = m.group(1)
        body = m.group(0)

        terrain_m = re.search(r"terrain:'([^']+)'", body)
        terrain   = terrain_m.group(1) if terrain_m else 'plains'

        if terrain not in RANCH_TERRAINS:
            stats['skipped_terrain'] += 1
            continue

        # Уже есть ranch?
        blds = re.findall(r'building_id:["\'](\w+)["\'],', body)
        if 'ranch' in blds:
            stats['skipped_has_ranch'] += 1
            continue

        pop_m = re.search(r'population:(\d+)', body)
        pop   = int(pop_m.group(1)) if pop_m else 1000

        level = max(1, min(MAX_LEVEL, (pop + POP_PER_LEVEL - 1) // POP_PER_LEVEL))

        slot_ids = re.findall(r'slot_id:["\']r\d+_g(\d+)["\']', body)
        max_slot = max((int(x) for x in slot_ids), default=0)

        additions[rid] = make_slot(rid, max_slot + 1, level)
        stats['added'] += 1

    print(f"Регионов с ranch уже: {stats['skipped_has_ranch']}")
    print(f"Регионов не тот terrain: {stats['skipped_terrain']}")
    print(f"Добавить ranch в: {stats['added']} регионов")

    if DRY_RUN:
        print("[DRY RUN] Файл не изменён.")
        return

    # Применяем
    def replacer(m):
        rid = m.group(1)
        if rid not in additions:
            return m.group(0)
        body = m.group(0)
        new_slot = additions[rid]

        slots_start = body.index('building_slots:[')
        inner_start = slots_start + len('building_slots:[')
        depth = 0
        inner_end = inner_start
        for i, ch in enumerate(body[inner_start:], inner_start):
            if ch == '[':
                depth += 1
            elif ch == ']':
                if depth == 0:
                    inner_end = i
                    break
                depth -= 1

        existing = body[inner_start:inner_end].rstrip()
        return body[:inner_start] + existing + ',' + new_slot + body[inner_end:]

    result = region_re.sub(replacer, text)
    open(REGIONS_PATH, 'w').write(result)
    print(f"Готово: ranch добавлен в {stats['added']} регионов")


if __name__ == '__main__':
    process()
