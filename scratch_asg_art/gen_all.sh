#!/bin/bash
# gen_all.sh — полная пересборка всех спайк-ассетов Ancient Strategy одним запуском.
# Запускать на сервере из /opt/asg-art/scripts: bash gen_all.sh
set -e
cd "$(dirname "$0")"
OUT=/opt/asg-art/out
mkdir -p "$OUT"

echo "== Фигурки =="
blender -b -P gen_figure.py -- --type hoplite --out "$OUT"
blender -b -P gen_figure.py -- --type legionary --out "$OUT"
blender -b -P gen_figure.py -- --type punic_infantry --out "$OUT"
blender -b -P gen_figure.py -- --type numidian_cavalry --out "$OUT"

echo "== Корабли =="
blender -b -P gen_ship.py -- --type trireme --sail raised --out "$OUT"
blender -b -P gen_ship.py -- --type merchant --sail raised --out "$OUT"

echo "== Постройки =="
blender -b -P gen_building.py -- --type temple --columns 4 --out "$OUT"
blender -b -P gen_building.py -- --type wall --level 2 --out "$OUT"
blender -b -P gen_building.py -- --type lighthouse --out "$OUT"

echo "== Контактный лист =="
bash make_contact_sheet.sh

echo "== Проверка импорта в Godot =="
mkdir -p /opt/asg-art/godot_probe
cp "$OUT"/*.glb /opt/asg-art/godot_probe/
godot --headless --path /opt/asg-art/godot_probe --import

echo "ГОТОВО. Результаты в $OUT, контактный лист: $OUT/contact_sheet.png"
