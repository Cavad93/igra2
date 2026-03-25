#!/usr/bin/env python3
"""
Переработка construction_materials для всех зданий.

Принципы:
  - Убираем фиксированный construction_labor (стоимость = только материалы × рыночная цена + 20% труд)
  - Добавляем реалистичные материалы: stone, charcoal, copper, pitch, etc.
  - Количества соответствуют историческим реалиям и масштабу здания

Базовые цены для справки (goods.js):
  stone=5, timber=22, charcoal=12, iron=45, copper=35,
  tin=80, tools=35, pitch=25, salt=18
"""

import re, sys

BUILDINGS_FILE = 'data/buildings.js'

# ── НОВЫЕ МАТЕРИАЛЫ ───────────────────────────────────────────────────────────
# Ключи — точные ID зданий. Значения — словарь {good_id: quantity}.
# Количество × base_price → стоимость при базовом рынке.
# Формула итога: sum(qty × market_price) × 1.20 (20% — труд)
NEW_MATERIALS = {

    # ── ИНФРАСТРУКТУРА ────────────────────────────────────────────────────────
    # port: причалы, склады, укреплённая набережная
    #   20×22 + 10×5 + 8×45 + 5×25 + 6×35 = 440+50+360+125+210 = 1185 → ×1.2 = 1422
    'port':             {'timber': 20, 'stone': 10, 'iron':  8, 'pitch':  5, 'tools':  6},

    # shipyard: стапели, мастерские, береговая инфраструктура
    #   30×22 + 8×5 + 12×45 + 8×25 + 8×35 = 660+40+540+200+280 = 1720 → ×1.2 = 2064
    'shipyard':         {'timber': 30, 'stone':  8, 'iron': 12, 'pitch':  8, 'tools':  8},

    # market: крытые прилавки, склады, весовые
    #   15×22 + 12×5 + 6×35 = 330+60+210 = 600 → ×1.2 = 720
    'market':           {'timber': 15, 'stone': 12,                           'tools':  6},

    # road: мощёная дорога — камень главный ресурс
    #   40×5 + 5×22 + 8×45 + 8×35 = 200+110+360+280 = 950 → ×1.2 = 1140
    'road':             {'stone':  40, 'timber':  5, 'iron':  8,              'tools':  8},

    # warehouse: дерево и камень, простая конструкция
    #   20×22 + 8×5 + 5×35 = 440+40+175 = 655 → ×1.2 = 786
    'warehouse':        {'timber': 20, 'stone':  8,                           'tools':  5},

    # barracks: казарма — камень + дерево + оружейные стойки
    #   15×22 + 20×5 + 8×45 + 6×35 = 330+100+360+210 = 1000 → ×1.2 = 1200
    'barracks':         {'timber': 15, 'stone': 20, 'iron':  8,              'tools':  6},

    # walls: капитальная фортификация — камень доминирует
    #   60×5 + 10×22 + 20×45 + 12×35 = 300+220+900+420 = 1840 → ×1.2 = 2208
    'walls':            {'stone':  60, 'timber': 10, 'iron': 20,              'tools': 12},

    # ── ВОЕННЫЕ ──────────────────────────────────────────────────────────────
    # (barracks/walls включены в инфраструктуру)

    # ── СЕЛЬСКОЕ ХОЗЯЙСТВО ───────────────────────────────────────────────────
    # ranch: ограды, навесы, простые постройки
    #   12×22 + 3×35 = 264+105 = 369 → ×1.2 = 443
    'ranch':            {'timber': 12,                                        'tools':  3},

    # granary: большой зернохранилище — камень для фундамента
    #   20×22 + 10×5 + 5×35 = 440+50+175 = 665 → ×1.2 = 798
    'granary':          {'timber': 20, 'stone': 10,                           'tools':  5},

    # irrigation: каналы, водоподъёмные колёса — камень + железо для механизмов
    #   15×22 + 20×5 + 8×45 + 8×35 = 330+100+360+280 = 1070 → ×1.2 = 1284
    'irrigation':       {'timber': 15, 'stone': 20, 'iron':  8,              'tools':  8},

    # temple: мрамор/камень — главный материал
    #   15×22 + 30×5 + 8×35 = 330+150+280 = 760 → ×1.2 = 912
    'temple':           {'timber': 15, 'stone': 30,                           'tools':  8},

    # aqueduct: каменный акведук — огромный объём камня и железных скреп
    #   50×5 + 20×45 + 10×22 + 15×35 = 250+900+220+525 = 1895 → ×1.2 = 2274
    'aqueduct':         {'stone':  50, 'iron':  20, 'timber': 10,             'tools': 15},

    # school: деревянные скамьи, каменные стены
    #   15×22 + 15×5 + 6×35 = 330+75+210 = 615 → ×1.2 = 738
    'school':           {'timber': 15, 'stone': 15,                           'tools':  6},

    # forum: площадь с колоннадой — много камня
    #   12×22 + 25×5 + 8×45 + 8×35 = 264+125+360+280 = 1029 → ×1.2 = 1235
    'forum':            {'timber': 12, 'stone': 25, 'iron':  8,              'tools':  8},

    # tavern: деревянное здание с очагом
    #   12×22 + 5×5 + 4×35 = 264+25+140 = 429 → ×1.2 = 515
    'tavern':           {'timber': 12, 'stone':  5,                           'tools':  4},

    # baths: термы — много камня, трубы, системы подогрева
    #   30×5 + 10×22 + 8×45 + 8×35 = 150+220+360+280 = 1010 → ×1.2 = 1212
    'baths':            {'stone':  30, 'timber': 10, 'iron':  8,              'tools':  8},

    # cattle_farm: деревянные загоны, кормушки
    #   8×22 + 3×35 = 176+105 = 281 → ×1.2 = 337
    'cattle_farm':      {'timber':  8,                                        'tools':  3},

    # horse_ranch: конюшни с укреплёнными стойлами
    #   12×22 + 4×45 + 4×35 = 264+180+140 = 584 → ×1.2 = 701
    'horse_ranch':      {'timber': 12, 'iron':  4,                           'tools':  4},

    # olive_grove: террасирование, дренаж, ограды
    #   8×22 + 3×35 = 176+105 = 281 → ×1.2 = 337
    'olive_grove':      {'timber':  8,                                        'tools':  3},

    # wheat_family_farm: простой крестьянский двор
    #   3×22 + 1×35 = 66+35 = 101 → ×1.2 = 121
    'wheat_family_farm':{'timber':  3,                                        'tools':  1},

    # farm: средняя ферма
    #   6×22 + 2×35 = 132+70 = 202 → ×1.2 = 242
    'farm':             {'timber':  6,                                        'tools':  2},

    # wheat_villa: виллa — каменный дом + амбары
    #   12×22 + 8×5 + 4×35 = 264+40+140 = 444 → ×1.2 = 533
    'wheat_villa':      {'timber': 12, 'stone':  8,                           'tools':  4},

    # wheat_latifundium: огромное поместье — комплекс построек
    #   25×22 + 20×5 + 10×45 + 12×35 = 550+100+450+420 = 1520 → ×1.2 = 1824
    'wheat_latifundium':{'timber': 25, 'stone': 20, 'iron': 10,              'tools': 12},

    # grain_estate: поместье среднего размера
    #   20×22 + 15×5 + 6×45 + 8×35 = 440+75+270+280 = 1065 → ×1.2 = 1278
    'grain_estate':     {'timber': 20, 'stone': 15, 'iron':  6,              'tools':  8},

    # hemp_field: посевы конопли — минимум инфраструктуры
    #   4×22 + 2×35 = 88+70 = 158 → ×1.2 = 190
    'hemp_field':       {'timber':  4,                                        'tools':  2},

    # papyrus_bed: дренажные канавки, инструменты жатвы
    #   6×22 + 3×35 = 132+105 = 237 → ×1.2 = 284
    'papyrus_bed':      {'timber':  6,                                        'tools':  3},

    # apiary: ульи, простые укрытия
    #   5×22 + 2×35 = 110+70 = 180 → ×1.2 = 216
    'apiary':           {'timber':  5,                                        'tools':  2},

    # ── ДОБЫЧА ───────────────────────────────────────────────────────────────
    # mine (generic): штольни, подъёмные конструкции
    #   16×22 + 6×45 + 8×35 = 352+270+280 = 902 → ×1.2 = 1082
    'mine':             {'timber': 16, 'iron':  6,                           'tools':  8},

    # iron_mine: крепи, лебёдки, дренаж
    #   20×22 + 8×45 + 10×35 = 440+360+350 = 1150 → ×1.2 = 1380
    'iron_mine':        {'timber': 20, 'iron':  8,                           'tools': 10},

    # copper_mine: меньше крепей, чем железная
    #   18×22 + 6×45 + 8×35 = 396+270+280 = 946 → ×1.2 = 1135
    'copper_mine':      {'timber': 18, 'iron':  6,                           'tools':  8},

    # silver_mine: глубокие штольни, вентиляция
    #   25×22 + 10×45 + 12×35 = 550+450+420 = 1420 → ×1.2 = 1704
    'silver_mine':      {'timber': 25, 'iron': 10,                           'tools': 12},

    # gold_mine: самые дорогие штольни
    #   28×22 + 12×45 + 14×35 = 616+540+490 = 1646 → ×1.2 = 1975
    'gold_mine':        {'timber': 28, 'iron': 12,                           'tools': 14},

    # tin_mine: оловянные копи — аналог меди
    #   20×22 + 8×45 + 10×35 = 440+360+350 = 1150 → ×1.2 = 1380
    'tin_mine':         {'timber': 20, 'iron':  8,                           'tools': 10},

    # sulfur_mine: серные рудники с защитой от газов
    #   16×22 + 6×45 + 8×35 = 352+270+280 = 902 → ×1.2 = 1082
    'sulfur_mine':      {'timber': 16, 'iron':  6,                           'tools':  8},

    # quarry: каменоломня — железные клинья, подъёмники
    #   12×22 + 8×45 + 10×35 = 264+360+350 = 974 → ×1.2 = 1169
    'quarry':           {'timber': 12, 'iron':  8,                           'tools': 10},

    # salt_works: выпарные чаны, каменные ограждения
    #   15×22 + 10×5 + 6×35 = 330+50+210 = 590 → ×1.2 = 708
    'salt_works':       {'timber': 15, 'stone': 10,                          'tools':  6},

    # charcoal_kiln: земляная яма, простое перекрытие
    #   8×22 + 2×35 = 176+70 = 246 → ×1.2 = 295
    'charcoal_kiln':    {'timber':  8,                                        'tools':  2},

    # lumber_camp: лесозаготовительный лагерь
    #   6×22 + 4×45 + 5×35 = 132+180+175 = 487 → ×1.2 = 584
    'lumber_camp':      {'timber':  6, 'iron':  4,                           'tools':  5},

    # ── ПРОИЗВОДСТВО ─────────────────────────────────────────────────────────
    # forge: кузница — горн, наковальни, меха (charcoal нужен для работы)
    #   15×22 + 15×45 + 10×5 + 10×12 + 6×35 = 330+675+50+120+210 = 1385 → ×1.2 = 1662
    'forge':            {'timber': 15, 'iron':  15, 'stone': 10, 'charcoal': 10, 'tools':  6},

    # bronze_foundry: плавильня бронзы — медь и олово в строительстве
    #   12×22 + 8×5 + 5×35 + 8×12 + 6×35 = 264+40+175+96+210 = 785 → ×1.2 = 942
    'bronze_foundry':   {'timber': 12, 'stone':  8, 'copper': 5, 'charcoal':  8, 'tools':  6},

    # oil_press: пресс — дерево, камень, железные крепи
    #   10×22 + 5×5 + 4×45 + 5×35 = 220+25+180+175 = 600 → ×1.2 = 720
    'oil_press':        {'timber': 10, 'stone':  5, 'iron':  4,              'tools':  5},

    # winery: давильня — деревянные чаны, каменные подвалы
    #   12×22 + 8×5 + 5×35 = 264+40+175 = 479 → ×1.2 = 575
    'winery':           {'timber': 12, 'stone':  8,                           'tools':  5},

    # tannery: кожевенная — вонючее производство, ямы, чаны
    #   12×22 + 4×45 + 5×35 = 264+180+175 = 619 → ×1.2 = 743
    'tannery':          {'timber': 12, 'iron':  4,                           'tools':  5},

    # textile_mill: ткацкие станки из дерева
    #   10×22 + 5×35 = 220+175 = 395 → ×1.2 = 474
    'textile_mill':     {'timber': 10,                                        'tools':  5},

    # fishery: пирсы, сети, вяленые площадки
    #   12×22 + 3×25 + 4×35 = 264+75+140 = 479 → ×1.2 = 575
    'fishery':          {'timber': 12, 'pitch':  3,                           'tools':  4},

    # tuna_trap: ловушки для тунца — большие сети и колья
    #   15×22 + 4×25 + 4×45 + 5×35 = 330+100+180+175 = 785 → ×1.2 = 942
    'tuna_trap':        {'timber': 15, 'pitch':  4, 'iron':  4,              'tools':  5},

    # garum_workshop: ферментационные чаны, каменный пол
    #   10×22 + 6×5 + 5×35 = 220+30+175 = 425 → ×1.2 = 510
    'garum_workshop':   {'timber': 10, 'stone':  6,                           'tools':  5},

    # pottery_workshop: гончарный круг, обжиговая печь, глиняный пол
    #   8×22 + 4×5 + 4×35 = 176+20+140 = 336 → ×1.2 = 403
    'pottery_workshop': {'timber':  8, 'stone':  4,                           'tools':  4},

    # butchery: разделочные столы, каменный пол, сток
    #   8×22 + 4×5 + 3×45 + 4×35 = 176+20+135+140 = 471 → ×1.2 = 565
    'butchery':         {'timber':  8, 'stone':  4, 'iron':  3,              'tools':  4},

    # dye_works: красильные чаны, каменные стены против огня
    #   10×22 + 6×5 + 4×45 + 5×35 = 220+30+180+175 = 605 → ×1.2 = 726
    'dye_works':        {'timber': 10, 'stone':  6, 'iron':  4,              'tools':  5},

    # workshop (общие мастерские): верстаки, кузнечный уголок
    #   12×22 + 6×45 + 6×35 = 264+270+210 = 744 → ×1.2 = 893
    'workshop':         {'timber': 12, 'iron':  6,                           'tools':  6},

    # ── ТОРГОВЛЯ ─────────────────────────────────────────────────────────────
    # trading_post: торговый пост — склад, прилавки, охрана
    #   12×22 + 5×5 + 5×35 = 264+25+175 = 464 → ×1.2 = 557
    'trading_post':     {'timber': 12, 'stone':  5,                           'tools':  5},

    # slave_market: загон, помост, цепи
    #   10×22 + 8×5 + 3×45 + 5×35 = 220+40+135+175 = 570 → ×1.2 = 684
    'slave_market':     {'timber': 10, 'stone':  8, 'iron':  3,              'tools':  5},

    # ── СПЕЦИАЛЬНЫЕ ──────────────────────────────────────────────────────────
    # elephant_corral: огромные крепкие загоны
    #   18×22 + 8×5 + 8×45 + 8×35 = 396+40+360+280 = 1076 → ×1.2 = 1291
    'elephant_corral':  {'timber': 18, 'stone':  8, 'iron':  8,              'tools':  8},

    # fur_trapping: охотничий лагерь с ловушками
    #   4×22 + 2×35 = 88+70 = 158 → ×1.2 = 190
    'fur_trapping':     {'timber':  4,                                        'tools':  2},

    # amber_gathering: прибрежный лагерь, лодки
    #   6×22 + 3×25 + 2×35 = 132+75+70 = 277 → ×1.2 = 332
    'amber_gathering':  {'timber':  6, 'pitch':  3,                           'tools':  2},

    # incense_grove: ирригация, ограды для священных рощ
    #   5×22 + 3×5 + 2×35 = 110+15+70 = 195 → ×1.2 = 234
    'incense_grove':    {'timber':  5, 'stone':  3,                           'tools':  2},

    # pitch_works: смолокурня — ямы, котлы
    #   10×22 + 3×35 = 220+105 = 325 → ×1.2 = 390
    'pitch_works':      {'timber': 10,                                        'tools':  3},
}


