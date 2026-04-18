#!/bin/bash
# assets/battle/download_battle_assets.sh
# Идемпотентный фетч CC0/CC-BY/PD-ассетов для тактической битвы (Track B).
# Запуск: bash assets/battle/download_battle_assets.sh
#
# Источники (все свободные):
#   - game-icons.net (CC-BY 3.0) — иконки юнитов и объектов
#   - Wikimedia Commons (PD) — исторические карты для terrain/
#   - OpenGameArt.org (CC0/CC-BY) — seamless-тайлы биомов
#
# Атрибуция (CC-BY) — см. assets/battle/README.md
#
# Скрипт идемпотентен: уже скачанные файлы пропускаются.
# Сетевые ошибки (403/404/timeout) перечисляются в конце, НЕ ломают прогон —
# запусти повторно, когда сеть восстановится / хост станет доступен.

set -u
OK=0
SKIP=0
FAIL=0
FAIL_LIST=()

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p assets/battle/units assets/battle/objects assets/battle/terrain docs/battle_ui/refs

# ── 1. Иконки юнитов и объектов (CC-BY 3.0, game-icons.net) ─────────
# Формат: "dir|author/slug|local_name"
ICONS=(
  "units|lorc/spartan|hoplite"
  "units|lorc/spear-hook|phalangite"
  "units|delapouite/archer|archer"
  "units|lorc/high-shot|slinger"
  "units|delapouite/cavalry|heavy_cavalry"
  "units|delapouite/horseshoe|light_cavalry"
  "units|lorc/battle-gear|light_infantry"
  "units|lorc/crossed-swords|melee_generic"
  "units|lorc/crossed-sabres|cavalry_melee"
  "units|delapouite/horse-head|mounted"
  "units|delapouite/elephant|war_elephant"
  "units|delapouite/trebuchet|artillery_siege"
  "units|delapouite/trireme|naval_trireme"
  "units|delapouite/galley|naval_galley"
  "units|lorc/rally-the-troops|general_standard"
  "objects|lorc/celebration-fire|camp_tent"
  "objects|delapouite/castle|fortification"
  "objects|delapouite/tower-flag|watchtower"
  "objects|delapouite/palisade|palisade_wood"
  "objects|delapouite/stone-bridge|bridge_stone"
  "objects|delapouite/laurels-trophy|victory_marker"
  "objects|delapouite/trojan-horse|siege_horse"
)

echo "── Иконки (game-icons.net, CC-BY 3.0) ──"
for entry in "${ICONS[@]}"; do
  IFS='|' read -r dir src dst <<< "$entry"
  out="assets/battle/${dir}/${dst}.svg"
  if [ -s "$out" ]; then
    SKIP=$((SKIP+1))
    continue
  fi
  url="https://game-icons.net/icons/ffffff/transparent/1x1/${src}.svg"
  if curl -sSfL --max-time 20 "$url" -o "$out"; then
    echo "  OK   ${dir}/${dst}.svg"
    OK=$((OK+1))
  else
    rm -f "$out"
    echo "  FAIL ${dir}/${dst}.svg ← $url"
    FAIL_LIST+=("icon:${dir}/${dst}")
    FAIL=$((FAIL+1))
  fi
done

# ── 2. Исторические карты-референсы (Wikimedia Commons, PD) ────────
# Если Wikimedia заблокирован для хоста (как в некоторых sandbox'ах) —
# просто пропустим. Пользователь может открыть страницы вручную.
REFS=(
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Battle_of_Cannae%2C_215_BC_-_Initial_Roman_attack.gif/1024px-Battle_of_Cannae%2C_215_BC_-_Initial_Roman_attack.gif|cannae_initial.gif"
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Battle_gaugamela.gif/800px-Battle_gaugamela.gif|gaugamela_animation.gif"
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Battle_of_Zama_-_Opening_Phase.png/1024px-Battle_of_Zama_-_Opening_Phase.png|zama_opening.png"
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Battle_of_Heraclea.png/1024px-Battle_of_Heraclea.png|heraclea.png"
)

echo ""
echo "── Исторические карты-референсы (Wikimedia, PD) ──"
for entry in "${REFS[@]}"; do
  IFS='|' read -r url name <<< "$entry"
  out="docs/battle_ui/refs/${name}"
  if [ -s "$out" ]; then
    SKIP=$((SKIP+1))
    continue
  fi
  if curl -sSfL --max-time 30 "$url" -o "$out" 2>/dev/null; then
    echo "  OK   refs/${name}"
    OK=$((OK+1))
  else
    rm -f "$out"
    echo "  FAIL refs/${name} ← $url"
    FAIL_LIST+=("ref:${name}")
    FAIL=$((FAIL+1))
  fi
done

# ── 3. Terrain-тайлы (OpenGameArt — CC0 грассленд-пример) ──────────
# OpenGameArt ссылки стабильны по asset-id. Если недоступен — пропустим.
TERRAIN=(
  "https://opengameart.org/sites/default/files/grass_0.png|grass_seamless.png"
)

echo ""
echo "── Terrain-тайлы (OpenGameArt, CC0) ──"
for entry in "${TERRAIN[@]}"; do
  IFS='|' read -r url name <<< "$entry"
  out="assets/battle/terrain/${name}"
  if [ -s "$out" ]; then
    SKIP=$((SKIP+1))
    continue
  fi
  if curl -sSfL --max-time 30 "$url" -o "$out" 2>/dev/null; then
    echo "  OK   terrain/${name}"
    OK=$((OK+1))
  else
    rm -f "$out"
    echo "  FAIL terrain/${name} ← $url"
    FAIL_LIST+=("terrain:${name}")
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "── Итог ──"
echo "  OK:   $OK"
echo "  SKIP: $SKIP (уже на диске)"
echo "  FAIL: $FAIL"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Не скачалось (повтори запуск позже или скачай вручную):"
  for f in "${FAIL_LIST[@]}"; do
    echo "  - $f"
  done
  echo ""
  echo "Альтернативные бесплатные источники (CC0/CC-BY, commercial-friendly):"
  echo "  - https://kenney.nl/assets?q=environment     (CC0, без атрибуции)"
  echo "  - https://opengameart.org/art-search         (фильтр: CC0 / CC-BY)"
  echo "  - https://commons.wikimedia.org              (Public Domain карты)"
fi
