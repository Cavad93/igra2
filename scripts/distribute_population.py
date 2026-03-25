#!/usr/bin/env python3
"""
distribute_population.py
========================
Распределяет историческое население наций по их регионам.

Алгоритм:
  weight(region) = fertility × effective_area × terrain_multiplier
  region.population = nation.population.total × weight / sum(weights)

Сумма населения регионов нации = nation.population.total.

Нейтральные регионы — устанавливается население по плотности terrain/fertility.
"""

import re
import json
import sys
import os

# ── Базовое население нейтральных регионов по типу местности ──
# Масштаб игры: небольшая нация с 1 регионом ≈ 12,000–25,000 чел.
# Нейтральные регионы — это «белые пятна» карты, населённые слабее.
# Площадь применяется логарифмически (cap_area) чтобы огромные
# пустынные гексы не получали миллионы жителей.
NEUTRAL_BASE_POP = {
    'coastal_city':       8000,   # город-порт без государства
    'river_valley':       5000,
    'plains':             4000,
    'mediterranean_hills': 3500,
    'hills':              2500,
    'forest':             2000,
    'mountains':          1500,
    'steppe':             1200,
    'marsh':              1500,
    'island':             3000,
    'desert':              800,
    'tundra':              500,
    'default':            2500,
}

# Максимум для нейтрального региона (независимо от площади)
MAX_NEUTRAL_POP = 15000

# Мультипликаторы привлекательности для распределения внутри нации
# Отражает, что города концентрируют население непропорционально площади
TERRAIN_POP_MULT = {
    'coastal_city':        8.0,
    'river_valley':        2.5,
    'plains':              2.0,
    'mediterranean_hills': 1.5,
    'hills':               1.0,
    'forest':              0.8,
    'mountains':           0.5,
    'steppe':              0.6,
    'desert':              0.2,
    'marsh':               0.7,
    'island':              1.5,
    'tundra':              0.1,
    'default':             1.0,
}

# Минимум жителей в любом регионе
MIN_REGION_POP = 500
# Fallback площадь для регионов с area ≈ 0 или отсутствующих в REGION_AREAS
FALLBACK_AREA_KM2 = 1000.0


def parse_region_areas(path):
    """Возвращает dict {rid_str: float} из region_areas.js."""
    text = open(path).read()
    # Ищем объект REGION_AREAS = { ... }
    m = re.search(r'const REGION_AREAS\s*=\s*(\{[^;]+\})', text, re.DOTALL)
    if not m:
        raise ValueError("REGION_AREAS не найден в " + path)
    raw = m.group(1)
    # Убираем trailing comma перед }
    raw = re.sub(r',\s*}', '}', raw)
    return json.loads(raw)


def parse_nations(path):
    """
    Возвращает dict {nation_id: {total: int, regions: [str]}}.
    Парсит строку вида:
      "rome": { ..., "regions": ["r10", ...], "population": {"total": 500000, ...} }
    """
    text = open(path).read()
    nations = {}

    # Разбиваем по записям нации (одна нация — одна строка в js-файле)
    # Ищем "key": { ... } через JSON-парсинг после минимальной предобработки
    # Файл начинается с JS-кода, поэтому ищем начало объекта наций
    m = re.search(r'nations\s*:\s*(\{)', text)
    if not m:
        raise ValueError("Блок nations не найден в " + path)

    # Найти соответствующую закрывающую скобку
    start = m.start(1)
    depth = 0
    end = start
    for i, ch in enumerate(text[start:], start):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    nations_raw = text[start:end]

    # Найти все записи "nation_id": { ... }
    # Каждая нация занимает одну строку (данные по ней)
    for line in nations_raw.split('\n'):
        line = line.strip().rstrip(',')
        if not line.startswith('"'):
            continue
        # Ключ
        km = re.match(r'^"([^"]+)":\s*(\{.+)', line)
        if not km:
            continue
        nation_id = km.group(1)
        obj_str = km.group(2)

        # Вытащить regions: [...]
        rm = re.search(r'"regions"\s*:\s*\[([^\]]*)\]', obj_str)
        if not rm:
            continue
        regions = re.findall(r'"(r\d+)"', rm.group(1))

        # Вытащить population.total
        pm = re.search(r'"population"\s*:\s*\{[^}]*"total"\s*:\s*(\d+)', obj_str)
        if not pm:
            continue
        total = int(pm.group(1))

        nations[nation_id] = {'total': total, 'regions': regions}

    return nations


