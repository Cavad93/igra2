#!/usr/bin/env python3
"""
place_buildings.py
==================
Размещает здания по всем регионам карты для обеспечения рыночного баланса.

Приоритеты (волны):
  Волна 1. Продовольствие: butchery (скот→мясо), apiary (мёд/воск),
           granary (хранение зерна), irrigation (plains/river_valley)
  Волна 2. Средиземноморские товары: olive_grove, oil_press, winery
  Волна 3. Промышленность: forge (оружие/инструменты), bronze_foundry
  Волна 4. Торговля и логистика: trading_post, slave_market
  Волна 5. Специальные культуры: papyrus_bed, hemp_field, pitch_works

Ограничения:
  - terrain_restriction: список допустимых типов местности
  - location_requirement: biome (проверяем REGION_BIOMES) / deposit / none
  - prerequisites: здание добавляется только если уже есть нужное предусловие
  - max_per_region (для зданий с ограничением 1 на регион)
  - Нейтральные регионы тоже получают здания (независимые поселения)
"""

import re
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Конфигурация волн размещения ──────────────────────────────────────────────
# Каждый элемент:
#   (building_id, terrain_set_or_None, biomes_or_None, deposit_or_None,
#    prerequisites, max_per_region, worker_professions)
#
# terrain_set: множество допустимых terrain; None = без ограничений
# biomes:      список допустимых биомов из REGION_BIOMES; None = без ограничений
# deposit:     ключ из region.deposits; None = не нужен
# prerequisites: список building_id хотя бы одно из которых уже должно быть в регионе
# max_per_region: int или None (None = без лимита, мы ставим 1 если не указано)
# worker_professions: dict {profession: count}

WAVES = [
    # ── Волна 1: Продовольствие ──────────────────────────────────────────────
    # butchery: перерабатывает скот в мясо; нужен там где есть cattle_farm
    dict(id='butchery',
         terrain=None,
         biomes=None,
         deposit=None,
         prereq=['cattle_farm', 'horse_ranch', 'ranch'],
         max_per=2,
         workers={'craftsmen': 15},
         ),

    # apiary: мёд и воск — нужны везде кроме пустынь/арктики/гор
    dict(id='apiary',
         terrain=None,
         biomes=None,
         exclude_biomes=['desert', 'arctic', 'alpine'],
         deposit=None,
         prereq=None,
         max_per=1,
         workers={'farmers': 4},
         ),

    # granary: хранение зерна — в зерновых регионах
    dict(id='granary',
         terrain=None,
         biomes=None,
         deposit=None,
         prereq=['wheat_family_farm', 'wheat_villa', 'wheat_latifundium',
                 'farm', 'grain_estate'],
         max_per=1,
         workers={'farmers': 50},
         ),

    # irrigation: орошение — plains и river_valley
    dict(id='irrigation',
         terrain={'plains', 'river_valley'},
         biomes=None,
         deposit=None,
         prereq=['wheat_family_farm', 'wheat_villa', 'farm', 'grain_estate'],
         max_per=1,
         workers={'farmers': 100},
         ),

    # ── Волна 2: Средиземноморские товары ────────────────────────────────────
    # olive_grove: биом средиземноморский
    dict(id='olive_grove',
         terrain=None,
         biomes=['mediterranean_coast', 'mediterranean_hills', 'volcanic', 'subtropical'],
         deposit=None,
         prereq=None,
         max_per=2,
         workers={'farmers': 15, 'slaves': 5},
         ),

    # oil_press: переработка оливок; нужны оливы (olive_grove в регионе)
    # terrain: hills, plains, coastal_city; biome: mediterranean*
    dict(id='oil_press',
         terrain={'hills', 'plains', 'coastal_city'},
         biomes=['mediterranean_coast', 'mediterranean_hills', 'volcanic', 'subtropical'],
         deposit=None,
         prereq=['olive_grove'],
         max_per=2,
         workers={'farmers': 100, 'slaves': 100},
         ),

    # winery: производство вина; биом средиземноморский или умеренный лес
    dict(id='winery',
         terrain={'hills', 'river_valley'},
         biomes=['mediterranean_hills', 'volcanic', 'mediterranean_coast',
                 'subtropical', 'temperate_forest'],
         deposit=None,
         prereq=None,
         max_per=2,
         workers={'craftsmen': 150, 'farmers': 50},
         ),

    # ── Волна 3: Промышленность ───────────────────────────────────────────────
    # forge: кузница — оружие, инструменты; повсеместно
    dict(id='forge',
         terrain=None,
         biomes=None,
         deposit=None,
         prereq=None,
         max_per=1,
         workers={'craftsmen': 15, 'slaves': 5},
         ),

    # bronze_foundry: литейня — у кого есть медь или олово
    dict(id='bronze_foundry',
         terrain=None,
         biomes=None,
         deposit=None,
         prereq_deposit=['copper', 'tin'],   # хотя бы один из депозитов
         max_per=1,
         workers={'craftsmen': 20, 'slaves': 5},
         ),

    # tannery: кожевня — у кого есть скотоводство (дополнительные)
    dict(id='tannery',
         terrain=None,
         biomes=None,
         exclude_biomes=['arctic', 'desert'],
         deposit=None,
         prereq=['cattle_farm', 'horse_ranch', 'ranch'],
         max_per=1,
         workers={'craftsmen': 20},
         ),

    # ── Волна 4: Торговля ─────────────────────────────────────────────────────
    # trading_post: везде где есть рынок или порт
    dict(id='trading_post',
         terrain=None,
         biomes=None,
         deposit=None,
         prereq=['market', 'port'],
         max_per=1,
         workers={'merchants': 30},
         ),

    # slave_market: в портовых городах
    dict(id='slave_market',
         terrain=None,
         biomes=None,
         deposit=None,
         prereq=['port'],
         max_per=1,
         workers={'merchants': 15},
         ),

    # ── Волна 5: Специальные культуры ─────────────────────────────────────────
    # papyrus_bed: речные долины и субтропики
    dict(id='papyrus_bed',
         terrain={'river_valley', 'coastal_city'},
         biomes=['river_valley', 'subtropical'],
         deposit=None,
         prereq=None,
         max_per=1,
         workers={'farmers': 80, 'slaves': 40},
         ),

    # hemp_field: умеренный лес, степи — для верёвок и парусины (моряки)
    dict(id='hemp_field',
         terrain=None,
         biomes=['temperate_forest', 'steppe', 'river_valley'],
         deposit=None,
         prereq=None,
         max_per=1,
         workers={'farmers': 15},
         ),

    # pitch_works: смола для кораблей — умеренный лес
    dict(id='pitch_works',
         terrain=None,
         biomes=['temperate_forest'],
         deposit=None,
         prereq=['port', 'shipyard', 'lumber_camp'],
         max_per=1,
         workers={'craftsmen': 7, 'farmers': 3},
         ),
]

