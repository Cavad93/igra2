#!/usr/bin/env python3
"""
scale_building_levels.py
========================
Масштабирует level зданий по населению региона.

level = количество однотипных зданий на одном слоте.
workers = рабочие на ОДНУ единицу здания (workers_per_unit).
Итого занятых = workers × level.

Целевая пропорция: на каждые POP_PER_LEVEL жителей — +1 единица здания.
Существующие здания с level > 1 не понижаются.
Нижняя граница level = 1, верхняя зависит от типа здания.
"""

import re
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Параметры масштабирования ────────────────────────────────────────────────
# (building_id: (pop_per_level, max_level))
#
# pop_per_level — сколько жителей "оправдывают" одну дополнительную единицу
# max_level     — потолок: нет смысла ставить 50 кузниц даже в Риме
#
SCALE_PARAMS = {
    # Продовольствие (мелкие)
    'butchery':       (8_000,  15),   # бойня на каждые 8к жителей
    'apiary':         (15_000, 8),    # пасека — редкий объект
    'granary':        (10_000, 12),   # зернохранилище
    'irrigation':     (10_000, 10),   # ирригационные каналы

    # Средиземноморские культуры
    'olive_grove':    (8_000,  12),   # оливковая роща
    'oil_press':      (10_000, 10),   # давильня
    'winery':         (8_000,  12),   # винодельня

    # Промышленность
    'forge':          (6_000,  15),   # кузница — нужна везде
    'tannery':        (8_000,  12),   # кожевня
    'bronze_foundry': (15_000, 8),    # бронзовая литейня — крупный объект

    # Торговля
    'trading_post':   (20_000, 8),    # торговый пост
    'slave_market':   (30_000, 5),    # невольничий рынок — редкость

    # Специальные культуры
    'papyrus_bed':    (8_000,  10),   # папирусные угодья
    'hemp_field':     (10_000, 8),    # конопляное поле
    'pitch_works':    (15_000, 6),    # смоловарня
}

# Здания, которые уже были расставлены ДО моего скрипта с правильными уровнями
# — их трогать НЕ надо (только не понижать)
ORIGINAL_BUILDINGS = {
    'port', 'market', 'tuna_trap', 'salt_works', 'fishery',
    'garum_workshop', 'wheat_family_farm', 'cattle_farm', 'workshop',
    'charcoal_kiln', 'textile_mill', 'lumber_camp', 'pottery_workshop',
    'wheat_villa', 'wheat_latifundium', 'horse_ranch',
    'iron_mine', 'copper_mine', 'silver_mine', 'gold_mine', 'tin_mine',
    'sulfur_mine', 'quarry', 'elephant_corral', 'amber_gathering',
    'fur_trapping', 'incense_grove', 'warehouse', 'mine',
    'farm', 'grain_estate', 'ranch', 'shipyard',
}


def compute_level(pop, building_id):
    if building_id not in SCALE_PARAMS:
        return None   # не обрабатываем
    pop_per, max_lvl = SCALE_PARAMS[building_id]
    lvl = max(1, (pop + pop_per - 1) // pop_per)  # ceil division
    return min(lvl, max_lvl)


def process(regions_path, dry_run=False):
    text = open(regions_path).read()

    # Регулярка для одного региона
    region_re = re.compile(r"R\['(r\d+)'\]=\{([^;]+)\};")

    stats = {}   # building_id → {total_updated, total_level_before, total_level_after}

    def replace_region(m):
        rid   = m.group(1)
        body  = m.group(0)

        pop_m = re.search(r'population:(\d+)', body)
        pop   = int(pop_m.group(1)) if pop_m else 1000

        # Обновляем level в каждом building_slot
        def replace_slot(sm):
            slot = sm.group(0)
            bld_m = re.search(r'building_id:["\'](\w+)["\']', slot)
            if not bld_m:
                return slot
            bld_id = bld_m.group(1)
            if bld_id in ORIGINAL_BUILDINGS:
                return slot  # не трогаем оригинальные здания

            new_lvl = compute_level(pop, bld_id)
            if new_lvl is None:
                return slot  # здание не в нашем списке

            lvl_m = re.search(r'level:(\d+)', slot)
            if not lvl_m:
                return slot
            old_lvl = int(lvl_m.group(1))

            # Не понижаем уже выставленные вручную высокие уровни
            final_lvl = max(old_lvl, new_lvl)
            if final_lvl == old_lvl:
                return slot  # без изменений

            # Статистика
            if bld_id not in stats:
                stats[bld_id] = {'n': 0, 'before': 0, 'after': 0}
            stats[bld_id]['n']      += 1
            stats[bld_id]['before'] += old_lvl
            stats[bld_id]['after']  += final_lvl

            return slot.replace(f'level:{old_lvl}', f'level:{final_lvl}', 1)

        # Паттерн для одного слота: { slot_id:..., building_id:..., ..., wages_paid:0}
        new_body = re.sub(r'\{slot_id:[^}]+\}', replace_slot, body)
        return new_body

    result = region_re.sub(replace_region, text)

    # Статистика
    total_updated = sum(v['n'] for v in stats.values())
    print(f"\n=== ОБНОВЛЕНО УРОВНЕЙ: {total_updated} слотов ===")
    for bld_id in sorted(stats, key=lambda x: -stats[x]['n']):
        v = stats[bld_id]
        avg_before = v['before'] / v['n']
        avg_after  = v['after']  / v['n']
        print(f"  {bld_id:25s} слотов:{v['n']:5d}  "
              f"avg_level {avg_before:.1f} → {avg_after:.1f}")

    if dry_run:
        print("\n[DRY RUN] Файл не изменён.")
        return

    print("\nЗапись в regions_data.js...")
    open(regions_path, 'w').write(result)
    print("Готово.")


def main():
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    regions_path = os.path.join(BASE, 'data', 'regions_data.js')
    print("Загрузка данных...")
    process(regions_path, dry_run=dry_run)


if __name__ == '__main__':
    main()
