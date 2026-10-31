// The drive: the car in a dark studio. Scrolling the 600svh section flies the camera around it
// on a spline (front ¾ → side → rear → above → close front). The cursor leaves a trail that
// x-rays the car: the scene is drawn twice (paint and wireframe) into two render targets and a
// mask painted by the cursor mixes them, with a violet glow on the edge. Aero streamlines are
// laid over the real body by ray-casting down onto it.
import * as THREE from "three";
import { contactShadow, loadCar, studioEnv } from "./car.js";

// Camera stations. `l` frames the car to the right of the copy on wide screens; phones look at
// the middle of the car (`c`) because the copy sits underneath.
const KEYS = [
  { p: [6.6, 1.5, 6.1], l: [-0.75, 0.55, 0.75] },
  { p: [0.2, 0.95, 8.8], l: [-1.5, 0.6, 0] },
  { p: [-6.8, 2.6, -5.4], l: [0.6, 0.5, -0.75] },
  { p: [-1.0, 9.6, 0.6], l: [-1.4, 0, 0] },
  { p: [5.9, 1.05, 4.2], l: [-0.1, 0.55, 0.8] },
];
const CENTRE = [0, 0.5, 0];
const PHONE_PULL = 1.9; // phones are narrow: step the camera back

export function createHero({ canvas, onProgress, onReady }) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.Fog(0x07080a, 11, 26);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // Studio: dark glossy floor, a key light that casts the shadow, a violet rim behind.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.32, metalness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor, contactShadow());
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 8, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  key.shadow.radius = 4;
  const rim = new THREE.SpotLight(0x9b5cff, 60, 30, 0.45, 0.8, 1.4);
  rim.position.set(-6, 4, -5);
  scene.add(key, rim, rim.target);
  // A long strip light overhead, seen in the paint.
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strip.position.set(0, 5.5, 0);
  strip.rotation.x = Math.PI / 2;
  scene.add(strip);

  // Two render targets and the composite that mixes them through the cursor mask.
  const rtA = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const rtB = new THREE.WebGLRenderTarget(2, 2, { samples: 2, type: THREE.HalfFloatType });
  // The x-ray look: every surface becomes a glowing violet outline (fresnel), added on top of
  // each other, so you see the cabin, seats, motors and wheels through the body.
  const wire = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(0.42, 0.27, 0.95) * f * 0.32 + vec3(0.02, 0.015, 0.05), 1.0); }",
  });
  const maskCanvas = document.createElement("canvas");
  const mctx = maskCanvas.getContext("2d");
  const maskTex = new THREE.CanvasTexture(maskCanvas);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const composite = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tA: { value: rtA.texture }, tB: { value: rtB.texture }, tMask: { value: maskTex }, uTime: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tMask; uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec3 a = texture2D(tA, vUv).rgb;
          vec3 b = texture2D(tB, vUv).rgb;
          float m = texture2D(tMask, vUv).r;
          // Blueprint grid behind the x-ray.
          vec2 g = abs(fract(vUv * vec2(48.0, 27.0)) - 0.5);
          float grid = (1.0 - smoothstep(0.0, 0.03, min(g.x, g.y))) * 0.05;
          vec3 xr = vec3(0.015, 0.012, 0.035) + b * 1.6 + vec3(0.45, 0.3, 1.0) * grid;
          float k = smoothstep(0.3, 0.55, m);
          float edge = smoothstep(0.18, 0.4, m) * (1.0 - smoothstep(0.4, 0.62, m));
          vec3 col = mix(a, xr, k) + vec3(0.62, 0.36, 1.0) * edge * 2.2;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    }),
  );
  composite.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(composite);

  // Streamlines: filled in once the car is here.
  const flow = new THREE.Group();
  scene.add(flow);
  const flowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
    vertexShader: "attribute float along; varying float vA; void main(){ vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uOn; varying float vA;
      void main(){ float d = fract(vA * 2.0 - uTime * 0.45); float a = smoothstep(0.0, 0.25, d) * (1.0 - smoothstep(0.25, 0.32, d));
        float ends = smoothstep(0.0, 0.08, vA) * (1.0 - smoothstep(0.92, 1.0, vA));
        gl_FragColor = vec4(vec3(0.75, 0.62, 1.0), (0.12 + a * 0.9) * ends * uOn); }`,
  });

  let car = null;
  loadCar(onProgress).then(async (c) => {
    car = c;
    scene.add(car);
    scene.environment = await studioEnv(renderer);
    scene.environmentIntensity = 0.85;
    buildFlow();
    renderer.compile(scene, camera);
    frame(0, 0);
    onReady?.();
    readyAt = performance.now();
  });

  function buildFlow() {
    const meshes = [];
    car.traverse((o) => o.isMesh && o.visible && meshes.push(o));
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const N = 44;
    for (let li = 0; li < 11; li++) {
      const z = -0.85 + (li / 10) * 1.7;
      const pts = [];
      let y0 = 0.55;
      for (let i = 0; i <= N; i++) {
        const x = 4.2 - (i / N) * 8.4;
        let y = 0.3;
        if (Math.abs(x) < 2.35) {
          ray.set(new THREE.Vector3(x, 4, z), down);
          const hit = ray.intersectObjects(meshes, false)[0];
          if (hit) y = hit.point.y;
        }
        // Air leaves the body smoothly: ease toward the surface, never dip sharply.
        y0 += (Math.max(y + 0.06, 0.35) - y0) * 0.55;
        pts.push(new THREE.Vector3(x, y0, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const sm = curve.getPoints(160);
      const geo = new THREE.BufferGeometry().setFromPoints(sm);
      geo.setAttribute("along", new THREE.BufferAttribute(new Float32Array(sm.map((_, i) => i / (sm.length - 1))), 1));
      flow.add(new THREE.Line(geo, flowMat));
    }
  }

  // Camera path.
  const path = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.p)), false, "centripetal");
  const look = new THREE.Vector3(), tmp = new THREE.Vector3(), camPos = new THREE.Vector3(...KEYS[0].p), camLook = new THREE.Vector3(...KEYS[0].l);

  // Cursor mask.
  let w = 2, h = 2, readyAt = 0, lastMove = -1e9;
  const ptr = { x: -1, y: -1, px: -1, py: -1, has: false };
  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    rtA.setSize(w * pr, h * pr);
    rtB.setSize(Math.round(w * pr * 0.75), Math.round(h * pr * 0.75));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    maskCanvas.height = 180;
    maskCanvas.width = Math.round(180 * (w / h));
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskTex.needsUpdate = true;
  };
  resize();
  addEventListener("resize", resize);
  addEventListener(
    "pointermove",
    (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      ptr.x = ((e.clientX - r.left) / r.width) * maskCanvas.width;
      ptr.y = ((e.clientY - r.top) / r.height) * maskCanvas.height;
      if (!ptr.has) ((ptr.px = ptr.x), (ptr.py = ptr.y));
      ptr.has = true;
      lastMove = performance.now();
    },
    { passive: true },
  );

  const stamp = (x, y, r) => {
    const g = mctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fill();
  };
  const paintMask = (now) => {
    mctx.fillStyle = "rgba(0,0,0,0.05)";
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    // Entrance: a scan band sweeps the car once, showing the structure under the paint.
    const s = (now - readyAt) / 2200;
    if (readyAt && s > 0 && s < 1 && !still) {
      const x = (s * 1.3 - 0.15) * maskCanvas.width;
      const grd = mctx.createLinearGradient(x - 40, 0, x + 40, 0);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(0.5, "rgba(255,255,255,0.85)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      mctx.fillStyle = grd;
      mctx.fillRect(x - 40, 0, 80, maskCanvas.height);
    }
    if (ptr.has) {
      // A capsule from the last pointer position to this one.
      const steps = Math.max(1, Math.ceil(Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py) / 4));
      for (let i = 1; i <= steps; i++) stamp(ptr.px + ((ptr.x - ptr.px) * i) / steps, ptr.py + ((ptr.y - ptr.py) * i) / steps, 20);
      ptr.px = ptr.x;
      ptr.py = ptr.y;
    }
    maskTex.needsUpdate = true;
  };

  let progress = 0, lastT = 0;
  function frame(t, p) {
    progress = p;
    const now = performance.now();
    // Frame-rate independent easing toward the scroll pose.
    const ease = still ? 1 : 1 - Math.exp(-Math.min(0.1, Math.max(0.001, t - lastT)) * 6);
    lastT = t;
    const k = Math.min(0.9999, Math.max(0, p));
    path.getPoint(k, tmp);
    const seg = k * (KEYS.length - 1), i = Math.floor(seg), f = seg - i;
    const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    const narrow = w < 720;
    look.set(...(narrow ? CENTRE : a.l)).lerp(new THREE.Vector3(...(narrow ? CENTRE : b.l)), f * f * (3 - 2 * f));
    if (narrow) tmp.multiplyScalar(PHONE_PULL);
    camPos.lerp(tmp, ease);
    camLook.lerp(look, ease);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // Streamlines show in the aero chapter.
    const on = Math.max(0, 1 - Math.abs(p - 0.25) / 0.13);
    flowMat.uniforms.uOn.value = on;
    flowMat.uniforms.uTime.value = t;
    flow.visible = on > 0.01;
    rim.intensity = 55 + 25 * Math.sin(t * 0.5);

    const xray = !still && (now - lastMove < 2600 || (readyAt && now - readyAt < 2600));
    if (xray) {
      paintMask(now);
      renderer.setRenderTarget(rtB);
      scene.overrideMaterial = wire;
      const bg = scene.background, fog = scene.fog;
      scene.background = null;
      scene.fog = null;
      floor.visible = false;
      flow.visible = false;
      renderer.setClearColor(0x000000, 1);
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = bg;
      scene.fog = fog;
      floor.visible = true;
      flow.visible = on > 0.01;
    } else if (lastMove > 0 || readyAt) {
      // Let the last trail fade out, then stop drawing the second pass.
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskTex.needsUpdate = true;
      lastMove = 0;
    }
    renderer.setRenderTarget(rtA);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    composite.material.uniforms.uTime.value = t;
    renderer.render(quadScene, quadCam);
  }

  return {
    update(t, p) {
      if (car) frame(t, p);
    },
    camInfo() {
      const ang = Math.round(((Math.atan2(camera.position.x, camera.position.z) * 180) / Math.PI + 360) % 360);
      return `CAM ${String(ang).padStart(3, "0")}° · ${camera.position.y.toFixed(1)} m`;
    },
    get progress() {
      return progress;
    },
  };
}
