#!/usr/bin/env python3
"""
fix_population.py
=================
Исправляет население наций в nations.js до исторически верных значений
для ~300 г. до н.э.

Источники:
  - McEvedy & Jones, Atlas of World Population History (1978)
  - Scheidel, The Cambridge Economic History (2007)
  - Biraben, La population du monde (1979)
  - Durand, Historical Estimates of World Population (1974)
"""

import re
import os
import math
import json

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NATIONS_PATH = os.path.join(BASE, 'data', 'nations.js')

# ═══════════════════════════════════════════════════════════════════
# ИСТОРИЧЕСКИ ВЕРНОЕ НАСЕЛЕНИЕ ~ 300 г. до н.э.
# ═══════════════════════════════════════════════════════════════════

CORRECTIONS = {
    # ── ИНДИЯ ──────────────────────────────────────────────────────
    'maurya_empire':    30_000_000,   # 47 рег; ок. 30 млн (McEvedy 1978)

    # ── КИТАЙ (Эпоха Воюющих Царств) ───────────────────────────────
    'chu':              10_000_000,
    'qin':               8_000_000,
    'qi':                6_000_000,
    'zhao':              5_000_000,
    'wei':               5_000_000,
    'yan':               4_000_000,
    'han':               3_500_000,
    'song':              1_500_000,
    'jin_confederacy':     500_000,
    'zhongshan':           400_000,
    'zhou':                100_000,
    'minyue':              200_000,
    'cangwu':              150_000,
    'ailao':               150_000,
    'xi':                   80_000,
    'loufan':               80_000,
    'donghu':              300_000,
    'xiongnu':             500_000,
    'yuezhi':              300_000,
    'wey':                 100_000,
    'yangyu':              100_000,
    'fosia':                80_000,
    'juding':               60_000,
    'haoshi':               60_000,
    'jushi':                50_000,
    'wulei':                50_000,
    'hanben':              100_000,
    'pinglin':              80_000,
    'weii':                 80_000,

    # ── БЛИЖНИЙ ВОСТОК / ЭЛЛИНИЗМ ──────────────────────────────────
    'seleukid_empire':  20_000_000,
    'ptolemaic_kingdom': 5_000_000,
    'antigonid_kingdom': 4_000_000,
    'lysimachus':        3_000_000,   # 250 рег; сейчас 0!
    'armenia':           1_500_000,
    'cappadocia':          700_000,
    'pontus':              500_000,
    'bithynia':            400_000,   # сейчас 0
    'atropatene':          350_000,
    'paphlagonia':         200_000,
    'nabataea':            200_000,
    'cyrene':              500_000,
    'chorasmia':           200_000,
    'saka':                350_000,
    'gojoseon':          2_000_000,

    # ── ЗАПАДНОЕ СРЕДИЗЕМНОМОРЬЕ ───────────────────────────────────
    'rome':              2_500_000,
    'carthage':          3_500_000,
    'syracuse':            500_000,
    'etruscan_conf':       600_000,
    'samnites':            500_000,
    'lucani':              300_000,
    'brutii':              150_000,
    'messapians':          120_000,
    'apulians':            200_000,
    'illyria':             400_000,
    'epirus':              300_000,
    'getae':               200_000,
    'scordisci':           100_000,
    'dardani':              60_000,
    'macedon':             400_000,
    'athens':              150_000,
    'sparta':               50_000,
    'boeotian_states':     150_000,
    'aetolia':              80_000,
    'acarnania':            60_000,
    'elymia':               60_000,
    'rhodes':               80_000,

    # ── ИБЕРИЯ ─────────────────────────────────────────────────────
    'celtiberia':          600_000,
    'vaccaei':             150_000,
    'lusitanii':           200_000,
    'cantabri':             80_000,
    'vascones':            100_000,
    'llergetes':           150_000,
    'carpetani':           150_000,
    'oretani':              80_000,
    'bastetani':            80_000,
    'edetani':              80_000,
    'contestani':           80_000,
    'gallaeci':            150_000,
    'celtici':              80_000,
    'acinippo':             80_000,
    'lascutaia':            80_000,
    'kartuba':              60_000,

    # ── ГАЛЛИЯ / ГЕРМАНИЯ ──────────────────────────────────────────
    'senones':             200_000,
    'carnutes':            200_000,
    'aedui':               300_000,
    'biturges':            250_000,
    'treveria':            200_000,
    'mediomatricia':       150_000,
    'namnetes':            120_000,
    'santones':            150_000,
    'venelli':             100_000,
    'parisia':             100_000,
    'remi':                150_000,
    'vangiona':            100_000,
    'triboccia':           100_000,
    'nemetia':             200_000,
    'boii':                250_000,
    'insubri':             300_000,
    'cenomanni':           200_000,
    'boi':                 200_000,
    'ambisonti':           150_000,
    'helvetii':            300_000,

    # ── БРИТАНИЯ / ИРЛАНДИЯ ────────────────────────────────────────
    'britannia':           800_000,
    'caledonii':           150_000,
    'brigantes':           120_000,
    'ordovices':            80_000,
    'selgovae':             60_000,
    'cait':                 60_000,
    'catuvellauni':         80_000,
    'cantiaci':             80_000,
    'iceni':                60_000,
    'durotriges':           60_000,
    'dobunni':              60_000,
    'silures':              60_000,
    'demetae':              50_000,
    'cornovii':             60_000,
    'parisi_brit':          50_000,
    'votadini':             60_000,
    'novantae':             50_000,
    'venicones':            50_000,
    'taexali':              50_000,
    'damnonia':             50_000,
    'ulaid':                80_000,
    'connachta':            80_000,
    'mumu':                 80_000,
    'laigin':               80_000,

    # ── АФРИКА ─────────────────────────────────────────────────────
    'massylii':            400_000,
    'masaesyli':           250_000,
    'mauretania':          350_000,
    'meroe':               600_000,
    'garamantes':          120_000,
    'gaetulia':            180_000,
    'nasamonia':            80_000,
    'makae':                60_000,
    'blemmyes':             50_000,
    'takapes':              40_000,
    'phazania':             60_000,

    # ── СТЕПИ / СКИФИЯ ─────────────────────────────────────────────
    'scythians':           500_000,
    'bosporan_kingdom':    200_000,
    'maeotae':              80_000,
    'iazyges':              60_000,
    'siraces':              80_000,
    'agathyrsi':            60_000,

    # ── КАВКАЗ ─────────────────────────────────────────────────────
    'colchis':             200_000,
    'suaneti':              30_000,
    'bilidzhi':             20_000,

    # ── АРАВИЯ ─────────────────────────────────────────────────────
    'hadhramaut':          100_000,
    'minaeans':             80_000,
    'qataban':              60_000,
    'gerrah':               30_000,

    # ── ИНДИЯ (не Маурьи) ──────────────────────────────────────────
    'andhra':              300_000,
    'kalinga':             400_000,
    'asmaka':              150_000,
    'anuradhapura':        200_000,
    'ruhunu':              100_000,
    'bhoja':               150_000,
    'kuntala':             100_000,
    'oaymaannadu':          80_000,
    'kamarupa':             80_000,

    # ── ЮГО-ВОСТОЧНАЯ АЗИЯ ─────────────────────────────────────────
    'yayoi_japan':         800_000,
    'malaya':               80_000,
    'non_nok_that':         60_000,
    'tenasserim':           60_000,
    'thaton':               80_000,
    'arakan':               60_000,
    'nyanggaun':            80_000,
    'khao_sam_kaeo':        60_000,
    'kedah':                60_000,
    'panai':                60_000,
    'xiangkhoang':          50_000,
    'nam_cuong':            60_000,
    'chansen':              60_000,

    # ── НАЦИИ С 0 НАСЕЛЕНИЕМ ───────────────────────────────────────
    'antigonus':           500_000,
    'bosporan':             80_000,
    'koloe':               100_000,
    'ta_izz':               50_000,
    'lysimachus':        3_000_000,
    'colchis':             200_000,
    'bithynia':            400_000,
}

