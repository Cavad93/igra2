# -*- coding: utf-8 -*-
"""
gen_ship.py — процедурные низкополигональные корабли Ancient Strategy.

Запуск:
    blender -b -P gen_ship.py -- --type trireme --sail raised --out /opt/asg-art/out
    blender -b -P gen_ship.py -- --type merchant --sail raised --out /opt/asg-art/out

Геометрия и материалы — процедурные (bpy/bmesh + шейдерные ноды), без внешних
текстур/моделей (правило Р97).

Параметры:
    --type   trireme | merchant
    --sail   raised | furled
    --color  hex без '#' — цвет паруса/окантовки (нация)
    --engine, --samples, --res, --budget(1200), --seed, --out
"""
import bpy
import math
import mathutils
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

Vector = mathutils.Vector

DEFAULTS = dict(type="trireme", sail="raised", color="c9a961", engine="CYCLES",
                 samples=64, res=512, budget=1200, seed=1, out="/opt/asg-art/out")


def hex_to_rgb(h):
    h = h.lstrip('#')
    r, g, b = int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0
    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (to_lin(r), to_lin(g), to_lin(b))


def build_hull(length, beam, draft, segments, wood_mat, tapered_bow=True):
    """Корпус — сплюснутый по вертикали конус/цилиндр с заострённым носом."""
    r1 = beam / 2.0   # корма — шире
    r2 = 0.02 if tapered_bow else beam / 2.0 * 0.7   # нос — заострён (трирема) или скруглён (торговое)
    hull = C.make_cylinder("Корпус", r1, r2, length, segments=segments,
                            location=(0, 0, draft), rotation=(math.radians(-90), 0, 0))
    # локальная Y (окружность сечения) после поворота -90° по X становится мировой Z (осадка) —
    # именно её нужно сплющивать; локальная Z (длина) уходит в мировую Y и её трогать нельзя
    hull.scale = (1.0, draft / (beam / 2.0), 1.0)
    bpy.context.view_layer.objects.active = hull
    hull.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    C.assign_material(hull, wood_mat)
    bow_tip = Vector((0, length / 2.0, draft))
    stern = Vector((0, -length / 2.0, draft))
    return hull, bow_tip, stern


def build_mast_and_sail(deck_pos, mast_h, sail_mode, sail_mat, wood_mat, width=1.0):
    objs = []
    mast = C.make_cylinder("Мачта", 0.035, 0.025, mast_h, segments=6,
                            location=deck_pos + Vector((0, 0, mast_h / 2.0)))
    C.assign_material(mast, wood_mat)
    objs.append(mast)
    yard_z = deck_pos.z + mast_h * 0.82
    yard = C.make_cylinder("Рей", 0.025, 0.02, width, segments=6,
                            location=deck_pos + Vector((0, 0, yard_z - deck_pos.z)),
                            rotation=(0, math.radians(90), 0))
    C.assign_material(yard, wood_mat)
    objs.append(yard)
    if sail_mode == "raised":
        sail = C.make_plane("Парус", size=(width * 0.92, mast_h * 0.55),
                             location=deck_pos + Vector((0, 0.04, yard_z - deck_pos.z - mast_h * 0.30)),
                             rotation=(math.radians(90), 0, 0), segments=3)
        C.bend_plane_z(sail, curvature=0.25)
        C.assign_material(sail, sail_mat)
        objs.append(sail)
    else:  # furled — скатанный парус вдоль рея
        furled = C.make_cylinder("Парус_скатан", 0.045, 0.045, width * 0.92, segments=6,
                                  location=deck_pos + Vector((0, 0, yard_z - deck_pos.z - 0.05)),
                                  rotation=(0, math.radians(90), 0))
        C.assign_material(furled, sail_mat)
        objs.append(furled)
    return objs


def build_oar_banks(length, beam, draft, rows, bronze_mat):
    """Упрощённое обозначение рядов вёсел — плоские рёбра вдоль бортов, а не отдельные вёсла
    (иначе полигональный бюджет триремы улетает в тысячи треугольников)."""
    objs = []
    row_h = draft * 0.9 / rows
    for side, sx in (("л", -1), ("п", 1)):
        for i in range(rows):
            z = draft * 0.15 + row_h * i
            oar_row = C.make_box(f"Вёсла_{side}_{i}", size=(0.06, length * 0.62, row_h * 0.5),
                                  location=(sx * (beam / 2.0 + 0.05), 0, z),
                                  rotation=(0, 0, math.radians(sx * -8)))
            C.assign_material(oar_row, bronze_mat)
            objs.append(oar_row)
    return objs


