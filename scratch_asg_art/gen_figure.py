# -*- coding: utf-8 -*-
"""
gen_figure.py — параметрическая низкополигональная фигурка воина Ancient Strategy.

Запуск:
    blender -b -P gen_figure.py -- --type hoplite --culture hellenic --out /opt/asg-art/out

Вся геометрия собрана из примитивов bpy/bmesh (библиотека частей common.py),
материалы — процедурные шейдерные графы (без внешних текстур/картинок).
Правило владельца Р97: 100% оригинальный процедурный контент, ничего не заимствовано.

Параметры (после '--'):
    --type      hoplite | legionary | punic_infantry | numidian_cavalry   (пресет культуры/снаряжения)
    --culture   hellenic | roman | punic | numidian   (переопределяет пресет типа, информационно)
    --helmet    corinthian | attic | montefortino | pileus | none
    --shield    hoplon | scutum | pelta | none
    --weapon    spear | sarissa | pilum | sword
    --cloak     0 | 1
    --color     hex без '#' — цвет нации на щите/плаще (по умолчанию берётся из пресета типа)
    --engine    CYCLES | BLENDER_WORKBENCH
    --samples   int (сэмплы Cycles)
    --res       int (сторона PNG, px)
    --budget    int (лимит треугольников фигуры без коня)
    --seed      int
    --out       путь к каталогу вывода
"""
import bpy
import math
import mathutils
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

Vector = mathutils.Vector

TYPE_PRESETS = {
    "hoplite": dict(culture="hellenic", helmet="corinthian", shield="hoplon",
                     weapon="spear", cloak=1, color="a3262b", mounted=False,
                     label="Гоплит эллинский"),
    "legionary": dict(culture="roman", helmet="montefortino", shield="scutum",
                        weapon="pilum", cloak=1, color="7a1414", mounted=False,
                        label="Легионер римский"),
    "punic_infantry": dict(culture="punic", helmet="pileus", shield="pelta",
                             weapon="spear", cloak=0, color="1f3a5f", mounted=False,
                             label="Пунийский пехотинец"),
    "numidian_cavalry": dict(culture="numidian", helmet="none", shield="pelta",
                               weapon="spear", cloak=1, color="c98a1a", mounted=True,
                               label="Нумидийский всадник"),
}

DEFAULTS = dict(type="hoplite", culture="", helmet="", shield="", weapon="",
                 cloak=-1, color="", engine="CYCLES", samples=64, res=512,
                 budget=800, seed=1, out="/opt/asg-art/out")


def hex_to_rgb(h):
    h = h.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    # sRGB -> linear (приближённо), т.к. Blender ждёт линейные значения в узлах
    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (to_lin(r), to_lin(g), to_lin(b))


# высота спины коня (верх корпуса build_horse) — общая константа, чтобы наездник
# не «парил» над конём и не проваливался внутрь него
HORSE_BACK_Z = 1.30


# ───────────────────────── тело ─────────────────────────

