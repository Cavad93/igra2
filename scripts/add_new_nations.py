#!/usr/bin/env python3
"""
Добавление 29 новых наций из Regon.xlsx в nations.js
Все нации — реальные исторические племена 304 BC.
"""
import re, json

# Новые нации для добавления
# Формат: id → {name, adj, color, emoji, gov_type, note, pop}
NEW_NATIONS = {

    # ══ ЦЕНТРАЛЬНАЯ ИТАЛИЯ ═══════════════════════════════════════════════
    "praetuttii": {
        "name": "Претуттии", "adjective": "претуттийское",
        "color": "#9B7B8B", "flag_emoji": "🏔️",
        "gov": "tribal",
        "note": "Претуттии (Praetuttii) — италийское племя на Адриатическом побережье между реками Вомано и Пескара (совр. провинция Терамо). Жили между пиценами и вестинами; главный город — Интерамна Претутиана (совр. Терамо). Позднее вошли в состав Римской конфедерации.",
        "pop": 40000
    },

    # ══ АЛЬПИЙСКИЕ / РЭТИЙСКИЕ ПЛЕМЕНА ══════════════════════════════════
    "suaneti": {
        "name": "Суанеты", "adjective": "суанетское",
        "color": "#8B9B7B", "flag_emoji": "🏔️",
        "gov": "tribal",
        "note": "Суанеты (Sarunetes/Suaneti) — рэтийское/альпийское племя в горах Граубюндена (совр. Восточная Швейцария). Населяли высокогорные долины Альп, занимались скотоводством и грабежом торговых путей через перевалы.",
        "pop": 20000
    },
    "caluconi": {
        "name": "Калуконы", "adjective": "калуконское",
        "color": "#7B8B9B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Калуконы (Calucones) — рэтийское горное племя в районе Кьявенны и Юлийских Альп. Упоминаются Плинием среди альпийских народов, покорённых Августом.",
        "pop": 15000
    },
    "ambidravi": {
        "name": "Амбидравы", "adjective": "амбидравское",
        "color": "#7B9B8B", "flag_emoji": "🏔️",
        "gov": "tribal",
        "note": "Амбидравы (Ambidravi) — кельто-рэтийское племя в долине реки Драу (Каринтия, совр. Австрия). Название означает «живущие по обоим берегам Драу». Контролировали торговые пути через Альпы.",
        "pop": 18000
    },
    "breuni": {
        "name": "Бреуны", "adjective": "бреунское",
        "color": "#9B8B7B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Бреуны (Breuni) — рэтийское племя в долине реки Инн (совр. Тироль, Австрия). Упомянуты Горацием (Оды IV.14) как побеждённые Тиберием в войне 15 BC. Населяли горные укреплённые поселения.",
        "pop": 18000
    },
    "sevaci": {
        "name": "Севаки", "adjective": "севакское",
        "color": "#9B7B8B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Севаки (Sevaci) — небольшое альпийское племя Южного Тироля в районе Себатума (совр. Сан-Лоренцо-ди-Себато). Одно из многих рэтийских горных племён, покорённых Римом в эпоху Августа.",
        "pop": 12000
    },
    "venosti": {
        "name": "Веносты", "adjective": "веностское",
        "color": "#7B7B9B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Веносты (Venostes/Venosti) — рэтийское племя, населявшее Валь-Венóста (Vinschgau) — верхнюю долину Адиджи (совр. Западный Тироль). Название сохранилось в топониме «Вентимилья». Занимались транзитной торговлей через перевал Решен.",
        "pop": 15000
    },
    "trumpili": {
        "name": "Трумпилы", "adjective": "трумпильское",
        "color": "#8B9B9B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Трумпилы (Trumpilini) — рэтийское племя долины Тромпья (Valle Trompia) к северу от Брешии. Добывали железо — рудники Тромпьи снабжали металлом всю Цизальпийскую Галлию.",
        "pop": 15000
    },
    "focunati": {
        "name": "Фокунаты", "adjective": "фокунатское",
        "color": "#8B7B9B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Фокунаты (Fokunates/Focunates) — рэтийское племя района Фёссена и Тирала в Альгойских Альпах (совр. Бавария/Австрия). Контролировали перевальные пути в верховьях Леха.",
        "pop": 12000
    },
    "genauni": {
        "name": "Генауны", "adjective": "генаунское",
        "color": "#9B9B7B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Генауны (Genauni) — рэтийское племя, упомянутое Горацием (Оды IV.14) среди побеждённых Тиберием. Жили в верхнем течении Инна восточнее амбисонтов. Одно из малых горных племён Восточных Альп.",
        "pop": 12000
    },
    "seduni": {
        "name": "Седуны", "adjective": "седунское",
        "color": "#7B8B7B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Седуны (Seduni) — кельтское/лигурийское племя Валлисских Альп (совр. кантон Вале/Вали, Швейцария). Главный город — Седунум (совр. Сьон). Контролировали перевал Большой Сен-Бернар. Упомянуты Цезарем в Галльской войне.",
        "pop": 20000
    },
    "varagria": {
        "name": "Варагры", "adjective": "варагрское",
        "color": "#9B8B8B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Варагры (Vagrii/Varagri) — небольшое лигурийско-альпийское племя Приморских Альп в районе перевала Мадалена (совр. граница Франции и Италии). Жили в труднодоступных горных долинах.",
        "pop": 10000
    },
    "vesubia": {
        "name": "Везубии", "adjective": "везубийское",
        "color": "#8B8B7B", "flag_emoji": "⛰️",
        "gov": "tribal",
        "note": "Везубии (Vesubiani) — небольшое альпийское племя долины реки Везюби (совр. Альп-Маритим, Франция). Название сохранилось в гидрониме Везюби — притока Вара. Горные скотоводы Приморских Альп.",
        "pop": 10000
    },

    # ══ ЦИЗАЛЬПИЙСКИЕ / ЛИГУРИЙСКИЕ ПЛЕМЕНА ═════════════════════════════
    "orobii": {
        "name": "Оробии", "adjective": "оробийское",
        "color": "#5B8B5B", "flag_emoji": "🌲",
        "gov": "tribal",
        "note": "Оробии (Orobii/Orumbovii) — древнее доримское и докельтское население предальпийских районов Ломбардии (Комо, Бергамо, Лекко). По Плинию — автохтонный народ, предшествовавший галлам. Постепенно ассимилированы инсубрами и центоманнами.",
        "pop": 50000
    },
    "anamaria": {
        "name": "Анамарии", "adjective": "анамарийское",
        "color": "#6B8B6B", "flag_emoji": "🌾",
        "gov": "tribal",
        "note": "Анамарии (Anamari) — небольшое племя Паданской долины в районе Пьяченцы и Кастеджо (совр. Павия). Соседствовали с лаэвами и лигурами; вероятно, смешанное лигуро-кельтское население.",
        "pop": 20000
    },
    "lapicinia": {
        "name": "Лапицины", "adjective": "лапицинское",
        "color": "#7B9B6B", "flag_emoji": "🌿",
        "gov": "tribal",
        "note": "Лапицины (Lapicini) — небольшое лигурийское или кельто-лигурийское племя Лигурийских Апеннин в районе Апуа (совр. Поджо-ди-Брусатурра, Тоскана). Жили в горных условиях между апуанами и инсубрами.",
        "pop": 15000
    },
    "libuia": {
        "name": "Либуи", "adjective": "либуйское",
        "color": "#6B9B7B", "flag_emoji": "🌾",
        "gov": "tribal",
        "note": "Либуи (Libui/Libuii) — лигурийское или кельто-лигурийское племя Транспаданы в районе Верчелли и Иврея. По Полибию и Ливию, жили в Паданской долине среди других галло-лигурийских народов Пьемонта.",
        "pop": 25000
    },
    "tigullia": {
        "name": "Тигуллии", "adjective": "тигуллийское",
        "color": "#7B9B7B", "flag_emoji": "⚓",
        "gov": "tribal",
        "note": "Тигуллии (Tigullii) — лигурийское прибрежное племя залива Тигуллио (совр. Кьявари/Рапалло). Промышляли рыболовством и торговлей на Лигурийском море. Дали название заливу Тигуллио (Golfo del Tigullio).",
        "pop": 18000
    },
    "dectuninia": {
        "name": "Дектунины", "adjective": "дектунинское",
        "color": "#6B8B7B", "flag_emoji": "🌿",
        "gov": "tribal",
        "note": "Дектунины (Dectuniates/Dectuninia) — небольшое лигурийское племя в районе Либарны (совр. Серравалле Скривия, Алессандрия). Населяли переходную зону между Апеннинами и Паданской долиной.",
        "pop": 12000
    },
    "vagiennia": {
        "name": "Вагиенны", "adjective": "вагиеннское",
        "color": "#8B9B6B", "flag_emoji": "🌄",
        "gov": "tribal",
        "note": "Вагиенны (Vagienni/Bagienni) — лигурийское горное племя Пьемонта в районе Мондови и Баньоло. По Плинию, главный лигурийский народ южных склонов Альп. Позднее дали название городу Баджинорум (совр. Байя-Мондови). Упомянуты Страбоном.",
        "pop": 30000
    },
    "ilvatia_coeba": {
        "name": "Ильватии Куэба", "adjective": "ильватийское",
        "color": "#6B7B8B", "flag_emoji": "🌊",
        "gov": "tribal",
        "note": "Ильватии Куэба (Ilvatii Coebani) — ветвь племени ильватиев лигурийского побережья в районе Куилиано и Крисии (совр. провинция Савона). Занимались прибрежной торговлей и рыбным промыслом.",
        "pop": 12000
    },
    "iadatinia": {
        "name": "Ядатины", "adjective": "ядатинское",
        "color": "#7B8B6B", "flag_emoji": "🌾",
        "gov": "tribal",
        "note": "Ядатины (Iadatini) — небольшое лигурийское или галло-лигурийское племя в районе Вардагате (совр. Казале-Монферрато, Пьемонт). Жили в переходной зоне между лигурийскими горами и Паданской равниной.",
        "pop": 12000
    },
    "votodronia": {
        "name": "Вотодронии", "adjective": "вотодронийское",
        "color": "#6B9B6B", "flag_emoji": "🌾",
        "gov": "tribal",
        "note": "Вотодронии (Votodroni) — небольшое племя Транспаданы в районе Виктимул (совр. Сан-Дженуарио, провинция Верчелли). Возможно, ответвление лигурийских или кельтских племён Пьемонта.",
        "pop": 12000
    },
    "oxybia": {
        "name": "Оксибии", "adjective": "оксибийское",
        "color": "#8B9B8B", "flag_emoji": "🌊",
        "gov": "tribal",
        "note": "Оксибии (Oxybii) — лигурийское прибрежное племя Прованса (совр. район Канн-Антиб). Упомянуты Полибием: в 154 BC напали на Никею и Антиполис, что вызвало первое римское вмешательство в Галлию. Впоследствии покорены Римом.",
        "pop": 20000
    },

    # ══ САРДИНСКИЕ ПЛЕМЕНА ═══════════════════════════════════════════════
    "rubrensians": {
        "name": "Рубрензии", "adjective": "рубрензийское",
        "color": "#9B7B5B", "flag_emoji": "🗡️",
        "gov": "tribal",
        "note": "Рубрензии (Rubricenses) — сардинское племя юго-западной Сардинии в районе Тирзены. Одно из многих аборигенных сардинских народов, сохранявших автономию во внутренних районах острова вне зоны карфагенского контроля.",
        "pop": 20000
    },
    "valentini": {
        "name": "Валентины", "adjective": "валентинское",
        "color": "#8B6B5B", "flag_emoji": "🗡️",
        "gov": "tribal",
        "note": "Валентины (Valentini) — сардинское племя центральной Сардинии в районе Лакона. Населяли горные районы нуражической культуры; сопротивлялись карфагенской экспансии во внутренние районы острова.",
        "pop": 15000
    },
    "luquidonenses": {
        "name": "Луквидонензии", "adjective": "луквидонензийское",
        "color": "#9B8B6B", "flag_emoji": "🗡️",
        "gov": "tribal",
        "note": "Луквидонензии (Luquidonenses) — сардинское племя Логудоро (С. Сардиния; топоним происходит от «Loqui de Torres»). Населяли плодородные равнины севера острова между Сасари и Нуоро. Одно из наиболее многочисленных внутренних племён Сардинии.",
        "pop": 25000
    },
    "tibulati": {
        "name": "Тибулаты", "adjective": "тибулатское",
        "color": "#7B6B5B", "flag_emoji": "⚓",
        "gov": "tribal",
        "note": "Тибулаты (Tibulenses) — сардинское племя северо-восточной оконечности острова в районе Тибулы (совр. Санта-Тереса-ди-Галлура). Приморское племя, занимавшееся рыбной ловлей и торговлей в Тирренском море.",
        "pop": 12000
    },
    "longonenses": {
        "name": "Лонгонензии", "adjective": "лонгонензийское",
        "color": "#8B7B6B", "flag_emoji": "⚓",
        "gov": "tribal",
        "note": "Лонгонензии (Longonenses) — сардинское племя в районе Лонгона (возможно, совр. Лонгосардо/Санта-Тереса-ди-Галлура или лагуна Лонги). Одно из малых прибрежных племён восточного побережья Сардинии.",
        "pop": 12000
    },
}

