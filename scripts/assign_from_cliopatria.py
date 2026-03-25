#!/usr/bin/env python3
"""
Назначение регионов нациям на основе:
  1. Cliopatria GeoJSON (точные полигоны государств 300 BC) — первый приоритет
  2. nation_geo.js bbox-данные — fallback для регионов вне Cliopatria

Запуск: python3 scripts/assign_from_cliopatria.py
Выход: data/region_assignments.js
"""

import json, subprocess, os, sys
from pathlib import Path
from shapely.geometry import shape, Point
from collections import Counter

ROOT = Path(__file__).parent.parent
CLIOPATRIA_PATH = Path('/tmp/cliopatria_polities_only.geojson')

# ── Маппинг: Cliopatria Name → game nation ID ──────────────────────
CLIOPATRIA_TO_GAME = {
    'Seleucid Empire':        'seleukid_empire',
    'Ptolemaic Kingdom':      'ptolemaic_kingdom',
    'Maurya Empire':          'maurya_empire',
    'Carthage':               'carthage',
    'Roman Republic':         'rome',
    'Kingdom of Kush':        'meroe',
    'Macedonian Empire':      'antigonid_kingdom',  # 301 BC = Антигониды
    'Scythia':                'scythians',
    'Kingdom of Lysimachus':  'lysimachus',
    'Greek City-States':      'athens',           # приближение
    'Cyrenaica':              'cyrene',
    'Kingdom of Armenia':     'armenia',
    'Kingdom of Bithynia':    'bithynia',
    'Colchis':                'colchis',
    'Atropatene':             'atropatene',
    'Etruscans':              'etruscan_conf',
    'Cimmerian Bosporus':     'bosporan_kingdom',
    'Yuezhi':                 'yuezhi',
    'Minyue':                 'minyue',
    'Kalinga':                'kalinga',
    # Китай
    'Qin':                    'qin',
    'Chu':                    'chu',
    'Qi':                     'qi',
    'Zhao':                   'zhao',
    'Han':                    'han',
    'Wei':                    'wei',
    'Yan':                    'yan',
    'Zhongshan':              'zhongshan',
    'Wey':                    'wey',
    'Song':                   'song',
    'Lu':                     'lu',
    'Xu':                     'xu',
    'Later Zhou':             'zhou',
    # Аравия
    'Minaeans':               'minaeans',
    'Sabaeans':               'saba',
    'Qataban':                'qataban',
    'Hadhramaut':             'hadhramaut',
    # Америки / игнорируем
    'Zapotec Civilization':   None,
}

# ── Загрузка Cliopatria ────────────────────────────────────────────
if not CLIOPATRIA_PATH.exists():
    print('ERROR: Cliopatria не найден. Скачайте:')
    print('  curl -L -o /tmp/cliopatria.geojson.zip https://github.com/Seshat-Global-History-Databank/cliopatria/raw/main/cliopatria.geojson.zip')
    print('  unzip /tmp/cliopatria.geojson.zip -d /tmp/')
    sys.exit(1)

print('Загрузка Cliopatria...')
with open(CLIOPATRIA_PATH) as f:
    clio_data = json.load(f)

YEAR = -300
active = [feat for feat in clio_data['features']
          if feat['properties']['FromYear'] <= YEAR <= feat['properties']['ToYear']
          and not feat['properties']['Name'].startswith('(')]

print(f'  Полигонов на {abs(YEAR)} BC: {len(active)}')

# Строим список (game_id, shapely_geom) с приоритетом (меньше площадь → выше приоритет)
polities = []
for feat in active:
    name = feat['properties']['Name']
    game_id = CLIOPATRIA_TO_GAME.get(name)
    if not game_id:
        if name not in CLIOPATRIA_TO_GAME:
            print(f'  НЕТ МАППИНГА: {name}')
        continue
    try:
        geom = shape(feat['geometry'])
        area = feat['properties']['Area']
        polities.append({'name': name, 'id': game_id, 'geom': geom, 'area': area})
    except Exception as e:
        print(f'  Ошибка геометрии {name}: {e}')

# Сортируем: меньшие государства проверяем первыми (более специфичные выиграют)
polities.sort(key=lambda p: p['area'])
print(f'  С маппингом: {len(polities)} полигонов')

# ── Загрузка REGION_CENTROIDS ──────────────────────────────────────
print('\nЗагрузка region_centroids.js...')
result = subprocess.run(['node', '-e', '''
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync('data/region_centroids.js','utf8');
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
console.log(JSON.stringify(ctx.REGION_CENTROIDS));
'''], capture_output=True, text=True, cwd=ROOT)
ALL_CENTROIDS = json.loads(result.stdout)

# Фильтруем: только in_historical_world
centroids = {k: v for k, v in ALL_CENTROIDS.items()
             if v.get('lat') and v.get('lon') and v.get('in_historical_world')}