def build_body(mounted=False):
    """Собирает торс/ноги/руки/голову. Возвращает (список объектов, якоря).

    Для mounted=True ноги строятся не от земли вверх, а короткими культяпками,
    свисающими вниз-в-стороны от посадочной точки (седла) — наездник сидит
    верхом, а не стоит на невидимой земле."""
    objs = []
    anchors = {}

    if mounted:
        seat_z = HORSE_BACK_Z - 0.05  # чуть утоплен в спину коня, чтобы не было щели
        leg_h = 0.40
        ground_z = seat_z  # для расчёта плаща/пропорций ниже
        for side, sx in (("л", -1), ("п", 1)):
            leg = C.make_cylinder(f"Нога_{side}", 0.095, 0.07, leg_h, segments=6,
                                   location=(sx * 0.17, 0.03, seat_z - leg_h * 0.42),
                                   rotation=(math.radians(sx * 45), 0, 0))
            objs.append(leg)
        torso_z0 = seat_z
    else:
        ground_z = 0.0
        leg_h = 0.92
        leg_z1 = ground_z + leg_h
        spread = 0.12
        for side, sx in (("л", -1), ("п", 1)):
            leg = C.make_cylinder(f"Нога_{side}", 0.10, 0.075, leg_h, segments=6,
                                   location=(sx * spread, 0, (ground_z + leg_z1) / 2.0))
            objs.append(leg)
            foot = C.make_box(f"Стопа_{side}", size=(0.10, 0.22, 0.06),
                               location=(sx * spread, 0.05, ground_z + 0.03))
            objs.append(foot)
        torso_z0 = leg_z1

    torso_h = 0.58
    torso_z1 = torso_z0 + torso_h
    torso_center_z = (torso_z0 + torso_z1) / 2.0
    torso = C.make_cylinder("Торс", 0.235, 0.195, torso_h, segments=8,
                             location=(0, 0, torso_center_z))
    objs.append(torso)

    neck = C.make_cylinder("Шея", 0.075, 0.07, 0.09, segments=6,
                            location=(0, 0, torso_z1 + 0.045))
    objs.append(neck)

    head_r = 0.145
    head_z = torso_z1 + 0.09 + head_r
    head = C.make_ico("Голова", head_r, subdiv=1, location=(0, 0, head_z))
    objs.append(head)

    shoulder_z = torso_z1 - 0.06
    arm_len = 0.50
    arm_r = 0.06

    arm_l = C.make_cylinder("Рука_л", arm_r, arm_r * 0.8, arm_len, segments=6,
                             location=(-0.30, 0.10, shoulder_z - arm_len * 0.35),
                             rotation=(math.radians(-70), 0, math.radians(12)))
    objs.append(arm_l)
    arm_r_obj = C.make_cylinder("Рука_п", arm_r, arm_r * 0.8, arm_len, segments=6,
                                 location=(0.30, -0.02, shoulder_z - arm_len * 0.45),
                                 rotation=(math.radians(-15), 0, math.radians(-8)))
    objs.append(arm_r_obj)

    belt = C.make_cylinder("Пояс", 0.20, 0.20, 0.06, segments=8,
                            location=(0, 0, torso_z0 + 0.04))
    objs.append(belt)

    # верхом руки короче тянутся в стороны — иначе щит/оружие «отлетают» от силуэта коня
    hand_k = 0.82 if mounted else 1.0

    anchors["ground"] = ground_z
    anchors["head_center"] = Vector((0, 0, head_z))
    anchors["head_top"] = Vector((0, 0, head_z + head_r))
    anchors["torso_top"] = Vector((0, 0, torso_z1))
    anchors["torso_center"] = Vector((0, 0, torso_center_z))
    anchors["shield_hand"] = Vector((-0.42 * hand_k, 0.22 * hand_k, shoulder_z - 0.10))
    anchors["weapon_hand"] = Vector((0.40 * hand_k, -0.05 * hand_k, shoulder_z - 0.50))
    anchors["shoulder_back"] = Vector((0, -0.05, torso_z1 - 0.03))
    return objs, anchors


# ───────────────────────── шлемы ─────────────────────────

