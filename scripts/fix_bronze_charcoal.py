#!/usr/bin/env python3
"""
fix_bronze_charcoal.py
Добавляет charcoal_kiln в bronze_foundry регионы без угольного производства.
Также добавляет wheat_family_farm в elephant_corral регионы без пшеницы.
"""
import re, json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGIONS_PATH = os.path.join(BASE, 'data', 'regions_data.js')
BIOMES_PATH  = os.path.join(BASE, 'data', 'biomes.js')

CHARCOAL_BIOMES = {'temperate_forest', 'alpine', 'steppe', 'semi_arid',
                   'mediterranean_hills', 'mediterranean_coast', 'subtropical'}
WHEAT_FARMS = {'wheat_family_farm', 'wheat_villa', 'wheat_latifundium', 'farm', 'grain_estate'}


def make_slot(rid, slot_idx, building_id, level, workers_js):
    return (f'{{slot_id:"{rid}_g{slot_idx}",'
            f'building_id:"{building_id}",'
            f'status:"active",'
            f'level:{level},'
            f'workers:{{{workers_js}}},'
            f'founded_turn:0,revenue:0,wages_paid:0}}')


def parse_biomes():
    text = open(BIOMES_PATH).read()
    m = re.search(r'const REGION_BIOMES\s*=\s*(\{[^;]+\})', text, re.DOTALL)
    return json.loads(re.sub(r',\s*}', '}', m.group(1)))


def process():
    biomes = parse_biomes()
    text   = open(REGIONS_PATH).read()
    pattern = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")

    additions = {}   # rid → [(slot_idx, building_id, level, workers_js)]

    for m in pattern.finditer(text):
        rid  = m.group(1)
        body = m.group(0)
        blds = set(re.findall(r'building_id:["\'](\w+)["\'],', body))

        slot_ids = re.findall(r'slot_id:["\']r\d+_g(\d+)["\']', body)
        max_slot = max((int(x) for x in slot_ids), default=0)
        pop_m    = re.search(r'population:(\d+)', body)
        pop      = int(pop_m.group(1)) if pop_m else 1000
        biome    = biomes.get(rid.lstrip('r'), 'semi_arid')

        entries = []

        # 1. bronze_foundry без charcoal_kiln
        if 'bronze_foundry' in blds and 'charcoal_kiln' not in blds:
            level = max(1, min(6, (pop + 2499) // 2500))
            max_slot += 1
            entries.append((max_slot, 'charcoal_kiln', level,
                            'craftsmen:4,farmers:2'))
            print(f'  charcoal → {rid} (pop={pop}, biome={biome})')

        # 2. elephant_corral без пшеницы
        if 'elephant_corral' in blds and not (blds & WHEAT_FARMS):
            level = max(1, min(8, (pop + 4999) // 5000))
            max_slot += 1
            entries.append((max_slot, 'wheat_family_farm', level,
                            'farmers:5'))
            print(f'  wheat   → {rid} (elephant_corral, pop={pop})')

        if entries:
            additions[rid] = entries

    print(f'\nTotal regions to fix: {len(additions)}')

    region_re = re.compile(r"R\['(r\d+)'\]=\{[^;]+\};")

    def replacer(m):
        rid = m.group(1)
        if rid not in additions:
            return m.group(0)
        body = m.group(0)

        slots_start = body.index('building_slots:[')
        inner_start = slots_start + len('building_slots:[')
        depth = 0
        inner_end = inner_start
        for i, ch in enumerate(body[inner_start:], inner_start):
            if ch == '[': depth += 1
            elif ch == ']':
                if depth == 0: inner_end = i; break
                depth -= 1

        existing = body[inner_start:inner_end].rstrip()
        new_slots = ','.join(make_slot(rid, si, bid, lvl, wjs)
                             for si, bid, lvl, wjs in additions[rid])
        return body[:inner_start] + existing + ',' + new_slots + body[inner_end:]

    result = region_re.sub(replacer, text)
    open(REGIONS_PATH, 'w').write(result)
    print('Готово.')


if __name__ == '__main__':
    process()