# ── Парсинг ────────────────────────────────────────────────────────────────────

def parse_region_biomes(path):
    """Возвращает {rid_str: biome_str} из biomes.js."""
    text = open(path).read()
    m = re.search(r'const REGION_BIOMES\s*=\s*(\{[^;]+\})', text, re.DOTALL)
    if not m:
        raise ValueError("REGION_BIOMES не найден в " + path)
    raw = re.sub(r',\s*}', '}', m.group(1))
    return json.loads(raw)


def parse_regions_raw(path):
    """
    Возвращает dict {rid: {terrain, nation, population, deposits, buildings_in_slots, max_slot_idx}}.
    Не парсит JS полностью — только нужные поля через regex.
    """
    text = open(path).read()
    regions = {}
    pattern = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")
    for m in pattern.finditer(text):
        rid = m.group(1)
        body = m.group(2)

        terrain_m = re.search(r"terrain:'([^']+)'", body)
        nation_m  = re.search(r"nation:'([^']+)'", body)
        pop_m     = re.search(r"population:(\d+)", body)
        dep_m     = re.search(r"deposits:\{([^}]*)\}", body)

        terrain    = terrain_m.group(1) if terrain_m else 'plains'
        nation     = nation_m.group(1)  if nation_m  else 'neutral'
        population = int(pop_m.group(1)) if pop_m else 1000

        deposits = {}
        if dep_m:
            for kv in re.finditer(r'(\w+):([\d.]+)', dep_m.group(1)):
                deposits[kv.group(1)] = float(kv.group(2))

        # Здания уже в building_slots
        bld_in_slots = re.findall(r'building_id:["\'](\w+)["\'],', body)

        # Максимальный индекс слота
        slot_ids = re.findall(r'slot_id:["\']r\d+_g(\d+)["\']', body)
        max_slot = max((int(x) for x in slot_ids), default=0)

        regions[rid] = {
            'terrain':      terrain,
            'nation':       nation,
            'population':   population,
            'deposits':     deposits,
            'buildings':    bld_in_slots,
            'max_slot':     max_slot,
        }
    return regions


# ── Логика проверки условий размещения ────────────────────────────────────────

def can_place(rule, region, biome, current_buildings):
    """True если здание можно добавить в регион."""
    # Проверка terrain
    if rule.get('terrain') and region['terrain'] not in rule['terrain']:
        return False

    # Проверка biome (если задан)
    if rule.get('biomes') and biome not in rule['biomes']:
        return False

    # Исключить биомы
    if rule.get('exclude_biomes') and biome in rule['exclude_biomes']:
        return False

    # Проверка deposit-prerequisite (для bronze_foundry и т.п.)
    if rule.get('prereq_deposit'):
        if not any(d in region['deposits'] for d in rule['prereq_deposit']):
            return False

    # Проверка обычных prerequisites (хотя бы одно здание из списка)
    # Используем current_buildings чтобы учесть только что добавленные в этом проходе
    if rule.get('prereq'):
        if not any(b in current_buildings for b in rule['prereq']):
            return False

    return True