def build_helmet(kind, head_center, head_r):
    objs = []
    cz = head_center.z
    if kind == "none":
        return objs
    if kind == "corinthian":
        dome = C.make_ico("Шлем_купол", head_r * 1.10, subdiv=1, location=(0, 0, cz + 0.01))
        objs.append(dome)
        crest = C.make_box("Шлем_гребень", size=(0.045, 0.34, 0.06),
                            location=(0, 0, cz + head_r * 1.02))
        objs.append(crest)
        mask = C.make_box("Шлем_маска", size=(0.24, 0.10, 0.20),
                           location=(0, -head_r * 0.85, cz - 0.02))
        objs.append(mask)
    elif kind == "attic":
        dome = C.make_ico("Шлем_купол", head_r * 1.08, subdiv=0, location=(0, 0, cz + 0.01))
        objs.append(dome)
        knob = C.make_cylinder("Шлем_навершие", 0.03, 0.015, 0.07, segments=6,
                                location=(0, 0, cz + head_r * 1.15))
        objs.append(knob)
        for side, sx in (("л", -1), ("п", 1)):
            cheek = C.make_box(f"Нащёчник_{side}", size=(0.03, 0.10, 0.16),
                                location=(sx * head_r * 0.95, -0.02, cz - head_r * 0.55))
            objs.append(cheek)
    elif kind == "montefortino":
        dome = C.make_ico("Шлем_купол", head_r * 1.07, subdiv=0, location=(0, 0, cz + 0.01))
        objs.append(dome)
        knob = C.make_cylinder("Шлем_шишак", 0.025, 0.02, 0.09, segments=6,
                                location=(0, 0, cz + head_r * 1.20))
        objs.append(knob)
        guard = C.make_cylinder("Шлем_назатыльник", 0.16, 0.16, 0.03, segments=10,
                                 location=(0, -head_r * 0.95, cz - head_r * 0.35),
                                 rotation=(math.radians(70), 0, 0))
        objs.append(guard)
        for side, sx in (("л", -1), ("п", 1)):
            cheek = C.make_box(f"Нащёчник_{side}", size=(0.03, 0.12, 0.18),
                                location=(sx * head_r * 0.95, -0.02, cz - head_r * 0.6))
            objs.append(cheek)
    elif kind == "pileus":
        cap = C.make_cylinder("Шлем_пилос", head_r * 1.05, 0.02, 0.26, segments=8,
                               location=(0, 0, cz + head_r * 0.55))
        objs.append(cap)
    return objs


# ───────────────────────── щиты ─────────────────────────

def build_shield(kind, hand_pos, nation_mat, bronze_mat):
    objs = []
    if kind == "none":
        return objs
    if kind == "hoplon":
        disc = C.make_cylinder("Щит_гоплон", 0.34, 0.34, 0.05, segments=14,
                                location=hand_pos, rotation=(math.radians(90), 0, math.radians(10)))
        C.assign_material(disc, nation_mat)
        boss = C.make_cylinder("Щит_умбон", 0.065, 0.05, 0.08, segments=8,
                                location=hand_pos + Vector((0, -0.05, 0)),
                                rotation=(math.radians(90), 0, math.radians(10)))
        C.assign_material(boss, bronze_mat)
        objs += [disc, boss]
    elif kind == "scutum":
        body = C.make_box("Щит_скутум", size=(0.46, 0.06, 0.78), location=hand_pos,
                           rotation=(0, 0, math.radians(6)))
        C.assign_material(body, nation_mat)
        rim = C.make_box("Щит_умбон_скутум", size=(0.10, 0.09, 0.10), location=hand_pos,
                          rotation=(0, 0, math.radians(6)))
        C.assign_material(rim, bronze_mat)
        objs += [body, rim]
    elif kind == "pelta":
        disc = C.make_ico("Щит_пельта", 0.30, subdiv=0, location=hand_pos,
                           scale=(1.0, 0.55, 0.16))
        C.assign_material(disc, nation_mat)
        objs.append(disc)
    return objs


# ───────────────────────── оружие ─────────────────────────

def build_weapon(kind, hand_pos, bronze_mat):
    objs = []
    lengths = {"spear": 1.15, "sarissa": 1.75, "pilum": 0.95, "sword": 0.55}
    length = lengths.get(kind, 1.0)
    if kind == "sword":
        blade = C.make_box("Меч_клинок", size=(0.045, 0.02, length),
                            location=hand_pos + Vector((0, 0, length * 0.4)))
        guard = C.make_box("Меч_гарда", size=(0.12, 0.03, 0.03),
                            location=hand_pos + Vector((0, 0, length * 0.05)))
        objs += [blade, guard]
    else:
        shaft = C.make_cylinder("Древко", 0.022, 0.018, length, segments=6,
                                 location=hand_pos + Vector((0, 0, length * 0.5)),
                                 rotation=(math.radians(4), 0, 0))
        tip_len = 0.16 if kind != "pilum" else 0.22
        tip = C.make_cylinder("Наконечник", 0.05, 0.0, tip_len, segments=6,
                               location=hand_pos + Vector((0, 0, length + tip_len * 0.5)),
                               rotation=(math.radians(4), 0, 0))
        objs += [shaft, tip]
    for o in objs:
        C.assign_material(o, bronze_mat)
    return objs


