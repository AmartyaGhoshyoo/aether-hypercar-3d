// Nº77: one ticker drives everything (Lenis first). Two image sequences rendered in Blender:
// the story (400 frames: hero → tear apart → a tour of every part → rebuild) and the spin
// (120 frames, one every 3°). Text on screen is tied to frame numbers, not scroll pixels.
import Lenis from "lenis";
import { createLap } from "./lap.js";
import { createSequence } from "./sequence.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lenis = still ? null : new Lenis({ lerp: 0.1, anchors: true });

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

// Phones: the picture sits in the top part; wide screens: a little right of centre.
// Wide screens: the car sits to the right of the copy, a little smaller than the screen and never
// stretched beyond its real pixels (so it stays sharp); the picture's edges melt into black.
const layout = (W, H, im) => (W < 720 ? { scale: (W / im.width) * 1.5, cx: 0.5, cy: 0.33 } : { scale: Math.min(Math.max(W / im.width, H / im.height) * 0.8, 1), cx: 0.62, cy: 0.5 });

// ── The story ─────────────────────────────────────────────────────────────
const SF = 400;
const veil = $("#veil"), bar = $(".veil-bar span"), pct = $(".veil-pct b");
const storySeq = createSequence({
  canvas: $("#sseq"),
  dir: small ? "/story-m" : "/story",
  prefix: "s_",
  count: SF,
  layout,
  onProgress: (k) => {
    bar.style.width = `${k * 100}%`;
    pct.textContent = `${Math.round(k * 100)}%`;
    // Every 8th frame is enough to start: open the page then, keep loading behind it.
    if (k >= 0.14 && !veil.classList.contains("done")) veil.classList.add("done");
    if (k >= 1) spinSeq.start();
  },
});
storySeq.start();
const story = $("#story");
const sseq = $("#sseq");
const timed = $$("#story [data-from]").map((el) => ({ el, from: +el.dataset.from, to: +el.dataset.to }));
const phases = [[0, "Assembled"], [48, "Coming apart"], [152, "Part tour"], [352, "Rebuilding"], [392, "Assembled"]];

// ── The spin ──────────────────────────────────────────────────────────────
const SPIN = 120;
const spin = $("#spin");
let turn = 0, turnTarget = 0, dragX = null, dragBase = 0;
const spinStage = $("#spin .stage");
spinStage.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") turnTarget = (e.clientX / innerWidth - 0.5) * 60;
  else if (dragX !== null) turnTarget = dragBase + ((e.clientX - dragX) / innerWidth) * 90;
});
spinStage.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") ((dragX = e.clientX), (dragBase = turnTarget));
});
addEventListener("pointerup", () => (dragX = null));
spinStage.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && (turnTarget = 0));
const spinSeq = createSequence({ canvas: $("#seq"), dir: small ? "/frames-m" : "/frames", prefix: "f_", count: SPIN, layout });

// ── Details stack + lap ───────────────────────────────────────────────────
const cards = $$(".card");
const lapEl = $("#lap");
const lap = createLap($("#track"), { time: $("#lap-time"), speed: $("#lap-speed"), sector: $("#lap-sector"), batt: $("#lap-batt") });

// ── The one ticker ────────────────────────────────────────────────────────
let sPos = 0, spinPos = 0, lastS = -1, lastF = -1;
function tick(now) {
  requestAnimationFrame(tick);
  lenis?.raf(now);
  if (document.hidden) return;
  m.x += (mouse.x - m.x) * 0.06;
  m.y += (mouse.y - m.y) * 0.06;

  if (onScreen(story)) {
    const p = pinProgress(story);
    sPos = p * (SF - 1);
    storySeq.draw(sPos);
    sseq.style.transform = `translate3d(${-m.x * 14}px, ${-m.y * 8}px, 0) scale(1.03)`;
    const f = Math.round(sPos);
    if (f !== lastS) {
      lastS = f;
      timed.forEach(({ el, from, to }) => el.classList.toggle("on", f >= from && f <= to));
      $("#s-phase").textContent = phases.filter(([a]) => f >= a).pop()[1];
      $("#s-frame").textContent = String(f + 1).padStart(3, "0");
    }
    $("#s-bar").style.width = `${p * 100}%`;
  }

  if (onScreen(spin)) {
    const p = pinProgress(spin);
    // Scroll turns the car, and the cursor turns it further: left/right edge = ±90°.
    // On touch screens, dragging sideways does the same.
    turn += (turnTarget - turn) * (still ? 1 : 0.12);
    spinPos = p * (SPIN - 1) + turn;
    spinSeq.draw(spinPos, true);
    const f = Math.round(spinPos);
    if (f !== lastF) {
      lastF = f;
      const w = ((f % SPIN) + SPIN) % SPIN;
      $("#hud-rot").textContent = `${String(w * 3).padStart(3, "0")}°`;
      $("#hud-frame").textContent = String(w + 1).padStart(3, "0");
    }
    $("#spin-bar").style.width = `${p * 100}%`;
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