def count_in_slots(buildings, building_id):
    return buildings.count(building_id)


# ── Генерация нового слота ─────────────────────────────────────────────────────

def make_slot(rid, slot_idx, building_id, workers_dict):
    """Форматирует новый building_slot как JS-строку."""
    workers_js = ','.join(f'{k}:{v}' for k, v in workers_dict.items())
    return (
        f'{{slot_id:"{rid}_g{slot_idx}",'
        f'building_id:"{building_id}",'
        f'status:"active",'
        f'level:1,'
        f'workers:{{{workers_js}}},'
        f'founded_turn:0,'
        f'revenue:0,'
        f'wages_paid:0}}'
    )


# ── Применение к файлу ─────────────────────────────────────────────────────────

def apply_buildings(regions_path, additions):
    """
    additions: {rid: [slot_js_str, ...]}
    Вставляет новые слоты в building_slots:[...] каждого региона.
    """
    text = open(regions_path).read()

    def replacer(m):
        rid = m.group(1)
        if rid not in additions or not additions[rid]:
            return m.group(0)

        new_slots = additions[rid]
        original = m.group(0)

        # Найти конец building_slots:[ ... ]
        slots_start = original.index('building_slots:[')
        inner_start = slots_start + len('building_slots:[')

        # Ищем закрывающую ]
        depth = 0
        inner_end = inner_start
        for i, ch in enumerate(original[inner_start:], inner_start):
            if ch == '[':
                depth += 1
            elif ch == ']':
                if depth == 0:
                    inner_end = i
                    break
                depth -= 1

        existing_content = original[inner_start:inner_end].rstrip()
        new_part = (',' if existing_content else '') + ','.join(new_slots)
        result = (
            original[:inner_start]
            + existing_content
            + new_part
            + original[inner_end:]
        )
        return result

    result = re.sub(r"R\['(r\d+)'\]=\{[^;]+\};", replacer, text)
    open(regions_path, 'w').write(result)


# ── Главный алгоритм ──────────────────────────────────────────────────────────

def main():
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv

    regions_path = os.path.join(BASE, 'data', 'regions_data.js')
    biomes_path  = os.path.join(BASE, 'data', 'biomes.js')

    print("Загрузка данных...")
    biomes  = parse_region_biomes(biomes_path)  # {"52": "mediterranean_coast", ...}
    regions = parse_regions_raw(regions_path)

    print(f"  Регионов: {len(regions)}")

    # Статистика до
    before = {}
    for rid, r in regions.items():
        for b in r['buildings']:
            before[b] = before.get(b, 0) + 1

    # Генерируем добавления
    additions = {}   # {rid: [slot_str, ...]}
    stats = {}       # {building_id: count_added}

    for rid, region in regions.items():
        rid_num = rid.lstrip('r')
        biome = biomes.get(rid_num, 'semi_arid')  # fallback
        slot_idx = region['max_slot']

        current_buildings = list(region['buildings'])  # рабочая копия

        region_additions = []

        for rule in WAVES:
            bld_id = rule['id']
            max_per = rule.get('max_per', 1)

            # Сколько уже есть
            cur_count = count_in_slots(current_buildings, bld_id)
            if cur_count >= max_per:
                continue

            # Нужно добавить max_per - cur_count штук
            to_add = max_per - cur_count

            for _ in range(to_add):
                if not can_place(rule, region, biome, current_buildings):
                    break

                slot_idx += 1
                slot_str = make_slot(rid, slot_idx, bld_id, rule['workers'])
                region_additions.append(slot_str)

                # Обновляем текущий список для след. правил (prerequisite-chain)
                current_buildings.append(bld_id)
                stats[bld_id] = stats.get(bld_id, 0) + 1

        if region_additions:
            additions[rid] = region_additions

    # Статистика
    total_added = sum(stats.values())
    print(f"\n=== ДОБАВЛЕНО ЗДАНИЙ: {total_added} ===")
    for bld_id in sorted(stats, key=lambda x: -stats[x]):
        before_cnt = before.get(bld_id, 0)
        print(f"  {bld_id:25s} было:{before_cnt:5d}  +{stats[bld_id]:5d}  итого:{before_cnt+stats[bld_id]:5d}")

    affected = len(additions)
    print(f"\nРегионов с новыми зданиями: {affected}")

    if dry_run:
        print("\n[DRY RUN] Файл не изменён.")
        return

    print("\nЗапись в regions_data.js...")
    apply_buildings(regions_path, additions)
    print("Готово.")


if __name__ == '__main__':
    main()
