# -*- coding: utf-8 -*-
"""
gen_building.py — процедурные низкополигональные постройки Ancient Strategy.

Запуск:
    blender -b -P gen_building.py -- --type temple --columns 4 --out /opt/asg-art/out
    blender -b -P gen_building.py -- --type wall --level 2 --out /opt/asg-art/out
    blender -b -P gen_building.py -- --type lighthouse --out /opt/asg-art/out

Геометрия и материалы — процедурные (bpy/bmesh + шейдерные ноды камня/дерева),
без внешних текстур/моделей (правило Р97).

Параметры:
    --type      temple | wall | lighthouse
    --columns   число колонн по фасаду (только temple, по умолчанию 4)
    --level     уровень укрепления 1..3 (только wall)
    --color     hex без '#' — акцентный цвет (флаг/щиты на стене, пламя маяка не красится)
    --engine, --samples, --res, --budget(1500), --seed, --out
"""
import bpy
import bmesh
import math
import mathutils
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

Vector = mathutils.Vector

DEFAULTS = dict(type="temple", columns=4, level=2, color="a3262b", engine="CYCLES",
                 samples=64, res=512, budget=1500, seed=1, out="/opt/asg-art/out")


def hex_to_rgb(h):
    h = h.lstrip('#')
    r, g, b = int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0
    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (to_lin(r), to_lin(g), to_lin(b))


# ───────────────────────── храм-периптер ─────────────────────────

def make_pediment(name, width, height, thickness, location):
    """Треугольная призма (фронтон) — честная геометрия вместо хака с N-угольным конусом,
    который на первой версии рендерил гигантский плоский диск вместо маленького клина."""
    bm = bmesh.new()
    hw, ht = width / 2.0, thickness / 2.0
    v0 = bm.verts.new((-hw, -ht, 0))
    v1 = bm.verts.new((hw, -ht, 0))
    v2 = bm.verts.new((0, -ht, height))
    v3 = bm.verts.new((-hw, ht, 0))
    v4 = bm.verts.new((hw, ht, 0))
    v5 = bm.verts.new((0, ht, height))
    bm.faces.new((v0, v1, v2))
    bm.faces.new((v5, v4, v3))
    bm.faces.new((v0, v3, v5, v2))
    bm.faces.new((v1, v4, v5, v2))
    bm.faces.new((v0, v1, v4, v3))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def perimeter_points(half_x, half_y, n_front, n_side):
    """Точки колонн по периметру прямоугольника без дублей по углам."""
    pts = []
    for i in range(n_front):
        x = -half_x + (2 * half_x) * i / (n_front - 1)
        pts.append((x, -half_y))
        pts.append((x, half_y))
    for j in range(1, n_side - 1):
        y = -half_y + (2 * half_y) * j / (n_side - 1)
        pts.append((-half_x, y))
        pts.append((half_x, y))
    return pts


def build_temple(columns_front, stone_mat, roof_mat):
    objs = []
    columns_front = max(4, columns_front)
    columns_side = columns_front + 2  # классическая пропорция периптера (короче — длиннее)

    base_w, base_d, base_h = 2.6, 4.2, 0.16
    stylobate = C.make_box("Стилобат", size=(base_w, base_d, base_h), location=(0, 0, base_h / 2.0))
    objs.append(stylobate)

    col_h = 0.85
    col_r = 0.055
    half_x, half_y = base_w / 2.0 - 0.18, base_d / 2.0 - 0.18
    pts = perimeter_points(half_x, half_y, columns_front, columns_side)
    for i, (x, y) in enumerate(pts):
        shaft = C.make_cylinder(f"Колонна_{i}", col_r, col_r * 0.85, col_h, segments=6,
                                 location=(x, y, base_h + col_h / 2.0))
        objs.append(shaft)
        capital = C.make_box(f"Капитель_{i}", size=(col_r * 3.0, col_r * 3.0, 0.05),
                              location=(x, y, base_h + col_h + 0.025))
        objs.append(capital)

    entab_h = 0.14
    entablature = C.make_box("Антаблемент", size=(base_w + 0.06, base_d + 0.06, entab_h),
                              location=(0, 0, base_h + col_h + 0.05 + entab_h / 2.0))
    objs.append(entablature)

    roof_z0 = base_h + col_h + 0.05 + entab_h
    ridge_h = 0.55
    for sx in (-1, 1):
        # скат крыши — наклонная плоскость (клин) на каждую сторону конька
        slope = C.make_box(f"Крыша_скат_{sx}", size=(base_w / 2.0 + 0.35, base_d + 0.30, 0.05),
                            location=(sx * (base_w / 4.0 + 0.05), 0, roof_z0 + ridge_h / 2.0))
        slope.rotation_euler = (0, math.radians(-sx * 28), 0)
        objs.append(slope)
    # фронтон (треугольный) с двух торцов — вставка-клин, чтобы не было сквозной щели под крышей
    for sy in (-1, 1):
        pediment = make_pediment(f"Фронтон_{sy}", base_w + 0.10, ridge_h * 0.85, 0.04,
                                  location=(0, sy * (base_d / 2.0 + 0.02), roof_z0))
        objs.append(pediment)

    for o in objs:
        if "Крыша" in o.name or "Фронтон" in o.name:
            C.assign_material(o, roof_mat)
        else:
            C.assign_material(o, stone_mat)
    return objs


