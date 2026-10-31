// The car: one real glTF model (Khronos "Car Concept", CC BY 4.0) loaded once and shared by the
// hero and the configurator. Paint and wheel colours are set on its materials, so a change in the
// configurator shows everywhere.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export const PAINTS = [
  { name: "Ice Silver", hex: "#c9d1d8", color: 0xb9c2ca, metal: 0.85, rough: 0.28 },
  { name: "Eclipse Violet", hex: "#4b2a8f", color: 0x3a1f78, metal: 0.7, rough: 0.3 },
  { name: "Carbon Black", hex: "#16181c", color: 0x0d0e11, metal: 0.6, rough: 0.35 },
  { name: "Glacier White", hex: "#eef1f3", color: 0xe4e8eb, metal: 0.2, rough: 0.25 },
  { name: "Signal Carmine", hex: "#8e0f24", color: 0x7a0b1e, metal: 0.6, rough: 0.3 },
];
export const WHEELS = [
  { name: "Forged Silver", color: 0xc8ccd2, metal: 1, rough: 0.25, price: 0 },
  { name: "Satin Black", color: 0x121316, metal: 0.6, rough: 0.5, price: 4200 },
  { name: "UV Edge", color: 0x5b2fc9, metal: 0.8, rough: 0.3, price: 6800 },
];

let carPromise = null;
let paintMats = [];
let rimMats = [];

const plateTexture = () => {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#eef3f5";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#07080a";
  g.font = "600 74px Unbounded, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("AE · 001", 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  return t;
};

/** Load the car once. `onProgress(0..1)` reports the real download. */
export function loadCar(onProgress = () => {}) {
  if (carPromise) return carPromise;
  carPromise = new Promise((resolve, reject) => {
    new GLTFLoader().load(
      "/3d/car.glb",
      (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          const n = (o.name || "").toLowerCase();
          // Replace the sample's logos with our own plate; hide the badge on the wheel.
          if (n.includes("emblem")) o.visible = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            const mn = (m.name || "").toLowerCase();
            if (mn.startsWith("paint")) paintMats.push(m);
            if (mn.startsWith("rim")) rimMats.push(m);
            if (mn === "license") {
              m.map = plateTexture();
              m.needsUpdate = true;
            }
            if (mn === "panel sides") {
              m.map = null;
              m.color?.set(0x111318);
              m.needsUpdate = true;
            }
          });
        });
        paintMats = [...new Set(paintMats)];
        rimMats = [...new Set(rimMats)];
        // Normalise: length along x, 4.6 m long, wheels on y = 0, centred.
        let box = new THREE.Box3().setFromObject(root);
        let size = box.getSize(new THREE.Vector3());
        const wrap = new THREE.Group();
        wrap.add(root);
        if (size.z > size.x) root.rotation.y = Math.PI / 2;
        box = new THREE.Box3().setFromObject(wrap);
        size = box.getSize(new THREE.Vector3());
        wrap.scale.setScalar(4.6 / size.x);
        box = new THREE.Box3().setFromObject(wrap);
        const c = box.getCenter(new THREE.Vector3());
        root.position.x -= c.x / wrap.scale.x;
        root.position.z -= c.z / wrap.scale.x;
        root.position.y -= box.min.y / wrap.scale.x;
        setPaint(0);
        setWheels(0);
        resolve(wrap);
      },
      (e) => e.total && onProgress(e.loaded / e.total),
      reject,
    );
  });
  return carPromise;
}

export function setPaint(i) {
  const p = PAINTS[i];
  paintMats.forEach((m) => {
    m.color.set(p.color);
    m.metalness = p.metal;
    m.roughness = p.rough;
    if ("clearcoat" in m) {
      m.clearcoat = 1;
      m.clearcoatRoughness = 0.05;
    }
    if ("iridescence" in m) m.iridescence = 0;
    m.map = null;
    m.needsUpdate = true;
  });
}

export function setWheels(i) {
  const w = WHEELS[i];
  rimMats.forEach((m) => {
    m.color.set(w.color);
    m.metalness = w.metal;
    m.roughness = w.rough;
    m.map = null;
    m.needsUpdate = true;
  });
}

let envPromise = null;
/** The studio light (Poly Haven, CC0) as a PMREM environment, shared per renderer. */
export function studioEnv(renderer) {
  if (!envPromise) envPromise = new RGBELoader().loadAsync("/3d/studio.hdr");
  return envPromise.then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    return env;
  });
}

/** A soft dark ellipse under the car (cheap contact shadow). */
export function contactShadow(w = 5.6, d = 2.8) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, "rgba(0,0,0,0.9)");
  grd.addColorStop(0.55, "rgba(0,0,0,0.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  return m;
}