def build_ram(bow_tip, bronze_mat):
    ram = C.make_cylinder("Таран", 0.09, 0.015, 0.42, segments=6,
                           location=bow_tip + Vector((0, 0.21, -0.02)),
                           rotation=(math.radians(-88), 0, 0))
    C.assign_material(ram, bronze_mat)
    return [ram]


def build_steering_oar(stern, wood_mat):
    oar = C.make_cylinder("Рулевое_весло", 0.03, 0.02, 0.9, segments=6,
                           location=stern + Vector((0.22, -0.15, 0.15)),
                           rotation=(math.radians(35), math.radians(20), 0))
    C.assign_material(oar, wood_mat)
    return [oar]


def main():
    args = C.parse_argv(DEFAULTS)
    out_dir = args["out"]
    os.makedirs(out_dir, exist_ok=True)
    ship_type = args["type"]
    print(f"=== gen_ship: type={ship_type} sail={args['sail']} color=#{args['color']} ===")

    import time
    t0 = time.time()
    C.reset_scene()

    wood_mat = C.mat_wood()
    bronze_mat = C.mat_bronze_patina(seed=args["seed"])
    sail_mat = C.mat_nation_color("Парус_цвет", hex_to_rgb(args["color"]))

    all_objs = []
    if ship_type == "trireme":
        length, beam, draft = 3.4, 0.62, 0.19
        hull, bow_tip, stern = build_hull(length, beam, draft, segments=12, wood_mat=wood_mat,
                                            tapered_bow=True)
        all_objs.append(hull)
        all_objs += build_ram(bow_tip, bronze_mat)
        all_objs += build_oar_banks(length, beam, draft, rows=3, bronze_mat=bronze_mat)
        deck_pos = Vector((0, -0.15, draft * 1.35))
        all_objs += build_mast_and_sail(deck_pos, mast_h=1.55, sail_mode=args["sail"],
                                          sail_mat=sail_mat, wood_mat=wood_mat, width=0.85)
        deckhouse = C.make_box("Помост_кормовой", size=(0.32, 0.55, 0.10),
                                location=stern + Vector((0, 0.35, draft * 1.05)))
        C.assign_material(deckhouse, wood_mat)
        all_objs.append(deckhouse)
        all_objs += build_steering_oar(stern, wood_mat)
    else:  # merchant
        length, beam, draft = 2.6, 1.05, 0.34
        hull, bow_tip, stern = build_hull(length, beam, draft, segments=12, wood_mat=wood_mat,
                                            tapered_bow=False)
        all_objs.append(hull)
        deck_pos = Vector((0, 0.0, draft * 1.30))
        all_objs += build_mast_and_sail(deck_pos, mast_h=2.0, sail_mode=args["sail"],
                                          sail_mat=sail_mat, wood_mat=wood_mat, width=1.35)
        all_objs += build_steering_oar(stern, wood_mat)
        rail = C.make_cylinder("Планширь", beam / 2.0 + 0.02, 0.10, draft * 0.25, segments=12,
                                location=(0, 0, draft * 1.12))
        C.assign_material(rail, wood_mat)
        all_objs.append(rail)

    model = C.join_all(all_objs, "Модель_" + ship_type)
    C.recalc_normals(model)
    tris = C.enforce_triangle_budget(model, args["budget"], tag=ship_type)
    total_tris = C.count_tris(model)
    print(f"[итог] {ship_type}: {total_tris} треугольников (бюджет {args['budget']})")

    C.build_marble_backdrop(size=6.5)
    C.add_key_fill_lights()
    views = C.three_views(model)
    build_time = time.time() - t0

    scene = C.setup_render(engine=args["engine"], samples=args["samples"], res=args["res"])
    timings = {"type": ship_type, "build_sec": round(build_time, 3), "tris": total_tris, "renders": {}}

    for view_name, cam in views.items():
        fp = os.path.join(out_dir, f"ship_{ship_type}_{view_name}.png")
        dt = C.render_view(cam, fp)
        timings["renders"][view_name] = round(dt, 3)
        print(f"[render] {view_name}: {dt:.2f} c -> {fp}")

    glb_path = os.path.join(out_dir, f"ship_{ship_type}.glb")
    dt_export = C.export_glb(model, glb_path)
    timings["export_glb_sec"] = round(dt_export, 3)
    timings["glb_size_bytes"] = os.path.getsize(glb_path)
    print(f"[export] glb: {dt_export:.2f} c, {timings['glb_size_bytes']} байт -> {glb_path}")

    C.log_json(os.path.join(out_dir, "timings_ships.json"), timings)
    print("=== DONE:", ship_type, "===")


main()