# ───────────────────────── стена с башней ─────────────────────────

def build_wall_tower(level, stone_mat, nation_mat):
    objs = []
    level = min(3, max(1, level))
    wall_len, wall_h, wall_th = 3.2, 0.55 + 0.12 * level, 0.20

    wall = C.make_box("Стена", size=(wall_len, wall_th, wall_h), location=(0, 0, wall_h / 2.0))
    objs.append(wall)

    merlon_n = 9
    for i in range(merlon_n):
        x = -wall_len / 2.0 + wall_len * (i + 0.5) / merlon_n
        merlon = C.make_box(f"Зубец_{i}", size=(wall_len / merlon_n * 0.55, wall_th * 1.1, 0.14),
                             location=(x, 0, wall_h + 0.07))
        objs.append(merlon)

    tower_r = 0.42
    tower_h = wall_h + 0.35 * level
    tower_x = wall_len / 2.0 + tower_r * 0.7
    tower = C.make_cylinder("Башня", tower_r, tower_r * 0.92, tower_h, segments=10,
                             location=(tower_x, 0, tower_h / 2.0))
    objs.append(tower)

    for i in range(10):
        a = i / 10.0 * 2 * math.pi
        x = tower_x + math.cos(a) * tower_r * 0.98
        y = math.sin(a) * tower_r * 0.98
        merlon = C.make_box(f"Зубец_башни_{i}", size=(0.10, 0.10, 0.13),
                             location=(x, y, tower_h + 0.065))
        objs.append(merlon)

    roof = C.make_cylinder("Крыша_башни", tower_r * 1.05, 0.02, 0.30 + 0.06 * level, segments=10,
                            location=(tower_x, 0, tower_h + 0.15))
    objs.append(roof)

    if level >= 2:
        banner = C.make_plane("Флаг", size=(0.22, 0.16),
                               location=(tower_x, 0, tower_h + 0.30 + 0.06 * level + 0.10),
                               rotation=(math.radians(90), 0, 0))
        C.assign_material(banner, nation_mat)
        objs.append(banner)

    gate = C.make_box("Ворота", size=(0.55, wall_th * 1.05, 0.42),
                       location=(0, 0, 0.21))
    objs.append(gate)

    for o in objs:
        if o.name not in ("Флаг",):
            C.assign_material(o, stone_mat)
    return objs


# ───────────────────────── маяк (Форос) ─────────────────────────