# Доли профессий (по умолчанию для аграрной античности)
DEFAULT_PROFESSIONS = {
    'farmers':   0.60,
    'craftsmen': 0.12,
    'merchants': 0.05,
    'sailors':   0.03,
    'clergy':    0.04,
    'soldiers':  0.08,
    'slaves':    0.08,
}


def make_profession_block(total):
    return {p: max(int(total * r), 1) for p, r in DEFAULT_PROFESSIONS.items()}


def scale_profession_block(by_prof, scale):
    return {p: max(int(v * scale), 1) for p, v in by_prof.items()}


# ── Регулярные выражения ────────────────────────────────────────────

# Поле "population": { ... } как JSON-ключ
# Требуем предшествующий запятую/открывающий {
POP_BLOCK_RE = re.compile(
    r'(?<=[,{])"population"\s*:\s*\{[^}]*\}'
)

# Поля внутри population
POP_TOTAL_RE = re.compile(r'"total"\s*:\s*(\d+)')
POP_BYPROF_RE = re.compile(r'"by_profession"\s*:\s*(\{[^}]+\})')

# Ключ "economy": как JSON-ключ (предшествует запятая/открывающий {)
ECONOMY_KEY_RE = re.compile(r'(?<=[,{])"economy"\s*:')


def update_existing_pop(pop_match_str, new_total, scale):
    """Обновляет population блок: total и by_profession."""
    result = pop_match_str

    # Обновить total
    result = POP_TOTAL_RE.sub(f'"total":{new_total}', result, count=1)

    # Обновить by_profession если есть
    bp_m = POP_BYPROF_RE.search(result)
    if bp_m:
        try:
            old_bp = json.loads(bp_m.group(1))
            new_bp = scale_profession_block(old_bp, scale)
        except Exception:
            new_bp = make_profession_block(new_total)
        new_bp_str = json.dumps(new_bp, ensure_ascii=False, separators=(',', ':'))
        result = result[:bp_m.start(1)] + new_bp_str + result[bp_m.end(1):]

    return result


