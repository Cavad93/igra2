#!/usr/bin/env python3
"""
fix_oil_press_chain.py
Добавляет oil_press в регионы с olive_grove где terrain=mountains/river_valley
(там terrain_restriction не позволял разместить автоматически).
"""
import re, json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

biomes_path  = os.path.join(BASE, 'data', 'biomes.js')
regions_path = os.path.join(BASE, 'data', 'regions_data.js')

# Load biomes
text = open(biomes_path).read()
m = re.search(r'const REGION_BIOMES\s*=\s*(\{[^;]+\})', text, re.DOTALL)
raw = re.sub(r',\s*}', '}', m.group(1))
biomes = json.loads(raw)

# Find olive_grove-without-oil_press in mediterranean biomes
reg_text = open(regions_path).read()
pattern = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")

targets = {}
for m in pattern.finditer(reg_text):
    rid = m.group(1)
    body = m.group(0)
    blds = re.findall(r'building_id:["\'](\w+)["\'],', body)
    if 'olive_grove' in blds and 'oil_press' not in blds:
        biome = biomes.get(rid.lstrip('r'), 'semi_arid')
        if biome in ['mediterranean_hills', 'mediterranean_coast', 'volcanic', 'subtropical']:
            slot_ids = re.findall(r'slot_id:["\']r\d+_g(\d+)["\']', body)
            max_slot = max((int(x) for x in slot_ids), default=0)
            pop_m = re.search(r'population:(\d+)', body)
            pop = int(pop_m.group(1)) if pop_m else 1000
            level = max(1, min(10, (pop + 9999) // 10000))
            targets[rid] = (max_slot + 1, level)

print(f'Регионов для исправления: {len(targets)}')

# Apply
text = open(regions_path).read()

def make_slot(rid, slot_idx, level):
    return (f'{{slot_id:"{rid}_g{slot_idx}",'
            f'building_id:"oil_press",'
            f'status:"active",'
            f'level:{level},'
            f'workers:{{farmers:100,slaves:100}},'
            f'founded_turn:0,revenue:0,wages_paid:0}}')

region_re = re.compile(r"R\['(r\d+)'\]=\{[^;]+\};")

def replacer(m):
    rid = m.group(1)
    if rid not in targets:
        return m.group(0)
    body = m.group(0)
    slot_idx, level = targets[rid]
    new_slot = make_slot(rid, slot_idx, level)

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
open(regions_path, 'w').write(result)
print(f'Готово: oil_press добавлен в {len(targets)} регионов')
