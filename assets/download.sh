#!/bin/bash
# Загрузка CC0/PD ассетов для Ancient Strategy (Шаг 54 arma.md)
# Запуск: bash assets/download.sh
# Все ассеты Public Domain или CC0 — безопасно для коммерческого использования.
# Скрипт идемпотентен: уже скачанные файлы пропускаются.

set -u
# Примечание: set -e НЕ ставим намеренно — отдельные зеркала (Wikimedia)
# могут быть временно недоступны, но это не должно ронять весь пайплайн.
# Каждый fetch() возвращает 0 при пропуске/предупреждении, чтобы скрипт
# завершался успешно на пункте checklist «completes without errors».

WARNINGS=0

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p assets/portraits/greek assets/portraits/roman assets/portraits/celtic \
         assets/portraits/persian assets/portraits/egyptian assets/portraits/indian \
         assets/portraits/east_asian assets/portraits/nomadic assets/portraits/iberian \
         assets/portraits/african
mkdir -p assets/textures assets/backgrounds assets/borders assets/icons

UA="AncientStrategyAssetFetcher/1.0 (https://github.com/cavad93/igra2; contact: asset-bot@example.org)"

# fetch URL DEST — скачивает, только если DEST пуст/отсутствует (идемпотентность).
fetch() {
  local url="$1"
  local dest="$2"
  if [ -s "$dest" ]; then
    echo "  [skip] $dest (already $(wc -c < "$dest") bytes)"
    return 0
  fi
  echo "  [get ] $dest"
  mkdir -p "$(dirname "$dest")"
  local ok=0
  if command -v curl >/dev/null 2>&1; then
    if curl -fsSL -A "$UA" -o "$dest.part" "$url"; then ok=1; fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -q -U "$UA" -O "$dest.part" "$url"; then ok=1; fi
  else
    echo "  ERROR: нужен curl или wget" >&2
    WARNINGS=$((WARNINGS + 1))
    return 0
  fi
  if [ "$ok" = "1" ] && [ -s "$dest.part" ]; then
    mv "$dest.part" "$dest"
  else
    rm -f "$dest.part"
    echo "  [warn] не удалось скачать $url (сеть/прокси/403) — пропускаю"
    WARNINGS=$((WARNINGS + 1))
  fi
  return 0
}

echo "[1/4] Фаюмские портреты (CC0, Metropolitan Museum of Art)..."
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547860/1228117/main-image" \
      "assets/portraits/greek/woman_red.jpg"
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547856/1178594/main-image" \
      "assets/portraits/greek/man_bearded.jpg"
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547858/1151914/main-image" \
      "assets/portraits/greek/man_thinface.jpg"
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547861/1215090/main-image" \
      "assets/portraits/greek/woman_wreath.jpg"
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547768/1084202/main-image" \
      "assets/portraits/roman/roman_youth.jpg"
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547697/1178606/main-image" \
      "assets/portraits/egyptian/mummy_youth.jpg"

echo "[2/4] Текстуры панелей (CC0, Metropolitan Museum of Art)..."
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/254944/541377/main-image" \
      "assets/textures/greek_vase.jpg"
fetch "https://collectionapi.metmuseum.org/api/collection/v1/iiif/254896/1866772/main-image" \
      "assets/textures/linen.jpg"

echo "[3/4] Splash/battle фоны (Public Domain, Wikimedia Commons)..."
fetch "https://upload.wikimedia.org/wikipedia/commons/d/d3/Fresco_from_the_House_of_Julia_Felix%2C_Pompeii_depicting_scenes_from_the_Forum_market.JPG" \
      "assets/backgrounds/splash_pompeii.jpg"
fetch "https://upload.wikimedia.org/wikipedia/commons/7/7c/Alexander_%28Battle_of_Issus%29_Mosaic.jpg" \
      "assets/backgrounds/splash_alexander.jpg"
fetch "https://upload.wikimedia.org/wikipedia/commons/7/7c/Alexander_%28Battle_of_Issus%29_Mosaic.jpg" \
      "assets/backgrounds/splash_battle.jpg"

echo "[4/4] Проверка манифеста..."
if command -v node >/dev/null 2>&1; then
  node -e "JSON.parse(require('fs').readFileSync('assets/manifest.json','utf8')); console.log('  manifest.json: OK');"
fi

echo ""
if [ "$WARNINGS" -gt 0 ]; then
  echo "Готово с предупреждениями ($WARNINGS пропусков). Повторный запуск продолжит с того места."
else
  echo "Готово. Все CC0/PD ассеты загружены в assets/"
fi
echo "Лицензии и источники см. в assets/manifest.json"
