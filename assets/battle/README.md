# assets/battle/ — ассеты для тактического боя (Track B)

Ресурсы для визуального редизайна тактики в стиле History Flywheel /
Kings & Generals / Ultimate General. Используются сессиями **Track B**
(см. [docs/perf_plan_15_sessions.md](../../docs/perf_plan_15_sessions.md)
раздел «Track B — Редизайн тактического боя»).

## Структура

```
assets/battle/
├── README.md                          ← этот файл (атрибуция лицензий)
├── download_battle_assets.sh          ← идемпотентный фетч CC0/CC-BY/PD
├── units/        (*.svg, 22 иконок)   ← типы юнитов: гоплит, фалангит, лучник,
│                                        праща, конница, слон, артиллерия и т.п.
├── objects/      (*.svg, 7 иконок)    ← лагеря, стены, башни, мосты, трофеи
└── terrain/      (*.jpg/*.png, seamless tiles)
                                        ← НЕ в git (gitignore) — фетчится скриптом.
                                          Публичный домен / CC0 источники.
```

## Лицензии (CC-BY 3.0 обязывает кредит)

### Иконки — все с [game-icons.net](https://game-icons.net) (CC-BY 3.0)

Авторы: **Lorc** и **Delapouite**. Ссылки на оригиналы:

**Unit icons (`units/`):**
| Локальный файл | Оригинал | Автор |
|---|---|---|
| `hoplite.svg`          | [spartan](https://game-icons.net/1x1/lorc/spartan.html)             | Lorc      |
| `phalangite.svg`       | [spear-hook](https://game-icons.net/1x1/lorc/spear-hook.html)       | Lorc      |
| `archer.svg`           | [archer](https://game-icons.net/1x1/delapouite/archer.html)         | Delapouite|
| `slinger.svg`          | [high-shot](https://game-icons.net/1x1/lorc/high-shot.html)         | Lorc      |
| `heavy_cavalry.svg`    | [cavalry](https://game-icons.net/1x1/delapouite/cavalry.html)       | Delapouite|
| `light_cavalry.svg`    | [horseshoe](https://game-icons.net/1x1/delapouite/horseshoe.html)   | Delapouite|
| `light_infantry.svg`   | [battle-gear](https://game-icons.net/1x1/lorc/battle-gear.html)     | Lorc      |
| `melee_generic.svg`    | [crossed-swords](https://game-icons.net/1x1/lorc/crossed-swords.html) | Lorc    |
| `cavalry_melee.svg`    | [crossed-sabres](https://game-icons.net/1x1/lorc/crossed-sabres.html) | Lorc    |
| `mounted.svg`          | [horse-head](https://game-icons.net/1x1/delapouite/horse-head.html) | Delapouite|
| `war_elephant.svg`     | [elephant](https://game-icons.net/1x1/delapouite/elephant.html)     | Delapouite|
| `artillery_siege.svg`  | [trebuchet](https://game-icons.net/1x1/delapouite/trebuchet.html)   | Delapouite|
| `naval_trireme.svg`    | [trireme](https://game-icons.net/1x1/delapouite/trireme.html)       | Delapouite|
| `naval_galley.svg`     | [galley](https://game-icons.net/1x1/delapouite/galley.html)         | Delapouite|
| `general_standard.svg` | [rally-the-troops](https://game-icons.net/1x1/lorc/rally-the-troops.html) | Lorc |

**Objects icons (`objects/`):**
| Локальный файл | Оригинал | Автор |
|---|---|---|
| `camp_tent.svg`       | [celebration-fire](https://game-icons.net/1x1/lorc/celebration-fire.html) | Lorc |
| `fortification.svg`   | [castle](https://game-icons.net/1x1/delapouite/castle.html)          | Delapouite |
| `watchtower.svg`      | [tower-flag](https://game-icons.net/1x1/delapouite/tower-flag.html)  | Delapouite |
| `palisade_wood.svg`   | [palisade](https://game-icons.net/1x1/delapouite/palisade.html)      | Delapouite |
| `bridge_stone.svg`    | [stone-bridge](https://game-icons.net/1x1/delapouite/stone-bridge.html) | Delapouite |
| `victory_marker.svg`  | [laurels-trophy](https://game-icons.net/1x1/delapouite/laurels-trophy.html) | Delapouite |
| `siege_horse.svg`     | [trojan-horse](https://game-icons.net/1x1/delapouite/trojan-horse.html) | Delapouite |

**CC-BY 3.0 условие:** при публикации игры / видео с использованием этих
иконок — указать кредит в финальных титрах:
> «Unit icons by Lorc and Delapouite, via game-icons.net (CC BY 3.0)»

Full license: https://creativecommons.org/licenses/by/3.0/

**Коммерческое использование разрешено** CC-BY 3.0 при соблюдении атрибуции.

## Terrain-текстуры (НЕ в git)

Для painted-подложки (Session B-2) нужны seamless-тайлы биомов +
1–2 исторические карты-референса в painted-стиле. Их НЕ кладём в
git (правило из [CLAUDE.md](../../CLAUDE.md): `assets/textures/*.jpg`
уже в [.gitignore](../../.gitignore) с момента Шага 54).

**Источники для `terrain/` (все свободные, commercial-friendly):**

1. **[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Maps_of_the_Battle_of_Cannae)** — Public Domain исторические карты (Cannae, Gaugamela, Zama) как референсы и фоны. PD = commercial OK без ограничений.
2. **[OpenGameArt — Terrain tiles](https://opengameart.org/art-search?keys=terrain+grass+seamless)** — фильтровать по CC0 / CC-BY для коммерческого использования.
3. **[Kenney.nl — Environment packs](https://kenney.nl/assets?q=environment)** — **CC0** готовые наборы (public domain, коммерческое без ограничений, без требования атрибуции).
4. **[Stamen Watercolor tiles](https://maps.stamen.com/)** — CC-BY 3.0, живописный стиль (commercial OK при атрибуции).

**Скачать все доступные:** `bash assets/battle/download_battle_assets.sh`.

## Политика репозитория: только свободные ассеты

Все коммитимые ассеты **исключительно CC0 / CC-BY / Public Domain** с
разрешённым коммерческим использованием. Платные паки и assets с
некоммерческими лицензиями (CC-BY-NC, проприетарные) **не используются**.

При добавлении нового ассета — указать лицензию в этом README и
источник; если лицензия запрещает commercial или требует share-alike
(CC-BY-SA) — **не коммитить**, искать альтернативу.

## Референсы (скрины/анимации для brief'а Session B-1)

Лежат в [docs/battle_ui/refs/](../../docs/battle_ui/refs/). Тоже частично
фетчатся `download_battle_assets.sh`, частично — ручное сохранение
скриншотов (копирайт видео нельзя автоматически скачивать, используются
только как визуальный brief, не встраиваются в игру).
