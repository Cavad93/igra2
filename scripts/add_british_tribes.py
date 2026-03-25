#!/usr/bin/env python3
"""
Добавляет кельтские племена Британии, Ирландии и Шотландии в nations.js
и назначает регионы каждому племени.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).parent.parent

# ── Маппинг: регион → племя ──────────────────────────────────────────
REGION_TO_TRIBE = {
    # ШОТЛАНДИЯ
    'r553': 'cait',        # Шетланды
    'r554': 'cait',        # Оркнеи
    'r552': 'caledonii',   # СЗ Хайленд
    'r551': 'caledonii',   # Гебриды/Скай
    'r549': 'caledonii',   # СЗ Хайленд
    'r550': 'caledonii',   # Аргайл
    'r548': 'taexali',     # Абердиншир (СВ Шотландия)
    'r547': 'venicones',   # Перт/Файф
    'r543': 'votadini',    # ЮВ Шотландия/Лотиан
    'r546': 'selgovae',    # Эйршир/Клайд
    'r544': 'selgovae',    # Дамфрис/Ю.Апленды
    'r545': 'novantae',    # Галлоуэй

    # СЕВЕРНАЯ АНГЛИЯ
    'r542': 'brigantes',   # Нортумберленд
    'r40':  'brigantes',   # С. Йоркшир
    'r541': 'parisi_brit', # В. Йоркшир (Паризии)
    'r555': 'neutral',     # Остров Мэн

    # СРЕДНЯЯ АНГЛИЯ
    'r200': 'corieltauvi', # Линкольншир/В.Мидленд
    'r532': 'iceni',       # В. Англия (Норфолк/Суффолк)
    'r97':  'catuvellauni',# Эссекс/Хертс
    'r535': 'dobunni',     # Глостершир/Оксфорд
    'r531': 'cantiaci',    # Кент

    # УЭЛЬС И ГРАНИЦА
    'r538': 'ordovices',   # С. Уэльс (граница)
    'r540': 'cornovii',    # Чешир/Шропшир
    'r539': 'ordovices',   # С.-Ц. Уэльс
    'r537': 'demetae',     # ЮЗ Уэльс (Пемброкшир)
    'r536': 'silures',     # Ю. Уэльс (Гламорган)

    # ЮЖНАЯ АНГЛИЯ
    'r534': 'durotriges',  # Дорсет/Гэмпшир
    'r533': 'damnonia',    # Девон/Корнуолл (уже есть!)

    # ИРЛАНДИЯ
    'r556': 'ulaid',       # С. Ирландия (Ольстер)
    'r557': 'connachta',   # З. Ирландия (Коннахт)
    'r22':  'laigin',      # В. Ирландия (Лейнстер/Дублин)
    'r558': 'mumu',        # Ю. Ирландия (Мунстер)
}

# ── Данные племён ────────────────────────────────────────────────────
TRIBES = {
    # ШОТЛАНДИЯ
    'caledonii': {
        'name': 'Каледонии', 'adjective': 'каледонский',
        'color': '#2F6B5E', 'flag_emoji': '🌲',
        'historical_note': (
            'Каледонии — крупная конфедерация хайлендских племён, '
            'населявших горную Шотландию в 300 г. до н.э. '
            'Название закрепилось из греческих источников; '
            'сами племена говорили на бриттских диалектах. '
            'Контролировали перевалы и морские пути между островами.'
        ),
        'capital': 'Горная крепость близ Инвернесса',
    },
    'taexali': {
        'name': 'Таэксалы', 'adjective': 'таэксальский',
        'color': '#5A7A6A', 'flag_emoji': '🌾',
        'historical_note': (
            'Таэксалы — племя СВ Шотландии (совр. Абердиншир), '
            'упомянутое Птолемеем. Контролировали плодородные '
            'долины Дона и Ди. Их территория богата следами '
            'бронзового и железного века.'
        ),
        'capital': 'Поселение близ совр. Абердина',
    },
    'venicones': {
        'name': 'Веникониты', 'adjective': 'веникониевский',
        'color': '#4A6E7A', 'flag_emoji': '⚓',
        'historical_note': (
            'Веникониты контролировали долину Тея и Файф — '
            'богатые сельскохозяйственные земли Ц. Шотландии. '
            'Позднее стали ядром пиктского королевства Фортриу.'
        ),
        'capital': 'Укреплённое поселение близ совр. Перта',
    },
    'votadini': {
        'name': 'Вотадини', 'adjective': 'вотадинский',
        'color': '#6A5A8A', 'flag_emoji': '🏔️',
        'historical_note': (
            'Вотадини — племя ЮВ Шотландии и Нортумберленда, '
            'населявшее Лотиан. Их укреплённое поселение '
            'Трапрейн-Лоу было крупнейшим в Британии. '
            'Позднее стали известны как Гododdin.'
        ),
        'capital': 'Трапрейн-Лоу (Лотиан)',
    },
    'selgovae': {
        'name': 'Селговы', 'adjective': 'селговский',
        'color': '#7A6A5A', 'flag_emoji': '🌿',
        'historical_note': (
            'Селговы — племя Южных нагорий Шотландии, '
            'упомянутое Птолемеем. Пастушеское и земледельческое '
            'население Клайдсдейла и холмов Аппер-Клайд.'
        ),
        'capital': 'Холмовые крепости Клайдсдейла',
    },
    'novantae': {
        'name': 'Нованты', 'adjective': 'новантский',
        'color': '#5A6A7A', 'flag_emoji': '🌊',
        'historical_note': (
            'Нованты — племя полуострова Галлоуэй, '
            'изолированные на юго-западной оконечности Шотландии. '
            'Морские скотоводы, очень мало документированные '
            'античными источниками.'
        ),
        'capital': 'Побережье Галлоуэя',
    },
    'cait': {
        'name': 'Кат', 'adjective': 'каитский',
        'color': '#4A5A6A', 'flag_emoji': '🗿',
        'historical_note': (
            'Кат — крайне северное племя, давшее название '
            'Кейтнессу (Caithness). Обитатели Оркнейских и '
            'Шетландских островов, мореходы и скотоводы. '
            'Одно из семи пиктских королевств по поздним источникам.'
        ),
        'capital': 'Острова Оркни',
    },

    # АНГЛИЯ
    'brigantes': {
        'name': 'Бриганты', 'adjective': 'бригантский',
        'color': '#8B3A3A', 'flag_emoji': '⚔️',
        'historical_note': (
            'Бриганты — крупнейшее по территории племя Британии, '
            'контролировавшее весь Север Англии. Конфедерация '
            'племён с богатой пастушеской экономикой. Имя означает '
            '«Высокие» — в честь богини Бриганти.'
        ),
        'capital': 'Изуриум (совр. Олдборо, Йоркшир)',
    },
    'parisi_brit': {
        'name': 'Паризии', 'adjective': 'паризийский',
        'color': '#9A4A6A', 'flag_emoji': '🐴',
        'historical_note': (
            'Паризии — небольшое племя В. Йоркшира (Восточный Райдинг), '
            'связанное с одноимённым галльским племенем на Сене. '
            'Известны погребениями с боевыми колесницами — '
            'уникальной для Британии традицией.'
        ),
        'capital': 'Побережье Йоркшира',
    },
    'corieltauvi': {
        'name': 'Кориэлтаувы', 'adjective': 'кориэлтаувский',
        'color': '#B8860B', 'flag_emoji': '🌾',
        'historical_note': (
            'Кориэлтаувы — федерация самоуправляемых кланов '
            'Восточных Мидлендов. Одни из первых в Британии '
            'начали чеканить монеты около 100 г. до н.э. '
            'Контролировали плодородные долины Трент и Уз.'
        ),
        'capital': 'Ратэ Кориэлтаувовум (совр. Лестер)',
    },
    'iceni': {
        'name': 'Икены', 'adjective': 'икенский',
        'color': '#DC6B2F', 'flag_emoji': '🐎',
        'historical_note': (
            'Икены — племя Восточной Англии (Норфолк, Суффолк), '
            'известные разведением лошадей и чеканкой монет. '
            'Торговали с континентом через устье Темзы. '
            'Позднее прославились восстанием царицы Боудикки.'
        ),
        'capital': 'Кайстор-бай-Норвич',
    },
    'catuvellauni': {
        'name': 'Катувеллауны', 'adjective': 'катувелланский',
        'color': '#C87941', 'flag_emoji': '🗡️',
        'historical_note': (
            'Катувеллауны — мощное племя Ю.-В. Мидлендов, '
            'постепенно расширявшее влияние на соседей. '
            'К 100 г. до н.э. — доминирующая сила юго-востока '
            'Британии с развитой торговлей и чеканкой монет.'
        ),
        'capital': 'Верламион (совр. Сент-Олбанс)',
    },
    'dobunni': {
        'name': 'Добунны', 'adjective': 'добуннский',
        'color': '#8B7355', 'flag_emoji': '🌳',
        'historical_note': (
            'Добунны — крупное племя Ю.-З. Мидлендов, '
            'занимавшее долину Северна и Котсуолдские холмы. '
            'Земледельцы и скотоводы с развитой экономикой. '
            'Чеканили монеты с изображением колосьев и лошадей.'
        ),
        'capital': 'Коринос (совр. Сайренсестер)',
    },
    'cantiaci': {
        'name': 'Кантии', 'adjective': 'кантийский',
        'color': '#4169AA', 'flag_emoji': '⚓',
        'historical_note': (
            'Кантии — племя Кента, первое из британских, '
            'с кем столкнулся Цезарь в 55 г. до н.э. '
            'Контролировали важнейшие торговые пути через '
            'Ла-Манш, поддерживая связи с галлами Белгики.'
        ),
        'capital': 'Дуроверн (совр. Кентербери)',
    },
    'durotriges': {
        'name': 'Дуротриги', 'adjective': 'дуротригский',
        'color': '#7A8090', 'flag_emoji': '🏰',
        'historical_note': (
            'Дуротриги — племя Дорсета и Уилтшира, '
            'известное плотной сетью хилфортов (Мейден-Касл). '
            'Чеканили отличительные монеты с абстрактной '
            'геометрией. Скорее конфедерация кланов, чем '
            'единое королевство.'
        ),
        'capital': 'Мейден-Касл (Дорсет)',
    },
    'cornovii': {
        'name': 'Корновии', 'adjective': 'корновийский',
        'color': '#8B5A4A', 'flag_emoji': '⛰️',
        'historical_note': (
            'Корновии — племя Шропшира и Чешира, '
            'занимавшее пограничные земли между Англией '
            'и Уэльсом. Их хилфорт на Врекине — '
            'крупнейший в регионе. Скотоводы и земледельцы.'
        ),
        'capital': 'Врокониум (совр. Роксетер, Шропшир)',
    },

    # УЭЛЬС
    'ordovices': {
        'name': 'Ордовики', 'adjective': 'ордовикский',
        'color': '#4B5BA0', 'flag_emoji': '🏔️',
        'historical_note': (
            'Ордовики — воинственное горное племя Северного '
            'и Центрального Уэльса. Яростно сопротивлялись '
            'римскому завоеванию. Контролировали горные перевалы '
            'и рудники. Их земли — сердце кельтского Уэльса.'
        ),
        'capital': 'Горные крепости Сноудонии',
    },
    'silures': {
        'name': 'Силуры', 'adjective': 'силурийский',
        'color': '#2A3575', 'flag_emoji': '⚔️',
        'historical_note': (
            'Силуры — племя Южного Уэльса, самые '
            'непримиримые противники Рима в Британии. '
            'Вели многолетнюю партизанскую войну. '
            'Тёмные волосы и смуглая кожа дали '
            'Тациту повод сравнивать их с иберийцами.'
        ),
        'capital': 'Горные крепости Гламоргана',
    },
    'demetae': {
        'name': 'Деметы', 'adjective': 'деметский',
        'color': '#3A6A8A', 'flag_emoji': '🌊',
        'historical_note': (
            'Деметы — племя ЮЗ Уэльса (Пемброкшир, Кармартен). '
            'В отличие от соседей, менее воинственны, '
            'быстро приняли римское управление. '
            'Морские торговцы, поддерживавшие связи с Ирландией.'
        ),
        'capital': 'Побережье Пемброкшира',
    },

    # ИРЛАНДИЯ
    'ulaid': {
        'name': 'Улайды', 'adjective': 'улайдский',
        'color': '#8B2252', 'flag_emoji': '🏰',
        'historical_note': (
            'Улайды — доминирующее племя Северной Ирландии '
            'в железном веке. Их столица Эмайн Маха (форт Наван) '
            'была великим церемониальным центром. '
            'Эпос «Похищение быка из Куалнге» описывает '
            'их конфликты с Коннахтом.'
        ),
        'capital': 'Эмайн Маха (совр. Арма)',
    },
    'connachta': {
        'name': 'Коннахта', 'adjective': 'коннахтский',
        'color': '#6B4488', 'flag_emoji': '🌊',
        'historical_note': (
            'Коннахта — мощная конфедерация западной Ирландии. '
            'Их столица Круахан (Ратхкроган) — один из '
            'королевских сайтов Ирландии. Великие соперники '
            'Улайдов в ирландской мифологии.'
        ),
        'capital': 'Круахан (совр. Розкоммон)',
    },
    'laigin': {
        'name': 'Лейнстерцы', 'adjective': 'лейнстерский',
        'color': '#2A5A3A', 'flag_emoji': '🌿',
        'historical_note': (
            'Лайгин — конфедерация племён восточной Ирландии, '
            'давшая название провинции Лейнстер. '
            'Контролировали побережье и речные долины, '
            'торговали с Британией через Ирландское море.'
        ),
        'capital': 'Дун Айлинне (Килдэр)',
    },
    'mumu': {
        'name': 'Мунстерцы', 'adjective': 'мунстерский',
        'color': '#8B4A1A', 'flag_emoji': '☀️',
        'historical_note': (
            'Муму (Мунстер) — богатейшая провинция Ирландии. '
            'Контролировали месторождения меди Керри и торговые '
            'пути с атлантическим побережьем. '
            'Столица Кашел — один из великих королевских сайтов.'
        ),
        'capital': 'Кашел (совр. Типперэри)',
    },
}

def make_nation_json(tribe_id, data, regions):
    return {
        'name': data['name'],
        'adjective': data.get('adjective', data['name']),
        'color': data['color'],
        'flag_emoji': data.get('flag_emoji', '🏔️'),
        'is_player': False,
        'is_minor': True,
        'ai_personality': 'defensive',
        'ai_priority': 'survival',
        'government': {
            'type': 'tribal',
            'stability': 50,
            'corruption': 15,
            'legitimacy': 55,
            'ruler': {
                'type': 'tribal_chief',
                'name': f'Вождь {data["name"]}',
                'character_ids': [],
                'personal_power': 45
            }
        },
        'regions': regions,
        'population': {'total': len(regions) * 40000},
        'economy': {
            'gold': 50,
            'income_per_turn': 8 * len(regions),
            'trade_routes': [],
            'stockpile': {'grain': 500, 'iron': 100},
            'treasury': 300,
            'tax_rate': 0.08
        },
        'military': {
            'infantry': len(regions) * 2000,
            'cavalry': len(regions) * 300,
            'ships': 0,
            'at_war_with': []
        },
        'relations': {},
        'active_laws': [],
        'characters': [],
        'historical_note': data['historical_note'],
    }

# ── 1. Строим обратный индекс tribe → регионы ────────────────────────
tribe_regions = {}
for region_id, tribe_id in REGION_TO_TRIBE.items():
    if tribe_id == 'neutral':
        continue
    tribe_regions.setdefault(tribe_id, []).append(region_id)

# Сортируем регионы
for t in tribe_regions:
    tribe_regions[t].sort(key=lambda r: int(r[1:]))

print('Регионы по племенам:')
for t, regs in sorted(tribe_regions.items()):
    print(f'  {t:<20} {len(regs)} рег.: {", ".join(regs)}')

# ── 2. Обновляем region_assignments.js ──────────────────────────────
print('\nОбновление region_assignments.js...')
ra_path = ROOT / 'data' / 'region_assignments.js'
ra_text = ra_path.read_text(encoding='utf-8')

changes = 0
for region_id, tribe_id in REGION_TO_TRIBE.items():
    new_ra = re.sub(
        r'("' + region_id + r'"\s*:\s*)"[^"]*"',
        r'\1"' + tribe_id + '"',
        ra_text
    )
    if new_ra != ra_text:
        changes += 1
    ra_text = new_ra

ra_path.write_text(ra_text, encoding='utf-8')
print(f'  Изменено {changes} назначений')

# ── 3. Добавляем новые нации в nations.js ──────────────────────────
print('\nОбновление nations.js...')
ns_path = ROOT / 'data' / 'nations.js'
ns_text = ns_path.read_text(encoding='utf-8')

# Находим строку britannia для вставки ПОСЛЕ неё
brit_match = re.search(r'^\s+"britannia"\s*:\s*\{.*?\},\s*$', ns_text, re.MULTILINE)
if not brit_match:
    # Ищем конец объекта britannia
    brit_start = ns_text.find('"britannia"')
    # Найдём конец этой записи
    depth = 0
    i = brit_start
    while i < len(ns_text):
        if ns_text[i] == '{': depth += 1
        elif ns_text[i] == '}':
            depth -= 1
            if depth == 0:
                insert_pos = i + 1
                # Пропускаем запятую и пробелы/перенос
                while insert_pos < len(ns_text) and ns_text[insert_pos] in ',\n\r ':
                    if ns_text[insert_pos] == '\n':
                        insert_pos += 1
                        break
                    insert_pos += 1
                break
        i += 1
else:
    insert_pos = brit_match.end()

# Формируем JSON для вставки
new_entries = []
for tribe_id, data in TRIBES.items():
    regs = tribe_regions.get(tribe_id, [])
    nation_obj = make_nation_json(tribe_id, data, regs)
    nation_json = json.dumps(nation_obj, ensure_ascii=False, separators=(',', ':'))
    new_entries.append(f'    "{tribe_id}": {nation_json}')

insert_text = ',\n'.join(new_entries) + ','
ns_text = ns_text[:insert_pos] + '\n' + insert_text + '\n' + ns_text[insert_pos:]

# Обновляем britannia: убираем переданные регионы
brit_remaining = [r for r in ['r40','r97','r200','r531','r532','r533','r534',
                                'r535','r536','r537','r538','r539','r540',
                                'r541','r542','r543','r544','r545','r555']
                  if REGION_TO_TRIBE.get(r, 'britannia') == 'britannia']

lines = ns_text.split('\n')
for i, line in enumerate(lines):
    if re.match(r'^\s+"britannia"\s*:\s*\{', line):
        lines[i] = re.sub(
            r'("regions"\s*:\s*)\[[^\]]*\]',
            lambda m: m.group(1) + json.dumps(brit_remaining),
            line, count=1
        )
        print(f'  britannia обновлена → {len(brit_remaining)} регионов')
        break

ns_text = '\n'.join(lines)
ns_path.write_text(ns_text, encoding='utf-8')
print(f'  Добавлено {len(TRIBES)} новых племён')

print('\nГотово. Запустите: node scripts/stage5_apply_assignment.js')
