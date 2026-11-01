"""Build a dark car studio around an imported model and render turntable frames.

blender -b --factory-startup -P studio.py -- <model.fbx> <hdr> <out_dir> <first> <last> <total> <samples> <width> <height>
Frame k of `total` puts the camera at angle k/total × 360° around the car.
"""
import bpy, math, sys, os
from mathutils import Vector

model, hdr, out_dir, first, last, total, samples, W, H = sys.argv[sys.argv.index("--") + 1:]
first, last, total, samples, W, H = map(int, (first, last, total, samples, W, H))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ── Car: import, size to 4.6 m long, centre on the origin, wheels on the floor ──
if model.lower().endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=model)
else:
    bpy.ops.import_scene.fbx(filepath=model)
EXPLODE = os.environ.get("STUDIO_EXPLODE") == "1"
STORY = os.environ.get("STUDIO_STORY") == "1"
if EXPLODE or STORY:
    # Tyres, rims and brakes come as one object each holding all four wheels: split them apart.
    for name in ("Object_8", "Object_6", "Object_18"):
        o = bpy.data.objects.get(name)
        if not o: continue
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
meshes = [o for o in scene.objects if o.type == "MESH"]
# Models often ship a flat "ground shadow" sheet; hide it and keep it out of the measurements.
def extent(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(3)]
flat = []
for o in meshes:
    ex = extent(o)
    if sorted(ex)[0] < 0.002 * max(ex) + 1e-6 and max(ex) > 0.8 or "ground" in o.name.lower() or "shadow" in o.name.lower():
        flat.append(o)
for o in meshes:
    if "emblem" in o.name.lower():
        flat.append(o)
for o in flat:
    o.hide_render = True
    print("HIDDEN", o.name)
meshes = [o for o in meshes if o not in flat]
car = bpy.data.objects.new("Car", None)
scene.collection.objects.link(car)
for o in scene.objects:
    if o.parent is None and o is not car:
        o.parent = car
bpy.context.view_layer.update()
def bounds():
    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn, mx = Vector(map(min, mn, w)), Vector(map(max, mx, w))
    return mn, mx
mn, mx = bounds()
size = mx - mn
car.scale = (4.6 / max(size.x, size.y),) * 3
bpy.context.view_layer.update()
mn, mx = bounds()
centre = (mn + mx) / 2
# Stand on the tyres (some models carry stray parts below the wheels).
tyres = [o for o in meshes if any(k in o.name.lower() for k in ("tyre", "tire", "wheel", "gomma"))]
# glTF models may name wheels by material only; fall back to the lowest 5% of the car.
ground = min((o.matrix_world @ Vector(c)).z for o in tyres for c in o.bound_box) if tyres else mn.z
car.location -= Vector((centre.x, centre.y, ground))
bpy.context.view_layer.update()
mn, mx = bounds()
height = mx.z
print("GROUND_OFFSET", round(mn.z, 3), "HEIGHT", round(height, 3))

# ── Materials: keep the model's textures, upgrade the key surfaces for a studio look ──
def principled(mat):
    mat.use_nodes = True
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None
def setin(n, name, v):
    if n and name in n.inputs:
        n.inputs[name].default_value = v
KEEP = os.environ.get("STUDIO_KEEP") == "1"  # keep the model's own materials (e.g. a livery)
for mat in bpy.data.materials:
    name = mat.name.lower()
    b = principled(mat)
    if b is None:
        continue
    if KEEP:
        # Only make windows real glass; everything else stays as the artist made it.
        if "window" in name or "glass" in name:
            setin(b, "Transmission Weight", 1.0); setin(b, "Roughness", 0.0)
        continue
    if (name.startswith("carpaint") or name.startswith("paint")) and "black" not in name:
        # Ice-silver metallic paint under a glossy clear coat.
        for l in list(b.inputs["Base Color"].links):
            mat.node_tree.links.remove(l)
        setin(b, "Base Color", (0.62, 0.65, 0.69, 1)); setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.3)
        setin(b, "Coat Weight", 1.0); setin(b, "Coat Roughness", 0.02)
    elif "carpaint_black" in name or "matte_black" in name:
        setin(b, "Metallic", 0.3); setin(b, "Roughness", 0.35); setin(b, "Coat Weight", 0.6)
    elif "glass" in name or "windows" in name:
        setin(b, "Transmission Weight", 1.0); setin(b, "Roughness", 0.0); setin(b, "IOR", 1.45)
        setin(b, "Base Color", (0.75, 0.78, 0.8, 1))
        if "alpha" in name:
            mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else None
    elif "chrome" in name or "mirror" in name:
        setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.04); setin(b, "Base Color", (0.9, 0.9, 0.92, 1))
    elif name.startswith("rim"):
        setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.22)
    elif "tyre" in name or "tire" in name:
        setin(b, "Roughness", 0.75); setin(b, "Specular IOR Level", 0.3)
    elif "carbon" in name:
        setin(b, "Roughness", 0.25); setin(b, "Coat Weight", 1.0)