def parse_regions(path):
    """
    Возвращает dict {rid: {nation, terrain, fertility, population}}.
    """
    text = open(path).read()
    regions = {}

    pattern = re.compile(
        r"R\['(r\d+)'\]\s*=\s*\{([^;]+)\};"
    )

    for m in pattern.finditer(text):
        rid = m.group(1)
        body = m.group(0)

        nation_m = re.search(r"nation:'([^']+)'", body)
        terrain_m = re.search(r"terrain:'([^']+)'", body)
        fertility_m = re.search(r"fertility:([\d.]+)", body)
        pop_m = re.search(r"population:(\d+)", body)

        nation = nation_m.group(1) if nation_m else 'neutral'
        terrain = terrain_m.group(1) if terrain_m else 'default'
        fertility = float(fertility_m.group(1)) if fertility_m else 0.5
        population = int(pop_m.group(1)) if pop_m else 1000

        regions[rid] = {
            'nation': nation,
            'terrain': terrain,
            'fertility': fertility,
            'population': population,
        }

    return regions


def region_weight(rid, region, areas):
    """Вес региона при распределении населения нации."""
    terrain = region['terrain']
    fertility = region['fertility']
    area = float(areas.get(rid.lstrip('r'), areas.get(rid, 0.0)))
    if area < 10.0:
        area = FALLBACK_AREA_KM2
    mult = TERRAIN_POP_MULT.get(terrain, TERRAIN_POP_MULT['default'])
    return fertility * area * mult


def neutral_population(rid, region, areas):
    """Базовое население для нейтрального региона."""
    terrain = region['terrain']
    fertility = max(region['fertility'], 0.1)
    base = NEUTRAL_BASE_POP.get(terrain, NEUTRAL_BASE_POP['default'])
    # Масштабируем по плодородию: fertility 0.5 → 1×base, 1.0 → 1.4×base, 0.1 → 0.6×base
    pop = int(base * (0.6 + 0.8 * fertility))
    pop = min(pop, MAX_NEUTRAL_POP)
    return max(pop, MIN_REGION_POP)


