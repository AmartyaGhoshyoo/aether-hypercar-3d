// A photo raised into 3D: the picture is laid on a dense plane, each vertex pushed toward the
// camera by its depth (Depth-Anything V2), and the camera drifts with the cursor and the scroll.
// Near things (the robot arms, the car) slide against far things like a real dolly shot.
import * as THREE from "three";

const vertex = /* glsl */ `
  uniform sampler2D uDepth; uniform float uLift;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float d = texture2D(uDepth, uv).r;
    vec3 p = position + vec3(0.0, 0.0, d * uLift);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const fragment = /* glsl */ `
  uniform sampler2D uPhoto; uniform float uDim; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uPhoto, vUv).rgb;
    // A cool grade toward the site's violet in the shadows.
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, c * vec3(0.85, 0.82, 1.08), 1.0 - smoothstep(0.0, 0.5, l));
    gl_FragColor = vec4(c * uDim, 1.0);
    #include <colorspace_fragment>
  }`;

export function createDepthPhoto(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const loader = new THREE.TextureLoader();
  const uniforms = { uPhoto: { value: null }, uDepth: { value: null }, uLift: { value: 0.55 }, uDim: { value: 1 } };
  let mesh = null, aspect = 1.6, ready = false;
  Promise.all([loader.loadAsync(canvas.dataset.photo), loader.loadAsync(canvas.dataset.depth)]).then(([photo, depth]) => {
    photo.colorSpace = THREE.SRGBColorSpace;
    photo.anisotropy = 4;
    uniforms.uPhoto.value = photo;
    uniforms.uDepth.value = depth;
    aspect = photo.image.width / photo.image.height;
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(aspect * 2, 2, 260, Math.round(260 / aspect)), new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment }));
    scene.add(mesh);
    resize();
    ready = true;
  });

  // Fit: the camera distance where the plane just covers the canvas, then a little closer.
  let fitZ = 4;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vfov = (camera.fov * Math.PI) / 180;
    const zForH = 1 / Math.tan(vfov / 2);
    const zForW = aspect / (Math.tan(vfov / 2) * camera.aspect);
    fitZ = Math.min(zForH, zForW) * 0.84 + 0.55;
  }
  addEventListener("resize", resize);

  const mouse = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => ((mouse.x = e.clientX / innerWidth - 0.5), (mouse.y = e.clientY / innerHeight - 0.5)), { passive: true });

  return {
    /** p: how far the card has travelled through the viewport (-1..1). */
    update(p) {
      if (!ready) return;
      cur.x += (mouse.x - cur.x) * 0.06;
      cur.y += (mouse.y - cur.y) * 0.06;
      camera.position.set(cur.x * 0.5, -cur.y * 0.3 + p * 0.35, fitZ - Math.abs(p) * 0.15);
      camera.lookAt(0, p * 0.12, 0.25);
      renderer.render(scene, camera);
    },
  };
}