# ── World: the studio HDRI lights the car; the camera sees a deep dark background ──
world = bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
env = nt.nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdr)
bg_light = nt.nodes.new("ShaderNodeBackground"); bg_light.inputs["Strength"].default_value = 0.9
bg_dark = nt.nodes.new("ShaderNodeBackground"); bg_dark.inputs["Color"].default_value = (0.006, 0.006, 0.009, 1)
lp = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMixShader")
out = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(env.outputs["Color"], bg_light.inputs["Color"])
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
nt.links.new(bg_light.outputs[0], mix.inputs[1])
nt.links.new(bg_dark.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], out.inputs[0])

# ── Floor: dark, slightly glossy, fading into the background far away ──
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new("Floor"); fm.use_nodes = True
fb = fm.node_tree.nodes["Principled BSDF"]
fb.inputs["Roughness"].default_value = 0.38
# Colour fades from a dark grey under the car to pure black a few metres away.
tc_ = fm.node_tree.nodes.new("ShaderNodeTexCoord")
ln = fm.node_tree.nodes.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"
ramp = fm.node_tree.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.035, 0.035, 0.045, 1)
ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1)
mp = fm.node_tree.nodes.new("ShaderNodeMapRange"); mp.inputs["From Min"].default_value = 2.0; mp.inputs["From Max"].default_value = 9.0
fm.node_tree.links.new(tc_.outputs["Object"], ln.inputs[0])
fm.node_tree.links.new(ln.outputs["Value"], mp.inputs["Value"])
fm.node_tree.links.new(mp.outputs["Result"], ramp.inputs["Fac"])
fm.node_tree.links.new(ramp.outputs["Color"], fb.inputs["Base Color"])
# Reflections also fade out with distance so the floor has no visible edge.
spec = fm.node_tree.nodes.new("ShaderNodeMapRange"); spec.inputs["From Min"].default_value = 3.0; spec.inputs["From Max"].default_value = 12.0
spec.inputs["To Min"].default_value = 0.22; spec.inputs["To Max"].default_value = 0.0
fm.node_tree.links.new(ln.outputs["Value"], spec.inputs["Value"])
if "Specular IOR Level" in fb.inputs: fm.node_tree.links.new(spec.outputs["Result"], fb.inputs["Specular IOR Level"])
# Far away the floor becomes pure black (no grazing reflections), so it melts into the background.
fade = fm.node_tree.nodes.new("ShaderNodeMapRange"); fade.inputs["From Min"].default_value = 2.6; fade.inputs["From Max"].default_value = 8.0
fm.node_tree.links.new(ln.outputs["Value"], fade.inputs["Value"])
black = fm.node_tree.nodes.new("ShaderNodeEmission"); black.inputs["Color"].default_value = (0, 0, 0, 1)
mixf = fm.node_tree.nodes.new("ShaderNodeMixShader")
outn = fm.node_tree.nodes["Material Output"]
fm.node_tree.links.new(fade.outputs["Result"], mixf.inputs["Fac"])
fm.node_tree.links.new(fb.outputs[0], mixf.inputs[1])
fm.node_tree.links.new(black.outputs[0], mixf.inputs[2])
fm.node_tree.links.new(mixf.outputs[0], outn.inputs["Surface"])
floor.data.materials.append(fm)

# ── Lights: two long soft strips overhead (the reflection lines on the paint) + a violet rim ──
def area(name, loc, size, power, color=(1, 1, 1), rot=(0, 0, 0)):
    d = bpy.data.lights.new(name, "AREA"); d.shape = "RECTANGLE"; d.size, d.size_y = size; d.energy = power; d.color = color
    o = bpy.data.objects.new(name, d); o.location = loc; o.rotation_euler = rot
    scene.collection.objects.link(o)
    return o
