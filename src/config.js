// The configurator: the same car (a clone sharing its materials) on a turntable you can drag.
// Paint and wheel choices change the shared materials, so the hero car changes too.
import * as THREE from "three";
import { contactShadow, loadCar, studioEnv } from "./car.js";

export function createConfig(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.6, 96), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.4, metalness: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: 0x9b5cff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.01;
  const turntable = new THREE.Group();
  turntable.add(floor, ring, contactShadow());
  scene.add(turntable);
  const rim = new THREE.DirectionalLight(0xc4a6ff, 2);
  rim.position.set(-4, 3, -4);
  scene.add(rim);

  let ready = false;
  loadCar().then(async (car) => {
    turntable.add(car.clone(true));
    scene.environment = await studioEnv(renderer);
    ready = true;
  });

  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    camera.position.set(0, 2.3, camera.aspect < 1 ? 13 : 9.6);
    camera.lookAt(0, 0.45, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  // Drag to turn; it keeps spinning a little after you let go.
  let yaw = 0.7, vel = 0.004, drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    vel = (e.clientX - drag) * 0.006;
    drag = e.clientX;
  });
  canvas.addEventListener("pointerup", () => (drag = null));

  return {
    update() {
      if (!ready) return;
      yaw += vel;
      if (drag === null) vel += (0.003 - vel) * 0.03;
      turntable.rotation.y = yaw;
      renderer.render(scene, camera);
    },
  };
}