# ───────────────────────── плащ ─────────────────────────

def build_cloak(shoulder_back, ground_z, nation_mat):
    h = max(shoulder_back.z - ground_z - 0.35, 0.3)
    # плоскость создаётся плашмя (нормаль +Z), поворот на 90°+наклон ставит её
    # вертикально за спиной, свисающей вниз (локальный Y после поворота -> глобальный Z)
    plane = C.make_plane("Плащ", size=(0.40, h),
                          location=shoulder_back + Vector((0, -0.16, -h / 2.0 + 0.05)),
                          rotation=(math.radians(96), 0, 0), segments=4)
    C.bend_plane_z(plane, curvature=-0.6)
    C.assign_material(plane, nation_mat)
    return [plane]


# ───────────────────────── конь (нумидийская конница) ─────────────────────────

def build_horse(bronze_mat):
    objs = []
    # Шея/голова/хвост строятся цепочкой направленных сегментов от торца корпуса,
    # чтобы стыки совпадали математически точно (а не подбирались на глаз —
    # именно рассогласование координат стало причиной «оторванной головы» на QA-рендере).
    def seg_dir(angle_deg):
        a = math.radians(angle_deg)
        return mathutils.Vector((0.0, -math.sin(a), math.cos(a)))

    def add_segment(name, start, angle_deg, length, r1, r2, segments=6):
        d = seg_dir(angle_deg)
        center = start + d * (length / 2.0)
        tip = start + d * length
        obj = C.make_cylinder(name, r1, r2, length, segments=segments,
                               location=center, rotation=(math.radians(angle_deg), 0, 0))
        return obj, tip

    body_len, body_r1, body_r2 = 1.05, 0.30, 0.24
    body_angle = -90.0  # горизонтально, торец «depth/2» смотрит вперёд (+Y)
    body_start = Vector((0, 0.05, 1.05)) - seg_dir(body_angle) * (body_len / 2.0)
    body, body_front = add_segment("Конь_корпус", body_start, body_angle, body_len,
                                    body_r1, body_r2, segments=8)
    body_rear = body_start
    objs.append(body)

    neck, neck_tip = add_segment("Конь_шея", body_front, -55.0, 0.50, 0.15, 0.115, segments=6)
    objs.append(neck)

    head, head_tip = add_segment("Конь_голова", neck_tip, -30.0, 0.42, 0.115, 0.035, segments=6)
    objs.append(head)

    head_mid = neck_tip + seg_dir(-30.0) * 0.12
    for side, sx in (("л", -1), ("п", 1)):
        ear = C.make_cylinder(f"Конь_ухо_{side}", 0.028, 0.0, 0.10, segments=4,
                               location=head_mid + Vector((sx * 0.045, 0.02, 0.09)),
                               rotation=(math.radians(-30 - sx * 6), 0, math.radians(sx * 10)))
        objs.append(ear)

    tail, _ = add_segment("Конь_хвост", body_rear, 145.0, 0.55, 0.06, 0.01, segments=5)
    objs.append(tail)

    for name, dx, dy in (("перед_л", -0.16, 0.35), ("перед_п", 0.16, 0.35),
                          ("зад_л", -0.16, -0.30), ("зад_п", 0.16, -0.30)):
        leg = C.make_cylinder(f"Конь_нога_{name}", 0.065, 0.045, 1.02, segments=6,
                               location=(dx, dy, 0.51))
        objs.append(leg)

    for o in objs:
        C.assign_material(o, bronze_mat)
    return objs