sa = area("StripA", (-1.1, 0, 4.2), (0.5, 7.5), 900)
sb = area("StripB", (1.1, 0, 4.2), (0.5, 7.5), 900)
# Light linking: the strips light only the car, so the floor stays dark and moody.
car_only = bpy.data.collections.new("CarOnly")
for o in meshes: car_only.objects.link(o)
for L in (sa, sb):
    try: L.light_linking.receiver_collection = car_only
    except Exception as e: print("no light linking:", e)
rim = area("Rim", (0, 0, 1.6), (4, 1.2), 600, (0.62, 0.42, 1.0))
rim.location = (0, -6.5, 1.8); rim.rotation_euler = (math.radians(80), 0, 0)
try: rim.light_linking.receiver_collection = car_only
except Exception as e: print("no light linking:", e)

# ── Camera on a circle around the car ──
cam_data = bpy.data.cameras.new("Cam"); cam_data.lens = float(os.environ.get("STUDIO_LENS", "42")); cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 5.6
cam = bpy.data.objects.new("Cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
target = bpy.data.objects.new("Target", None); target.location = (0, 0, height * 0.42); scene.collection.objects.link(target)
tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
cam_data.dof.focus_object = target
R, Z = 8.6, 1.35

# ── Render settings: Cycles on the Mac GPU, denoised ──
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    scene.cycles.device = "GPU"
except Exception as e:
    print("GPU not available, using CPU:", e)
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
os.makedirs(out_dir, exist_ok=True)


# Story: STUDIO_STORY=1 renders one continuous scroll film:
#   A hero orbit → B the car tears apart (parts float, tilt, wheels roll out) → C the camera visits
#   each part in turn → D everything flies home. Frames first..last of `total`.
if STORY:
    from mathutils import Matrix
    GROUPS = {"shell": ["Object_14", "Object_36", "Object_38", "Object_16", "Object_20"], "cage": ["Object_24"],
              "cockpit": ["Object_26", "Object_28", "Object_30", "Object_32", "Object_34"], "engine": ["Object_22", "Object_12"],
              "aero": ["Object_10"], "tyre": ["Object_8"], "rim": ["Object_6"], "brake": ["Object_18"]}
    def group_of(o):
        for g, names in GROUPS.items():
            if any(o.name == n or o.name.startswith(n + ".") for n in names):
                return g
        return "floor"
    # (offset in metres, extra rotation in degrees (x, y, z), start delay 0..0.35)
    PLAN = {"shell": ((0, 0.25, 2.6), (-7, 4, 9), 0.0), "cage": ((0, 0.1, 1.45), (0, 0, -8), 0.1), "cockpit": ((0, 0, 0.6), (0, 0, 5), 0.2),
            "engine": ((0, -0.75, 0.55), (6, 0, -10), 0.25), "aero": ((0, -1.4, -0.02), (0, 0, 0), 0.15),
            "tyre": ((1.3, 0, 0.12), (0, 0, 0), 0.08), "rim": ((1.3, 0, 0.12), (0, 0, 0), 0.08), "brake": ((0.75, 0, 0.12), (0, 0, 0), 0.14), "floor": ((0, 0, 0), (0, 0, 0), 0)}
    parts = []
    for i, o in enumerate(meshes):
        g = group_of(o)
        pts = [o.matrix_world @ Vector(v) for v in o.bound_box]
        c = sum(pts, Vector()) / 8
        off, rot, delay = PLAN[g]
        off = Vector(off)
        if g in ("tyre", "rim", "brake"):
            off.x *= 1 if c.x > 0 else -1
        parts.append({"o": o, "g": g, "base": o.matrix_world.copy(), "c": c, "off": off, "rot": rot, "delay": delay, "seed": i,
                      "lo": Vector(map(min, *pts)) if False else Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
                      "hi": Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))})
    # Each wheel corner spins about its own axle (tyre/rim/brake come as many loose pieces).
    corner_key = lambda c: (c.x > 0, c.y > 0)
    pivots = {}
    for p in parts:
        if p["g"] == "tyre":
            pivots.setdefault(corner_key(p["c"]), []).append(p["c"])
    pivots = {k: sum(v, Vector()) / len(v) for k, v in pivots.items()}
    for p in parts:
        if p["g"] in ("tyre", "rim", "brake"):
            p["pivot"] = pivots.get(corner_key(p["c"]), p["c"])
    ease = lambda t: t * t * (3 - 2 * t)
    clamp = lambda t: min(1.0, max(0.0, t))
    N = total
    A, B, C, D = round(N * 0.12), round(N * 0.36), round(N * 0.88), N - 1   # phase boundaries
    def opening(f):
        if f < A: return 0.0
        if f < B: return ease((f - A) / (B - A))
        if f < C: return 1.0
        return 1 - ease((f - C) / (D - C))
    def pose(f):
        op = opening(f)
        for p in parts:
            k = ease(clamp((op - p["delay"]) / 0.65))
            bob = Vector((0, 0, 0.035 * math.sin(f * 0.12 + p["seed"]))) * k if p["g"] != "floor" else Vector()
            delta = p["off"] * k + bob
            if p["g"] in ("tyre", "rim", "brake"):
                R = Matrix.Identity(4)  # wheels slide out without spinning (spinning broke the tyre mesh)
            else:
                rx, ry, rz = (math.radians(a) * k for a in p["rot"])
                R = Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X")
            c = p.get("pivot", p["c"])
            p["o"].matrix_world = Matrix.Translation(c + delta) @ R @ Matrix.Translation(-c) @ p["base"]
        return op
    # Tour targets: the exploded centre of each group (the wheel = one front corner).
    def centre(groups, pick=None):
        sel = [p for p in parts if p["g"] in groups and (pick is None or pick(p))]
        lo = Vector((min(p["lo"].x for p in sel), min(p["lo"].y for p in sel), min(p["lo"].z for p in sel)))
        hi = Vector((max(p["hi"].x for p in sel), max(p["hi"].y for p in sel), max(p["hi"].z for p in sel)))
        mid = (lo + hi) / 2
        off = sum((p["off"] for p in sel), Vector()) / len(sel)
        return mid + off, (hi - lo).length
    corner = lambda p: p["c"].x < 0 and p["c"].y > 0
    STOPS = [
        ("shell", centre(["shell"]), Vector((-0.55, -0.75, 0.42))),
        ("cage", centre(["cage"]), Vector((-0.7, -0.6, 0.25))),
        ("cockpit", centre(["cockpit"]), Vector((-0.45, -0.8, 0.55))),
        ("engine", centre(["engine"]), Vector((0.55, -0.8, 0.35))),
        ("wheel", centre(["tyre", "rim", "brake"], corner), Vector((-0.55, -0.8, 0.3))),
        ("aero", (Vector((0, min(p["lo"].y for p in parts if p["g"] == "aero") - 1.05, 0.12)), 2.4), Vector((-0.45, -0.75, 0.5))),
    ]
    def orbit(a, r, z, look_z):
        a = math.radians(a)
        return Vector((math.sin(a) * r, -math.cos(a) * r, z)), Vector((0, 0, look_z))
    KEYS = []                                    # (frame, camera position, look-at)
    KEYS.append((0, *orbit(48, 8.8, 1.3, 0.55)))
    KEYS.append((A, *orbit(-32, 8.0, 1.45, 0.6)))
    KEYS.append((B, Vector((-7.6, -9.4, 5.8)), Vector((0, 0, 1.45))))
    span = (C - B) / len(STOPS)
    for i, (name, (ctr, size), d) in enumerate(STOPS):
        dist = max(2.4 if name in ("wheel", "aero") else 1.6, size * 0.95)
        pos = ctr + d.normalized() * dist
        KEYS.append((round(B + span * i + span * 0.4), pos, ctr))
        KEYS.append((round(B + span * (i + 1) - 1), ctr + d.normalized() * dist * 0.88, ctr))
    KEYS.append((round(C + (D - C) * 0.35), Vector((-7.6, -9.4, 5.8)), Vector((0, 0, 1.45))))
    KEYS.append((D, *orbit(-32, 8.0, 1.45, 0.6)))
    def camera_at(f):
        for (f0, p0, l0), (f1, p1, l1) in zip(KEYS, KEYS[1:]):
            if f0 <= f <= f1:
                t = ease((f - f0) / max(1, f1 - f0))
                return p0.lerp(p1, t), l0.lerp(l1, t)
        return KEYS[-1][1], KEYS[-1][2]
    cam.constraints.clear()
    cam_data.lens = 40
    cam_data.dof.use_dof = False
    print("STOPS", [(n, round(B + span * i + span * 0.4), round(B + span * (i + 1) - 1)) for i, (n, _, _) in enumerate(STOPS)], "A", A, "B", B, "C", C, "D", D, flush=True)
    for f in range(first, last + 1):
        pose(f)
        pos, look = camera_at(f)
        cam.location = pos
        cam.rotation_euler = (look - pos).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(out_dir, f"s_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", f, flush=True)
    raise SystemExit