def mats_to_js(mats: dict) -> str:
    """Форматирует словарь материалов в JS-объект."""
    items = ', '.join(f'{k}: {v}' for k, v in mats.items())
    return f'{{ {items} }}'


def main():
    with open(BUILDINGS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Находим все здания и их позиции
    pattern = re.compile(r'\n  (\w+): \{')
    matches = list(pattern.finditer(content))

    changes = 0
    not_found = []

    for bid, new_mats in NEW_MATERIALS.items():
        # Найти начало блока здания
        m = next((x for x in matches if x.group(1) == bid), None)
        if not m:
            not_found.append(bid)
            continue

        idx = matches.index(m)
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(content)
        block = content[start:end]

        # 1) Заменить construction_materials
        new_mats_str = mats_to_js(new_mats)
        block, n = re.subn(
            r'construction_materials:\s*\{[^}]*\}',
            f'construction_materials: {new_mats_str}',
            block
        )
        if n == 0:
            print(f'  WARN: construction_materials не найден в {bid}')
        else:
            changes += 1

        # 2) Убрать construction_labor (теперь не нужен — труд = 20% наценка в calcConstructionCost)
        block = re.sub(r'\n    construction_labor:\s*\d+,?\n', '\n', block)

        content = content[:start] + block + content[end:]
        # Перестроить индексы после изменения
        matches = list(pattern.finditer(content))

    print(f'\nОбновлено construction_materials: {changes}/{len(NEW_MATERIALS)} зданий')
    if not_found:
        print(f'Не найдены в файле: {not_found}')

    # Проверим что ни одного construction_labor не осталось
    remaining = re.findall(r'construction_labor:\s*\d+', content)
    print(f'Оставшихся construction_labor: {len(remaining)}')

    with open(BUILDINGS_FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Записано в data/buildings.js')

    # Распечатаем новые базовые стоимости
    BASE_PRICES = {
        'wheat': 10, 'barley': 7, 'fish': 15, 'tuna': 22, 'stone': 5,
        'charcoal': 12, 'iron': 45, 'copper': 35, 'tin': 80,
        'timber': 22, 'tools': 35, 'pitch': 25, 'salt': 18,
        'hemp': 18, 'wool': 20, 'meat': 25, 'wax': 25,
    }
    print('\n--- Новые базовые стоимости (×1.2 наценка труда) ---')
    for bid, mats in sorted(NEW_MATERIALS.items()):
        raw = sum(BASE_PRICES.get(g, 20) * q for g, q in mats.items())
        total = round(raw * 1.2)
        mat_str = ', '.join(f'{g}×{q}' for g, q in mats.items())
        print(f'  {bid:<25} base={total:>5}  [{mat_str}]')


if __name__ == '__main__':
    main()