print(f"Новых наций для добавления: {len(NEW_NATIONS)}")

# Read nations.js
with open('data/nations.js') as f:
    text = f.read()

# Check which are already in file
already = []
to_add = []
for nid in NEW_NATIONS:
    if re.search(r'\n\s*"' + nid + r'"\s*:', text):
        already.append(nid)
    else:
        to_add.append(nid)

print(f"Уже есть: {already}")
print(f"Добавить: {len(to_add)}")

# Build nation JSON strings for insertion
# Insert in alphabetical order before the closing of INITIAL_GAME_STATE.nations
def make_nation_json(nid, data):
    regions = []  # stage5 will fill them
    entry = {
        "name": data["name"],
        "adjective": data["adjective"],
        "color": data["color"],
        "flag_emoji": data["flag_emoji"],
        "is_player": False,
        "is_minor": True,
        "ai_personality": "defensive",
        "ai_priority": "survival",
        "government": {
            "type": data.get("gov", "tribal"),
            "legitimacy": 50,
            "stability": 52,
            "ruler": {
                "type": "tribal_chief",
                "name": data["name"] + " вождь",
                "personal_power": 55
            }
        },
        "regions": regions,
        "population": {
            "total": data.get("pop", 15000),
            "happiness": 53,
            "growth_rate": 0.002
        },
        "economy": {
            "treasury": max(300, data.get("pop", 15000) // 50),
            "tax_rate": 0.05,
            "primary_exports": ["cattle", "timber"],
            "primary_imports": ["iron", "salt"],
            "trade_partners": [],
            "stockpile": {"wheat": max(1000, data.get("pop", 15000) // 10)},
            "trade_routes": []
        },
        "military": {
            "infantry": max(500, data.get("pop", 15000) // 20),
            "cavalry": 100,
            "ships": 0,
            "mercenaries": 0,
            "morale": 58,
            "loyalty": 60,
            "at_war_with": []
        },
        "relations": {},
        "active_laws": [],
        "characters": [],
        "historical_note": data["note"]
    }
    return f'    "{nid}": {json.dumps(entry, ensure_ascii=False)}'

# Find insertion point — add nations alphabetically
# We'll insert each nation in the right alphabetical position
for nid in sorted(to_add):
    nation_line = make_nation_json(nid, NEW_NATIONS[nid])

    # Find alphabetically correct position
    # Find the next nation ID after nid alphabetically
    existing_ids = re.findall(r'\n    "(\w+)"\s*:\s*\{', text)

    next_id = None
    for eid in existing_ids:
        if eid > nid:
            next_id = eid
            break

    if next_id:
        # Insert before next_id
        m = re.search(r'\n    "' + re.escape(next_id) + r'"\s*:\s*\{', text)
        insert_pos = m.start()
        text = text[:insert_pos] + '\n' + nation_line + ',' + text[insert_pos:]
        print(f"  + {nid} (перед {next_id})")
    else:
        print(f"  WARN: не нашёл позицию для {nid}")

with open('data/nations.js', 'w') as f:
    f.write(text)

print("\nGotovo! nations.js обновлён.")