# Exploded view: STUDIO_EXPLODE=1 renders frames 0..total-1 with the car coming apart in stages.
if EXPLODE:
    def kind(o):
        n = o.name
        for key, k in (("Object_14", "shell"), ("Object_36", "shell"), ("Object_38", "shell"), ("Object_16", "shell"), ("Object_20", "shell"),
                       ("Object_24", "cage"), ("Object_26", "cockpit"), ("Object_28", "cockpit"), ("Object_30", "cockpit"), ("Object_32", "cockpit"),
                       ("Object_34", "cockpit"), ("Object_22", "engine"), ("Object_12", "engine"), ("Object_10", "aero"),
                       ("Object_8", "tyre"), ("Object_6", "rim"), ("Object_18", "brake")):
            if n == key or n.startswith(key + "."):
                return k
        return "floor"
    # Direction and distance per group (metres), and when it starts moving (0..1 of the opening).
    MOVE = {"shell": ((0, 0, 2.7), 0.0), "cage": ((0, 0, 1.35), 0.12), "cockpit": ((0, 0, 0.45), 0.22),
            "engine": ((0, -0.35, 0.2), 0.3), "aero": ((0, -0.9, -0.05), 0.18),
            "tyre": ((1.25, 0, 0), 0.08), "rim": ((0.85, 0, 0), 0.16), "brake": ((0.45, 0, 0), 0.24), "floor": ((0, 0, 0), 0)}
    parts = []
    for o in meshes:
        k = kind(o)
        c = sum((o.matrix_world @ Vector(v) for v in o.bound_box), Vector()) / 8
        vec = Vector(MOVE[k][0])
        if k in ("tyre", "rim", "brake"):
            vec.x *= 1 if c.x > 0 else -1
        parts.append((o, o.matrix_world.translation.copy(), vec, MOVE[k][1]))
    cam.constraints.clear()
    cam.location = (-7.4, -9.2, 5.4)
    cam_data.lens = 36
    look = Vector((0, 0, 1.45))
    cam.rotation_euler = (look - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
    target.location = look
    ease = lambda t: t * t * (3 - 2 * t)
    for f in range(first, last + 1):
        t = f / max(1, total - 1)
        for o, base, vec, delay in parts:
            k = ease(min(1.0, max(0.0, (t - delay) / (1 - 0.3))))
            o.matrix_world.translation = base + vec * k
        scene.render.filepath = os.path.join(out_dir, f"x_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", f, flush=True)
    raise SystemExit

# Close-up stills instead of a turntable: STUDIO_STILLS=1 (positions assume the car's nose points to −y).
if os.environ.get("STUDIO_STILLS") == "1":
    L = mx.y - mn.y
    shots = {
        "front": ((1.0, -L * 0.95, 0.5), (0, -L * 0.36, 0.42), 30),
        "wheel": ((-2.5, -L * 0.5, 0.42), (-0.95, -L * 0.3, 0.36), 55),
        "wing": ((2.2, L * 1.05, 2.1), (0, L * 0.42, 1.15), 40),
        "side": ((-8.0, 0.0, 0.85), (0, 0, 0.62), 48),
    }
    cam.constraints.clear()
    for name, (loc, look, lens) in shots.items():
        cam.location = loc
        cam_data.lens = lens
        d = Vector(look) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        target.location = look
        scene.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", name, flush=True)
    raise SystemExit

for k in range(first, last + 1):
    a = math.radians(-35) + (k / total) * 2 * math.pi
    cam.location = (math.sin(a) * R, -math.cos(a) * R, Z)
    scene.render.filepath = os.path.join(out_dir, f"car_{k:03d}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", k, flush=True)