def build_lighthouse(stone_mat, bronze_mat, flame_mat):
    objs = []
    tier1_h, tier1_r = 1.0, 0.55   # квадратное основание
    tier2_h, tier2_r = 0.70, 0.34  # восьмигранная середина
    tier3_h, tier3_r = 0.45, 0.18  # цилиндрический верх

    base = C.make_box("Маяк_основание", size=(tier1_r * 1.7, tier1_r * 1.7, tier1_h),
                       location=(0, 0, tier1_h / 2.0))
    objs.append(base)
    z1 = tier1_h

    mid = C.make_cylinder("Маяк_средний", tier2_r, tier2_r * 0.85, tier2_h, segments=8,
                           location=(0, 0, z1 + tier2_h / 2.0))
    objs.append(mid)
    z2 = z1 + tier2_h

    top = C.make_cylinder("Маяк_верх", tier3_r, tier3_r * 0.9, tier3_h, segments=10,
                           location=(0, 0, z2 + tier3_h / 2.0))
    objs.append(top)
    z3 = z2 + tier3_h

    lantern = C.make_cylinder("Маяк_фонарь", tier3_r * 0.75, tier3_r * 0.75, 0.22, segments=8,
                               location=(0, 0, z3 + 0.11))
    objs.append(lantern)
    z4 = z3 + 0.22

    roof = C.make_cylinder("Маяк_крыша", tier3_r * 0.85, 0.01, 0.20, segments=8,
                            location=(0, 0, z4 + 0.10))
    objs.append(roof)

    for i in range(4):
        a = i / 4.0 * 2 * math.pi
        col = C.make_cylinder(f"Маяк_колонна_{i}", 0.035, 0.03, 0.22,
                               segments=5,
                               location=(math.cos(a) * tier3_r * 0.7, math.sin(a) * tier3_r * 0.7,
                                          z3 + 0.11))
        objs.append(col)

    flame = C.make_ico("Маяк_пламя", 0.10, subdiv=0, location=(0, 0, z4 + 0.20), scale=(1, 1, 1.4))
    C.assign_material(flame, flame_mat)
    objs.append(flame)

    for o in objs:
        if o.name != "Маяк_пламя":
            C.assign_material(o, stone_mat if "колонна" not in o.name.lower() else bronze_mat)
    return objs


def mat_flame():
    mat = bpy.data.materials.new("Пламя")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emission = nt.nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1.0, 0.55, 0.12, 1.0)
    emission.inputs['Strength'].default_value = 3.5
    nt.links.new(emission.outputs['Emission'], out.inputs['Surface'])
    return mat


def main():
    args = C.parse_argv(DEFAULTS)
    out_dir = args["out"]
    os.makedirs(out_dir, exist_ok=True)
    btype = args["type"]
    print(f"=== gen_building: type={btype} columns={args['columns']} level={args['level']} ===")

    t0 = time.time()
    C.reset_scene()

    stone_mat = C.mat_stone(light=True)
    roof_mat = C.mat_stone(light=False)
    nation_mat = C.mat_nation_color("Флаг_цвет", hex_to_rgb(args["color"]))
    bronze_mat = C.mat_bronze_patina(seed=args["seed"])
    flame_mat = mat_flame()

    if btype == "temple":
        objs = build_temple(int(args["columns"]), stone_mat, roof_mat)
    elif btype == "wall":
        objs = build_wall_tower(int(args["level"]), stone_mat, nation_mat)
    else:
        objs = build_lighthouse(stone_mat, bronze_mat, flame_mat)

    model = C.join_all(objs, "Модель_" + btype)
    C.recalc_normals(model)
    tris = C.enforce_triangle_budget(model, args["budget"], tag=btype)
    total_tris = C.count_tris(model)
    print(f"[итог] {btype}: {total_tris} треугольников (бюджет {args['budget']})")

    C.build_marble_backdrop(size=7.0)
    C.add_key_fill_lights()
    views = C.three_views(model)
    build_time = time.time() - t0

    scene = C.setup_render(engine=args["engine"], samples=args["samples"], res=args["res"])
    timings = {"type": btype, "build_sec": round(build_time, 3), "tris": total_tris, "renders": {}}

    for view_name, cam in views.items():
        fp = os.path.join(out_dir, f"building_{btype}_{view_name}.png")
        dt = C.render_view(cam, fp)
        timings["renders"][view_name] = round(dt, 3)
        print(f"[render] {view_name}: {dt:.2f} c -> {fp}")

    glb_path = os.path.join(out_dir, f"building_{btype}.glb")
    dt_export = C.export_glb(model, glb_path)
    timings["export_glb_sec"] = round(dt_export, 3)
    timings["glb_size_bytes"] = os.path.getsize(glb_path)
    print(f"[export] glb: {dt_export:.2f} c, {timings['glb_size_bytes']} байт -> {glb_path}")

    C.log_json(os.path.join(out_dir, "timings_buildings.json"), timings)
    print("=== DONE:", btype, "===")


main()