out_of_world = {k: v for k, v in ALL_CENTROIDS.items()
                if not v.get('in_historical_world')}
print(f'  Регионов в историческом мире: {len(centroids)}')
print(f'  Вне исторического мира: {len(out_of_world)}')

# ── Загрузка NATION_GEO (bbox fallback) ───────────────────────────
print('\nЗагрузка nation_geo.js (fallback)...')
result2 = subprocess.run(['node', '-e', '''
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync('data/nation_geo.js','utf8').replace(/^var /mg,'var ');
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
console.log(JSON.stringify(ctx.NATION_GEO));
'''], capture_output=True, text=True, cwd=ROOT)
NATION_GEO = json.loads(result2.stdout)
print(f'  Наций с геоданными: {len(NATION_GEO)}')

def in_bbox(lat, lon, bbox):
    return (bbox['latMin'] <= lat <= bbox['latMax'] and
            bbox['lonMin'] <= lon <= bbox['lonMax'])

def find_by_bbox(lat, lon):
    """Лучшая нация по bbox (меньший priority = победитель)."""
    best_id, best_prio = None, 999
    for nation_id, geo in NATION_GEO.items():
        if not geo.get('bbox'):
            continue
        hit = in_bbox(lat, lon, geo['bbox'])
        if not hit and geo.get('polygons'):
            for poly in geo['polygons']:
                if in_bbox(lat, lon, poly):
                    hit = True
                    break
        if hit:
            prio = geo.get('priority', 5)
            if prio < best_prio:
                best_prio = prio
                best_id = nation_id
    return best_id

# ── Point-in-polygon (Cliopatria) ─────────────────────────────────
print('\nPoint-in-polygon (Cliopatria)...')
clio_assignments = {}
for region_id, c in centroids.items():
    pt = Point(c['lon'], c['lat'])
    for pol in polities:        # уже отсортированы по area (меньшие первые)
        if pol['geom'].contains(pt):
            clio_assignments[region_id] = pol['id']
            break

print(f'  Покрыто Cliopatria: {len(clio_assignments)}')

# ── Fallback: nation_geo bbox ──────────────────────────────────────
print('Bbox-fallback для непокрытых регионов...')
bbox_assignments = {}
neutral_count = 0
for region_id, c in centroids.items():
    if region_id in clio_assignments:
        continue
    result = find_by_bbox(c['lat'], c['lon'])
    if result:
        bbox_assignments[region_id] = result
    else:
        neutral_count += 1

print(f'  Покрыто bbox: {len(bbox_assignments)}')
print(f'  Остались neutral: {neutral_count}')

# ── Сборка финального словаря ──────────────────────────────────────
assignments = {}
# Вне исторического мира → neutral
for region_id in out_of_world:
    assignments[region_id] = 'neutral'
# Cliopatria
assignments.update(clio_assignments)
# Bbox fallback
assignments.update(bbox_assignments)
# Оставшиеся → neutral
for region_id in centroids:
    if region_id not in assignments:
        assignments[region_id] = 'neutral'

# ── Статистика ─────────────────────────────────────────────────────
print('\n' + '═'*60)
print('ИТОГ')
print('═'*60)
assigned = {k: v for k, v in assignments.items() if v != 'neutral'}
nation_counts = Counter(assigned.values())
print(f'Назначено: {len(assigned)} регионов')
print(f'Neutral:   {sum(1 for v in assignments.values() if v == "neutral")}')
print()
print('Топ-30 наций:')
for nation, count in nation_counts.most_common(30):
    bar = '█' * min(40, count // 5)
    print(f'  {nation:<30} {count:4}  {bar}')

# ── Источники назначений ───────────────────────────────────────────
print()
clio_count = len(clio_assignments)
bbox_count = len(bbox_assignments)
print(f'Источники: Cliopatria={clio_count}, bbox={bbox_count}, neutral={neutral_count}')

# ── Сохранение ────────────────────────────────────────────────────
print('\nСохранение data/region_assignments.js...')
out_path = ROOT / 'data' / 'region_assignments.js'
content = (
    '// AUTO-GENERATED by scripts/assign_from_cliopatria.py\n'
    '// Назначение регионов нациям (Cliopatria 300 BC + nation_geo bbox fallback)\n'
    '//\n'
    '// Ключ: region_id  Значение: nation_id или "neutral"\n\n'
    f'var REGION_ASSIGNMENTS = {json.dumps(assignments, indent=2)};\n'
)
out_path.write_text(content, encoding='utf-8')
print(f'  Записано: {len(assignments)} записей ({out_path.stat().st_size // 1024} KB)')
print('\nСледующий шаг: node scripts/stage5_apply_assignment.js')