def distribute(nations, regions, areas):
    """
    Возвращает dict {rid: new_population}.

    Источник правды — поле `nation` каждого региона в regions_data.js.
    Данные о населении берём из nations.js по совпадению nation_id.

    Нейтральные регионы получают оценочное население по плотности terrain.
    """
    new_pops = {}

    # Группируем регионы по нации (из regions_data.js, не из nations.js)
    nation_to_regions = {}
    for rid, region in regions.items():
        nid = region['nation']
        nation_to_regions.setdefault(nid, []).append(rid)

    # Нейтральные регионы
    for rid in nation_to_regions.get('neutral', []):
        new_pops[rid] = neutral_population(rid, regions[rid], areas)

    # Нации с данными в nations.js
    for nation_id, ndata in nations.items():
        if nation_id == 'neutral':
            continue
        total_pop = ndata['total']
        nation_regions = nation_to_regions.get(nation_id, [])

        if not nation_regions:
            continue

        weights = {rid: region_weight(rid, regions[rid], areas)
                   for rid in nation_regions}
        total_weight = sum(weights.values())

        if total_weight == 0:
            per = max(total_pop // len(nation_regions), MIN_REGION_POP)
            for rid in nation_regions:
                new_pops[rid] = per
            continue

        # Пропорциональное распределение с корректировкой суммы
        raw = {rid: total_pop * w / total_weight for rid, w in weights.items()}

        # Применяем минимум, накапливаем «долг»
        assigned = {}
        surplus = 0
        for rid in nation_regions:
            val = max(int(raw[rid]), MIN_REGION_POP)
            surplus += val - int(raw[rid])  # сколько «добавили» из минимума
            assigned[rid] = val

        # Корректируем: убавляем из самых больших регионов до нужной суммы
        current_sum = sum(assigned.values())
        diff = current_sum - total_pop  # лишнее
        if diff > 0:
            # Убавляем из регионов по убыванию веса
            sorted_rids = sorted(nation_regions, key=lambda r: weights[r], reverse=True)
            for rid in sorted_rids:
                can_remove = assigned[rid] - MIN_REGION_POP
                remove = min(diff, can_remove)
                assigned[rid] -= remove
                diff -= remove
                if diff <= 0:
                    break
        elif diff < 0:
            # Добавляем к самому большому региону
            max_rid = max(nation_regions, key=lambda r: weights[r])
            assigned[max_rid] -= diff  # diff отрицательный

        new_pops.update(assigned)

    # Регионы с нацией, которой нет в nations.js — нейтральная оценка
    all_nation_ids = set(nations.keys()) | {'neutral'}
    for nid, rids in nation_to_regions.items():
        if nid not in all_nation_ids:
            for rid in rids:
                if rid not in new_pops:
                    new_pops[rid] = neutral_population(rid, regions[rid], areas)

    return new_pops


def apply_populations(regions_path, new_pops):
    """Обновляет population:N в regions_data.js."""
    text = open(regions_path).read()

    def replace_pop(m):
        rid = m.group(1)
        if rid in new_pops:
            old = m.group(0)
            new = re.sub(r'population:\d+', f'population:{new_pops[rid]}', old)
            return new
        return m.group(0)

    # Заменяем построчно для каждого региона
    result = re.sub(
        r"R\['(r\d+)'\]=\{[^;]+\};",
        replace_pop,
        text
    )

    open(regions_path, 'w').write(result)


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    regions_path = os.path.join(base, 'data', 'regions_data.js')
    nations_path = os.path.join(base, 'data', 'nations.js')
    areas_path   = os.path.join(base, 'data', 'region_areas.js')

    print("Загрузка данных...")
    areas   = parse_region_areas(areas_path)
    regions = parse_regions(regions_path)
    nations = parse_nations(nations_path)

    print(f"  Регионов: {len(regions)}")
    print(f"  Наций:    {len(nations)}")
    print(f"  Площадей: {len(areas)}")

    print("Распределение населения...")
    new_pops = distribute(nations, regions, areas)

    # Статистика
    total_assigned = sum(new_pops.values())
    nation_total = sum(n['total'] for n in nations.values())
    neutral_count = sum(1 for r in regions.values() if r['nation'] == 'neutral')
    neutral_pop = sum(new_pops[rid] for rid, r in regions.items()
                      if r['nation'] == 'neutral' and rid in new_pops)

    print(f"\n=== СТАТИСТИКА ===")
    print(f"Население наций (итого): {nation_total:,}")
    print(f"Нейтральных регионов:    {neutral_count} (~{neutral_pop:,} чел.)")
    print(f"Всего населения на карте:{total_assigned:,}")

    # Проверка наций (по nation поля в регионах — источник правды)
    nation_to_regions_check = {}
    for rid, region in regions.items():
        nid = region['nation']
        nation_to_regions_check.setdefault(nid, []).append(rid)

    no_regions = []
    mismatches = []
    for nation_id, ndata in nations.items():
        if nation_id == 'neutral':
            continue
        rids = [r for r in nation_to_regions_check.get(nation_id, []) if r in new_pops]
        if not rids:
            no_regions.append(nation_id)
            continue
        s = sum(new_pops[r] for r in rids)
        if abs(s - ndata['total']) > 100:
            mismatches.append((nation_id, ndata['total'], s))
    if no_regions:
        print(f"\nНации без регионов на карте: {len(no_regions)}")
        for n in no_regions[:5]:
            print(f"  ... и ещё ({len(no_regions)}) без регионов")
            break
    if mismatches:
        print(f"\nНесоответствия (>{100}): {len(mismatches)}")
        for nm in mismatches[:10]:
            print(f"  {nm[0]}: ожидалось {nm[1]:,}, получилось {nm[2]:,}")
    else:
        print("Все нации с регионами сбалансированы.")

    print("\nЗапись в regions_data.js...")
    apply_populations(regions_path, new_pops)
    print("Готово.")


if __name__ == '__main__':
    main()
