// Nº77: one ticker drives everything (Lenis first). Two image sequences rendered in Blender:
// the spin (120 frames, one every 3°) and the exploded view (48 frames, the car coming apart).
import Lenis from "lenis";
import { createLap } from "./lap.js";
import { createSequence } from "./sequence.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const lenis = still ? null : new Lenis({ lerp: 0.085, anchors: true });

const pinProgress = (el) => {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
};
const onScreen = (el, margin = 0) => {
  const r = el.getBoundingClientRect();
  return r.bottom > -margin && r.top < innerHeight + margin;
};
const small = innerWidth < 900;

const mouse = { x: 0, y: 0 }, m = { x: 0, y: 0 };
addEventListener("pointermove", (e) => ((mouse.x = e.clientX / innerWidth - 0.5), (mouse.y = e.clientY / innerHeight - 0.5)), { passive: true });

// ── The spin ──────────────────────────────────────────────────────────────
const SPIN = 120;
const veil = $("#veil"), bar = $(".veil-bar span"), pct = $(".veil-pct b");
const spinSeq = createSequence({
  canvas: $("#seq"),
  dir: small ? "/frames-m" : "/frames",
  prefix: "f_",
  count: SPIN,
  // Phones: the car is bigger and sits in the top part; wide screens: right of the copy.
  layout: (W, H, im) => (W < 720 ? { scale: (W / im.width) * 1.45, cx: 0.5, cy: 0.34 } : { scale: Math.min(W / im.width, H / im.height) * 0.98, cx: 0.6, cy: 0.5 }),
  onProgress: (k) => {
    bar.style.width = `${k * 100}%`;
    pct.textContent = `${Math.round(k * 100)}%`;
    if (k >= 1) {
      setTimeout(() => veil.classList.add("done"), 200);
      explodeSeq.start(); // the exploded view loads once the spin is in
    }
  },
});
spinSeq.start();

const spin = $("#spin");
const chapters = $$(".ch");
let chapter = -1;
const setChapter = (i) => {
  if (i === chapter) return;
  chapter = i;
  chapters.forEach((c, k) => c.classList.toggle("is-on", k === i));
  $("#hud-ch").textContent = `0${i + 1} / 05`;
};
setChapter(0);

// ── The exploded view ─────────────────────────────────────────────────────
const XF = 48;
const explode = $("#explode");
const explodeSeq = createSequence({
  canvas: $("#xseq"),
  dir: small ? "/exploded-m" : "/exploded",
  prefix: "x_",
  count: XF,
  layout: (W, H, im) => (W < 720 ? { scale: (W / im.width) * 1.3, cx: 0.5, cy: 0.36 } : { scale: Math.min(W / im.width, H / im.height) * 0.98, cx: 0.6, cy: 0.52 }),
});
const steps = $$(".xstep");
const labels = $$(".xlabel");

// ── Details stack + lap ───────────────────────────────────────────────────
const cards = $$(".card");
const lapEl = $("#lap");
const lap = createLap($("#track"), { time: $("#lap-time"), speed: $("#lap-speed"), sector: $("#lap-sector"), batt: $("#lap-batt") });

// ── The one ticker ────────────────────────────────────────────────────────
let spinPos = 0, xPos = 0, lastF = -1, lastStep = -1;
function tick(now) {
  requestAnimationFrame(tick);
  lenis?.raf(now);
  if (document.hidden) return;
  m.x += (mouse.x - m.x) * 0.06;
  m.y += (mouse.y - m.y) * 0.06;

  if (onScreen(spin)) {
    const p = pinProgress(spin);
    spinPos += (p * (SPIN - 1) - spinPos) * (still ? 1 : 0.18);
    spinSeq.draw(spinPos, m);
    const f = Math.round(spinPos);
    if (f !== lastF) {
      lastF = f;
      $("#hud-rot").textContent = `${String(f * 3).padStart(3, "0")}°`;
      $("#hud-frame").textContent = String(f + 1).padStart(3, "0");
    }
    setChapter(Math.min(4, Math.floor(p * 5 + 0.06)));
    $("#spin-bar").style.width = `${p * 100}%`;
  }

  if (onScreen(explode)) {
    // 0–45%: the car opens. 45–62%: it holds open and the labels show. 62–100%: it closes again.
    const p = pinProgress(explode);
    const open = p < 0.62 ? range(p, 0.02, 0.45) : 1 - range(p, 0.62, 0.97);
    xPos += (open * (XF - 1) - xPos) * (still ? 1 : 0.2);
    const r = explodeSeq.draw(xPos, m);
    // Which part is being described: follows the opening, then the closing in reverse.
    const s = p < 0.62 ? Math.min(steps.length - 1, Math.floor(range(p, 0.02, 0.56) * steps.length)) : Math.min(steps.length - 1, Math.floor((1 - range(p, 0.62, 0.95)) * steps.length));
    if (s !== lastStep) {
      lastStep = s;
      steps.forEach((el, i) => el.classList.toggle("on", i === s));
    }
    // Labels sit at fixed spots on the fully open picture (fractions of the image).
    const show = range(p, 0.4, 0.47) * (1 - range(p, 0.6, 0.66));
    labels.forEach((el) => {
      el.style.left = `${r.x + r.w * +el.dataset.x}px`;
      el.style.top = `${r.y + r.h * +el.dataset.y}px`;
      el.style.opacity = String(show);
    });
    $("#x-bar").style.width = `${p * 100}%`;
  }

  // Each card shrinks to 0.9 and darkens as the next one slides over it; its photo drifts.
  const stickTop = innerHeight * 0.12;
  cards.forEach((c, i) => {
    const inner = c.firstElementChild;
    const next = cards[i + 1];
    let k = 0;
    if (next) k = clamp01((innerHeight - next.getBoundingClientRect().top) / (innerHeight - stickTop));
    inner.style.transform = k ? `scale(${1 - 0.1 * k})` : "";
    inner.style.setProperty("--shade", (0.6 * k).toFixed(3));
    if (onScreen(c, 50)) {
      const r = c.getBoundingClientRect();
      const t = clamp01((innerHeight - r.top) / (innerHeight + r.height));
      inner.querySelector("img").style.transform = `translate3d(0, ${(t - 0.5) * -8}%, 0)`;
    }
  });

  if (onScreen(lapEl)) lap.update(pinProgress(lapEl) * 1.08);
}
requestAnimationFrame(tick);