# ───────────────────────── основная сборка ─────────────────────────

def main():
    args = C.parse_argv(DEFAULTS)
    preset = TYPE_PRESETS.get(args["type"], TYPE_PRESETS["hoplite"])

    culture = args["culture"] or preset["culture"]
    helmet_kind = args["helmet"] or preset["helmet"]
    shield_kind = args["shield"] or preset["shield"]
    weapon_kind = args["weapon"] or preset["weapon"]
    cloak_on = preset["cloak"] if args["cloak"] == -1 else bool(int(args["cloak"]))
    color_hex = args["color"] or preset["color"]
    mounted = preset["mounted"]
    out_dir = args["out"]
    os.makedirs(out_dir, exist_ok=True)

    print(f"=== gen_figure: type={args['type']} culture={culture} helmet={helmet_kind} "
          f"shield={shield_kind} weapon={weapon_kind} cloak={cloak_on} color=#{color_hex} "
          f"mounted={mounted} ===")

    t_build0 = __import__('time').time()
    C.reset_scene()

    bronze_mat = C.mat_bronze_patina(seed=args["seed"])
    nation_mat = C.mat_nation_color("Цвет_нации", hex_to_rgb(color_hex))

    all_objs = []
    body_objs, anchors = build_body(mounted=mounted)
    all_objs += body_objs

    all_objs += build_helmet(helmet_kind, anchors["head_center"], 0.145)
    all_objs += build_shield(shield_kind, anchors["shield_hand"], nation_mat, bronze_mat)
    all_objs += build_weapon(weapon_kind, anchors["weapon_hand"], bronze_mat)
    if cloak_on:
        all_objs += build_cloak(anchors["shoulder_back"], anchors["ground"], nation_mat)

    for o in body_objs:
        if o.data.materials:
            continue
        C.assign_material(o, bronze_mat)

    rider = C.join_all(all_objs, "Фигура_" + args["type"])
    C.recalc_normals(rider)
    rider_tris = C.enforce_triangle_budget(rider, args["budget"], tag="фигура (без коня)")

    final_objs = [rider]
    if mounted:
        horse_objs = build_horse(bronze_mat)
        horse = C.join_all(horse_objs, "Конь")
        C.recalc_normals(horse)
        C.enforce_triangle_budget(horse, args["budget"], tag="конь")
        final_objs.append(horse)

    combined = C.join_all(final_objs, "Модель_" + args["type"]) if len(final_objs) > 1 else final_objs[0]
    total_tris = C.count_tris(combined)
    print(f"[итог] {args['type']}: {total_tris} треугольников (бюджет фигуры {args['budget']}"
          f"{' + конь отдельным бюджетом' if mounted else ''})")

    backdrop = C.build_marble_backdrop(size=5.0)
    C.add_key_fill_lights()
    views = C.three_views(combined)

    build_time = __import__('time').time() - t_build0

    scene = C.setup_render(engine=args["engine"], samples=args["samples"], res=args["res"])

    timings = {"type": args["type"], "build_sec": round(build_time, 3), "tris": total_tris,
               "renders": {}}

    for view_name, cam in views.items():
        fp = os.path.join(out_dir, f"figure_{args['type']}_{view_name}.png")
        dt = C.render_view(cam, fp)
        timings["renders"][view_name] = round(dt, 3)
        print(f"[render] {view_name}: {dt:.2f} c -> {fp}")

    glb_path = os.path.join(out_dir, f"figure_{args['type']}.glb")
    dt_export = C.export_glb(combined, glb_path)
    timings["export_glb_sec"] = round(dt_export, 3)
    timings["glb_size_bytes"] = os.path.getsize(glb_path)
    print(f"[export] glb: {dt_export:.2f} c, {timings['glb_size_bytes']} байт -> {glb_path}")

    C.log_json(os.path.join(out_dir, "timings_figures.json"), timings)
    print("=== DONE:", args["type"], "===")


main()