def insert_population(line, new_total):
    """
    Добавляет поле population в строку нации, не имеющей его.
    Вставляет после "regions":[...] или перед последней }.
    """
    bp = make_profession_block(new_total)
    bp_str = json.dumps(bp, ensure_ascii=False, separators=(',', ':'))
    pop_json = (
        f'"population":{{"total":{new_total},'
        f'"by_profession":{bp_str},'
        f'"happiness":50,'
        f'"growth_rate":0.002}}'
    )

    # Попробуем вставить перед "economy": (как JSON-ключ, с запятой/{ перед ним)
    m = ECONOMY_KEY_RE.search(line)
    if m:
        insert_pos = m.start() + 1  # +1 чтобы сохранить предшествующую запятую/{
        # Вставляем pop_json + запятая перед "economy"
        return line[:insert_pos] + pop_json + ',' + line[insert_pos:]

    # Иначе — вставить в конец объекта, перед последней }
    last_brace = line.rfind('}')
    if last_brace >= 0:
        # Проверяем что перед } есть что-то (не пустой объект)
        before = line[:last_brace].rstrip()
        sep = ',' if before and not before.endswith('{') else ''
        return before + sep + pop_json + line[last_brace:]

    return line + ',' + pop_json


def process_line(line, nation_id, new_total):
    """Обновляет население в строке нации."""
    # Убираем ведущие пробелы для обработки, потом восстанавливаем
    indent = len(line) - len(line.lstrip())
    body = line.lstrip()
    trailing_comma = body.rstrip().endswith(',')
    body_stripped = body.rstrip().rstrip(',')

    # ── Есть ли поле population? ────────────────────────────────────
    m = POP_BLOCK_RE.search(body_stripped)
    if m:
        # Обновляем существующий блок
        old_total_m = POP_TOTAL_RE.search(m.group(0))
        old_total = int(old_total_m.group(1)) if old_total_m else 0
        scale = new_total / old_total if old_total > 0 else 1.0

        new_pop_block = update_existing_pop(m.group(0), new_total, scale)
        new_body = body_stripped[:m.start()] + new_pop_block + body_stripped[m.end():]

        # Масштабировать military (infantry, cavalry) — корень из scale
        if scale > 1.0:
            mil_scale = math.sqrt(scale)
            new_body = re.sub(
                r'(?<="infantry":)(\d+)',
                lambda x: str(max(int(int(x.group(1)) * mil_scale), int(x.group(1)))),
                new_body
            )
            new_body = re.sub(
                r'(?<="cavalry":)(\d+)',
                lambda x: str(max(int(int(x.group(1)) * mil_scale), int(x.group(1)))),
                new_body
            )
            # Treasury — корень
            new_body = re.sub(
                r'(?<="treasury":)(\d+)',
                lambda x: str(int(int(x.group(1)) * math.sqrt(mil_scale))),
                new_body
            )
    else:
        old_total = 0
        scale = float('inf')
        new_body = insert_population(body_stripped, new_total)

    # Восстановить запятую и отступ
    if trailing_comma and not new_body.endswith(','):
        new_body += ','
    return ' ' * indent + new_body, old_total, scale


