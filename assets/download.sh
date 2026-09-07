#!/bin/bash
# Загрузка CC0/PD ассетов для Ancient Strategy (Шаг 54 arma.md)
# Запуск: bash assets/download.sh
#
# Источники (все CC0 или Public Domain, безопасно для коммерческого использования):
#   - Metropolitan Museum of Art (CC0)       — collectionapi.metmuseum.org
#   - The Cleveland Museum of Art (CC0)      — openaccess-api.clevelandart.org
#   - Wikimedia Commons (Public Domain)      — upload.wikimedia.org
#
# Скрипт идемпотентен: уже скачанные файлы пропускаются (проверка по -s).
# Сеть или доступ к host'у могут быть ограничены (403/timeouts) — это не ошибка,
# пропущенные файлы просто перечисляются в конце и перекачиваются при повторе.

set -u
WARNINGS=0
OK=0
SKIP=0

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST="assets/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST не найден — в репозитории нарушена инфраструктура Шага 54" >&2
  exit 1
fi

# Создаём всю структуру папок (на случай чистого clone).
mkdir -p assets/portraits/greek   assets/portraits/roman    assets/portraits/celtic \
         assets/portraits/persian assets/portraits/egyptian assets/portraits/indian \
         assets/portraits/east_asian assets/portraits/nomadic assets/portraits/iberian \
         assets/portraits/african
mkdir -p assets/textures assets/backgrounds assets/borders assets/icons

UA="AncientStrategyAssetFetcher/1.0 (https://github.com/cavad93/igra2; contact: asset-bot@example.org)"

fetch() {
  local url="$1"
  local dest="$2"
  if [ -s "$dest" ]; then
    SKIP=$((SKIP + 1))
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  local ok=0
  if command -v curl >/dev/null 2>&1; then
    if curl -fsSL -A "$UA" --max-time 60 -o "$dest.part" "$url" 2>/dev/null; then ok=1; fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -q -U "$UA" --timeout=60 -O "$dest.part" "$url" 2>/dev/null; then ok=1; fi
  else
    echo "ERROR: нужен curl или wget" >&2
    exit 1
  fi
  if [ "$ok" = "1" ] && [ -s "$dest.part" ]; then
    mv "$dest.part" "$dest"
    OK=$((OK + 1))
    echo "  [ok  ] $dest"
  else
    rm -f "$dest.part"
    WARNINGS=$((WARNINGS + 1))
    echo "  [warn] не удалось скачать $url → $dest"
  fi
  return 0
}

# Парсим manifest.json через node (наиболее надёжно).
# Вывод: строки «URL<TAB>FILE».
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: нужен node.js для парсинга $MANIFEST" >&2
  exit 1
fi

echo "Чтение манифеста $MANIFEST..."
TOTAL=$(node -e "console.log(require('./$MANIFEST').assets.length)")
echo "В манифесте $TOTAL записей. Старт загрузки (skipping уже скачанные)..."
echo ""

# Итерируем в shell через subshell с process substitution.
while IFS=$'\t' read -r url dest; do
  [ -z "$url" ] && continue
  [ -z "$dest" ] && continue
  fetch "$url" "$dest"
done < <(node -e "
  const m=require('./$MANIFEST');
  for (const a of m.assets) {
    if (a.source && a.filename) {
      process.stdout.write(a.source + '\t' + a.filename + '\n');
    }
  }
")

echo ""
echo "──────────────────────────────────────────────"
echo "Готово: $OK скачано, $SKIP пропущено (уже есть), $WARNINGS не удалось"
if [ "$WARNINGS" -gt 0 ]; then
  echo ""
  echo "Часть ассетов не загрузилась (403/сеть). Повторный запуск продолжит с пропущенного."
  echo "Это допустимо: Met Museum почти всегда доступен, Wikimedia иногда блокирует UA."
fi
echo "Лицензии и источники см. в $MANIFEST"
echo "──────────────────────────────────────────────"
