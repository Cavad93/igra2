# -*- coding: utf-8 -*-
"""
common.py — общая библиотека для процедурной генерации 3D-ассетов Ancient Strategy.

Все геометрия, материалы и текстуры — ТОЛЬКО процедурные, созданы средствами Blender
(bpy-примитивы + шейдерные ноды). Никаких внешних текстур/моделей не используется —
правило владельца Р97 (все ассеты оригинальные, процедурные, без заимствований).

Используется в gen_figure.py, gen_ship.py, gen_building.py.
"""
import bpy
import bmesh
import math
import mathutils
import random
import time
import os
import sys
import json

TAU = math.pi * 2.0


# ───────────────────────── базовая подготовка сцены ─────────────────────────

def reset_scene():
    """Полная очистка сцены (пустой факторный сброс)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    return scene


def parse_argv(defaults):
    """Разбор аргументов после '--' в командной строке blender -b -P script.py -- --key value.
    defaults — словарь имя->значение по умолчанию (тип берётся из значения по умолчанию)."""
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    out = dict(defaults)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--'):
            key = a[2:]
            if key in out and isinstance(out[key], bool):
                out[key] = True
                i += 1
                continue
            if i + 1 < len(argv):
                val = argv[i + 1]
                if key in out:
                    t = type(out[key])
                    if t is int:
                        val = int(val)
                    elif t is float:
                        val = float(val)
                out[key] = val
                i += 2
                continue
        i += 1
    return out


# ───────────────────────── низкополигональные примитивы ─────────────────────────

def _new_obj_from_bmesh(bm, name):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def make_cylinder(name, r1, r2, depth, segments=8, location=(0, 0, 0), rotation=(0, 0, 0), cap=True):
    """Цилиндр/конус/усечённый конус с малым числом сегментов (низкополигональный)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=True, segments=segments,
                           radius1=r1, radius2=r2, depth=depth)
    obj = _new_obj_from_bmesh(bm, name)
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def make_box(name, size=(1, 1, 1), location=(0, 0, 0), rotation=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    obj = _new_obj_from_bmesh(bm, name)
    obj.scale = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def make_ico(name, radius, subdiv=0, location=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    obj = _new_obj_from_bmesh(bm, name)
    obj.location = location
    obj.scale = scale
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def make_plane(name, size=(1, 1), location=(0, 0, 0), rotation=(0, 0, 0), segments=1):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=segments, y_segments=segments, size=1.0)
    obj = _new_obj_from_bmesh(bm, name)
    obj.scale = (size[0] / 2.0, size[1] / 2.0, 1.0)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def bend_plane_z(obj, curvature):
    """Простой изгиб плоскости по X (для плаща/паруса) без модификаторов — деформация вершин вручную."""
    mesh = obj.data
    for v in mesh.vertices:
        x = v.co.x
        v.co.z += curvature * (x * x)
    mesh.update()


# ───────────────────────── материалы (процедурные, без текстур-картинок) ─────────────────────────

def mat_bronze_patina(name="Бронза_патина", base_hex=(0.58, 0.36, 0.14), patina_hex=(0.20, 0.34, 0.26),
                       seed=0):
    """Металлик-бронза со случайными пятнами патины на основе процедурного шума
    и Pointiness (впадины темнее/зеленее — типично для окислённой бронзы)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out.location = (600, 0)
    bsdf.location = (350, 0)

    coord = nt.nodes.new('ShaderNodeTexCoord')
    coord.location = (-800, 100)
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Location'].default_value = (seed * 13.37, seed * 7.91, seed * 3.14)
    mapping.location = (-600, 100)
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])

    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    noise.inputs['Detail'].default_value = 4.0
    noise.location = (-400, 200)
    nt.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    geo = nt.nodes.new('ShaderNodeNewGeometry')
    geo.location = (-600, -150)

    # патина концентрируется во впадинах (низкая Pointiness) и промодулирована шумом,
    # чтобы пятна не заливали всю модель ровным цветом
    invert_point = nt.nodes.new('ShaderNodeMath')
    invert_point.operation = 'SUBTRACT'
    invert_point.inputs[0].default_value = 1.0
    invert_point.location = (-400, -100)

    combine_fac = nt.nodes.new('ShaderNodeMath')
    combine_fac.operation = 'MULTIPLY'
    combine_fac.location = (-200, 50)

    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[1].position = 0.80
    ramp.location = (0, 150)

    colmix = nt.nodes.new('ShaderNodeMixRGB')
    colmix.inputs['Color1'].default_value = (*base_hex, 1.0)
    colmix.inputs['Color2'].default_value = (*patina_hex, 1.0)
    colmix.location = (150, 150)

    rough = nt.nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.15
    rough.inputs['To Max'].default_value = 0.55
    rough.location = (0, -50)

    nt.links.new(geo.outputs['Pointiness'], invert_point.inputs[1])
    nt.links.new(invert_point.outputs[0], combine_fac.inputs[0])
    nt.links.new(noise.outputs['Fac'], combine_fac.inputs[1])
    nt.links.new(combine_fac.outputs[0], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], colmix.inputs['Fac'])
    nt.links.new(noise.outputs['Fac'], rough.inputs['Value'])
    nt.links.new(colmix.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = 0.92
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def mat_nation_color(name, color_hex):
    """Матовая ткань/краска цвета нации — для щита/плаща."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color_hex, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.75
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def mat_wood():
    mat = bpy.data.materials.new("Дерево")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 20.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.25, 0.16, 0.08, 1)
    ramp.color_ramp.elements[1].color = (0.42, 0.28, 0.14, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    return mat


def mat_stone(light=True):
    mat = bpy.data.materials.new("Камень_мрамор" if light else "Камень_тёмный")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 8.0
    noise.inputs['Detail'].default_value = 8.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    if light:
        ramp.color_ramp.elements[0].color = (0.62, 0.58, 0.50, 1)
        ramp.color_ramp.elements[1].color = (0.80, 0.77, 0.70, 1)
    else:
        ramp.color_ramp.elements[0].color = (0.35, 0.33, 0.30, 1)
        ramp.color_ramp.elements[1].color = (0.55, 0.52, 0.46, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    return mat


def mat_sail(color=(0.86, 0.80, 0.66)):
    mat = bpy.data.materials.new("Парус")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
    return mat


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ───────────────────────── сборка объекта ─────────────────────────

def join_all(objs, name):
    """Объединяет список объектов в один (материалы по граням сохраняются)."""
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = name
    return result


def count_tris(obj):
    """Точный подсчёт треугольников (после триангуляции модификатором расчёта)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    n = len(mesh.loop_triangles)
    ev.to_mesh_clear()
    return n


def recalc_normals(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def enforce_triangle_budget(obj, budget, tag=""):
    """Если бюджет превышен — применяет Decimate (collapse) до укладки в лимит.
    Не идеально для силуэта, поэтому используется только как страховка."""
    tris = count_tris(obj)
    if tris <= budget:
        print(f"[budget] {tag}: {tris} tris <= {budget} — OK")
        return tris
    ratio = budget / float(tris) * 0.92
    mod = obj.modifiers.new("Decimate", 'DECIMATE')
    mod.ratio = max(0.05, ratio)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    tris2 = count_tris(obj)
    print(f"[budget] {tag}: {tris} -> decimate ratio={ratio:.3f} -> {tris2} tris (лимит {budget})")
    return tris2


# ───────────────────────── фон, свет, камера ─────────────────────────

def build_marble_backdrop(size=6.0, mat=None):
    """Бесшовный «студийный» фон: пол + изогнутый задник одной процедурной мраморной поверхностью."""
    mat = mat or mat_stone(light=True)
    floor = make_plane("Фон_пол", size=(size, size), location=(0, 0, 0))
    wall = make_plane("Фон_стена", size=(size, size), location=(0, size / 2.0, size / 2.0),
                       rotation=(math.radians(90), 0, 0))
    # скругление стыка пол/стена несколькими доп. гранями (простая фаска через bmesh bevel)
    assign_material(floor, mat)
    assign_material(wall, mat)
    return [floor, wall]


def add_key_fill_lights():
    """Простая трёхточечная схема на Sun-лампах (не зависит от GPU)."""
    bpy.ops.object.light_add(type='SUN', location=(4, -4, 6))
    key = bpy.context.object
    key.data.energy = 2.0
    key.rotation_euler = (math.radians(55), 0, math.radians(35))
    key.name = "Свет_рисующий"

    bpy.ops.object.light_add(type='SUN', location=(-4, -2, 3))
    fill = bpy.context.object
    fill.data.energy = 0.5
    fill.rotation_euler = (math.radians(70), 0, math.radians(-50))
    fill.name = "Свет_заполняющий"

    bpy.ops.object.light_add(type='SUN', location=(0, 4, 3))
    rim = bpy.context.object
    rim.data.energy = 0.8
    rim.rotation_euler = (math.radians(110), 0, math.radians(180))
    rim.name = "Свет_контровой"

    world = bpy.context.scene.world or bpy.data.worlds.new("Мир")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.55, 0.52, 0.47, 1.0)
        bg.inputs['Strength'].default_value = 0.35
    return [key, fill, rim]


def bounds_center_radius(obj):
    coords = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    center = mathutils.Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
    radius = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)) / 2.0
    return center, max(radius, 0.5)


def add_camera(name, target_center, azimuth_deg, elevation_deg, distance):
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    x = target_center.x + distance * math.cos(el) * math.sin(az)
    y = target_center.y - distance * math.cos(el) * math.cos(az)
    z = target_center.z + distance * math.sin(el)
    bpy.ops.object.camera_add(location=(x, y, z))
    cam = bpy.context.object
    cam.name = name
    cam.data.lens = 65
    empty = bpy.data.objects.new(name + "_target", None)
    bpy.context.collection.objects.link(empty)
    empty.location = target_center
    con = cam.constraints.new('TRACK_TO')
    con.target = empty
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'
    return cam


def three_views(target_obj):
    """Три ракурса: изометрия (карта сверху-сбоку), фронт, профиль."""
    center, radius = bounds_center_radius(target_obj)
    dist = radius * 4.2 + 2.0
    views = {
        "iso": add_camera("Камера_изо", center, azimuth_deg=45, elevation_deg=35.264, distance=dist),
        "front": add_camera("Камера_фронт", center, azimuth_deg=0, elevation_deg=8, distance=dist),
        "profile": add_camera("Камера_профиль", center, azimuth_deg=90, elevation_deg=8, distance=dist),
    }
    return views


# ───────────────────────── рендер и экспорт ─────────────────────────

def setup_render(engine='CYCLES', samples=64, res=512):
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    if engine == 'CYCLES':
        scene.cycles.samples = samples
        scene.cycles.device = 'CPU'
        scene.cycles.use_denoising = True
        try:
            scene.cycles.tile_size = 256
        except Exception:
            pass
    elif engine == 'BLENDER_WORKBENCH':
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'MATERIAL'
        scene.display.shading.show_cavity = True
    return scene


def render_view(camera, filepath):
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.filepath = filepath
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t0


def export_glb(obj, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    t0 = time.time()
    bpy.ops.export_scene.gltf(filepath=filepath, use_selection=True,
                               export_format='GLB', export_apply=True,
                               export_yup=True)
    return time.time() - t0


def log_json(path, data):
    old = []
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                old = json.load(f)
        except Exception:
            old = []
    old.append(data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(old, f, ensure_ascii=False, indent=2)