def main():
    text = open(NATIONS_PATH, encoding='utf-8').read()
    lines = text.split('\n')

    nations_start_idx = next(
        i for i, l in enumerate(lines)
        if re.search(r'nations\s*:\s*\{', l)
    )

    applied = []
    not_found = []
    new_lines = []

    for i, line in enumerate(lines):
        if i < nations_start_idx:
            new_lines.append(line)
            continue

        stripped = line.strip().rstrip(',')
        km = re.match(r'^"([^"]+)"\s*:\s*\{(.+)', stripped)
        if not km:
            new_lines.append(line)
            continue

        nation_id = km.group(1)
        if nation_id not in CORRECTIONS:
            new_lines.append(line)
            continue

        new_total = CORRECTIONS[nation_id]

        try:
            new_line, old_total, scale = process_line(line, nation_id, new_total)
            new_lines.append(new_line)
            applied.append((nation_id, old_total, new_total, scale))
        except Exception as e:
            print(f"  ОШИБКА {nation_id}: {e}")
            new_lines.append(line)

    open(NATIONS_PATH, 'w', encoding='utf-8').write('\n'.join(new_lines))

    # ── Отчёт ────────────────────────────────────────────────────────
    not_applied = [n for n in CORRECTIONS if n not in [a[0] for a in applied]]

    print(f"\n=== ИСПРАВЛЕНО: {len(applied)} наций ===")
    print(f"\n{'Нация':<35} {'Старое':>12} {'Новое':>12} {'×':>7}")
    print("-" * 72)
    for nid, old, new, scale in sorted(applied, key=lambda x: -x[2]):
        if scale == float('inf'):
            sc_str = "(добавлено)"
        else:
            sc_str = f"{scale:.1f}×"
        print(f"  {nid:<33} {old:>12,} {new:>12,} {sc_str:>11}")

    total_old = sum(o for _, o, _, s in applied if s != float('inf'))
    total_new = sum(n for _, _, n, _ in applied)
    print(f"\n  Всего население: {total_old:,} → {total_new:,}")
    if not_applied:
        print(f"\n  Не найдено в nations.js ({len(not_applied)}): {not_applied[:10]}")


if __name__ == '__main__':
    main()
