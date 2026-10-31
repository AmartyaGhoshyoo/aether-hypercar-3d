// AETHER One: one ticker drives everything (Lenis first, then each part that is on screen).
import Lenis from "lenis";
import { PAINTS, WHEELS, setPaint, setWheels } from "./car.js";
import { createConfig } from "./config.js";
import { createDepthPhoto } from "./depthphoto.js";
import { createHero } from "./hero.js";
import { createLap } from "./lap.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ── Split text into words that rise in when their block arrives ─────────────
$$(".split").forEach((el) => {
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(part);
          const s = document.createElement("span");
          s.className = "w";
          s.textContent = part;
          frag.append(s);
        });
        n.replaceWith(frag);
      } else walk(n);
    });
  };
  el.setAttribute("aria-label", el.textContent);
  walk(el);
  $$(".w", el).forEach((w, i) => w.style.setProperty("--i", i));
});
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { rootMargin: "-10% 0px" });
$$(".made .split, .lap .split").forEach((el) => io.observe(el));

// ── Smooth scroll ───────────────────────────────────────────────────────────
const lenis = still ? null : new Lenis({ lerp: 0.085, anchors: true });

// Progress of a tall pinned section: 0 when its top meets the viewport top, 1 when its end does.
const pinProgress = (el) => {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
};
const onScreen = (el, margin = 0) => {
  const r = el.getBoundingClientRect();
  return r.bottom > -margin && r.top < innerHeight + margin;
};

// ── Loader veil ─────────────────────────────────────────────────────────────
const veil = $("#veil"), bar = $(".veil-bar span"), pct = $(".veil-pct");
let shown = 0;
const setLoad = (v) => {
  shown = Math.max(shown, v);
  bar.style.width = `${shown * 100}%`;
  pct.textContent = `${Math.round(shown * 100)}%`;
};

// ── Hero ───────────────────────────────────────────────────────────────────
const drive = $("#drive");
const chapters = $$(".ch");
let chapter = -1;
const hero = createHero({
  canvas: $("#car"),
  onProgress: (v) => setLoad(v * 0.92),
  onReady: () => {
    setLoad(1);
    setTimeout(() => {
      veil.classList.add("done");
      $(".ch[data-ch='0'] .split")?.classList.add("in");
    }, 250);
  },
});
const setChapter = (i) => {
  if (i === chapter) return;
  chapter = i;
  chapters.forEach((c, k) => {
    c.classList.toggle("is-on", k === i);
    if (k === i) $(".split", c)?.classList.add("in");
  });
  $("#hud-ch").textContent = `0${i + 1} / 05`;
};
setChapter(0);

// ── Made: depth photos + receding stack ────────────────────────────────────
const cards = $$(".card");
const photos = cards.map((c) => createDepthPhoto($(".depth", c)));

// ── Lap ─────────────────────────────────────────────────────────────────────
const lapEl = $("#lap");
const lap = createLap($("#track"), { time: $("#lap-time"), speed: $("#lap-speed"), sector: $("#lap-sector"), batt: $("#lap-batt") });

// ── Configure ──────────────────────────────────────────────────────────────
const config = createConfig($("#config"));
const BASE = 289000;
const PACKS = [
  { name: "Track", price: 38000 },
  { name: "Night", price: 12000 },
  { name: "Long range", price: 9000 },
];
const state = { paint: 0, wheels: 0, packs: new Set() };
const money = (n) => "$" + n.toLocaleString("en-US");
const paintPrice = (i) => [0, 6500, 0, 3500, 8200][i];
const total = () => BASE + paintPrice(state.paint) + WHEELS[state.wheels].price + [...state.packs].reduce((s, i) => s + PACKS[i].price, 0);
const renderPrice = () => ($("#price").textContent = money(total()));
PAINTS.forEach((p, i) => {
  const b = document.createElement("button");
  b.className = "swatch";
  b.style.background = p.hex;
  b.setAttribute("aria-label", p.name);
  b.setAttribute("aria-pressed", String(i === 0));
  b.onclick = () => {
    state.paint = i;
    setPaint(i);
    $$(".swatch").forEach((s, k) => s.setAttribute("aria-pressed", String(k === i)));
    $("#paint-name").textContent = p.name + (paintPrice(i) ? ` · +${money(paintPrice(i))}` : "");
    renderPrice();
  };
  $("#paints").append(b);
});
WHEELS.forEach((w, i) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.innerHTML = `${w.name}${w.price ? `<small>+${money(w.price)}</small>` : ""}`;
  b.setAttribute("aria-pressed", String(i === 0));
  b.onclick = () => {
    state.wheels = i;
    setWheels(i);
    $$("#wheels .chip").forEach((s, k) => s.setAttribute("aria-pressed", String(k === i)));
    renderPrice();
  };
  $("#wheels").append(b);
});
PACKS.forEach((p, i) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.innerHTML = `${p.name}<small>+${money(p.price)}</small>`;
  b.setAttribute("aria-pressed", "false");
  b.onclick = () => {
    state.packs.has(i) ? state.packs.delete(i) : state.packs.add(i);
    b.setAttribute("aria-pressed", String(state.packs.has(i)));
    renderPrice();
  };
  $("#packs").append(b);
});
renderPrice();

// Reserve dialog.
const dlg = $("#reserve-dialog");
$("#reserve").onclick = () => {
  $("#reserve-sum").textContent = `${PAINTS[state.paint].name}, ${WHEELS[state.wheels].name} wheels${state.packs.size ? ", " + [...state.packs].map((i) => PACKS[i].name).join(" + ") + " pack" : ""} — ${money(total())}.`;
  $("#reserve-form").hidden = false;
  $("#reserve-done").hidden = true;
  dlg.showModal();
};
$("#reserve-form").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  e.preventDefault();
  $("#slot-no").textContent = `AE1-${String(Math.floor(Math.random() * 99) + 1).padStart(3, "0")}`;
  $("#reserve-form").hidden = true;
  $("#reserve-done").hidden = false;
});
$("#reserve-close").onclick = () => dlg.close();

// ── The one ticker ─────────────────────────────────────────────────────────
const t0 = performance.now();
let lastCam = 0;
function tick(now) {
  requestAnimationFrame(tick);
  lenis?.raf(now);
  if (document.hidden) return;
  const t = (now - t0) / 1000;

  if (onScreen(drive)) {
    const p = pinProgress(drive);
    hero.update(t, p);
    setChapter(Math.min(4, Math.floor(p * 5 + 0.08)));
    $("#drive-bar").style.width = `${p * 100}%`;
    if (now - lastCam > 120) {
      lastCam = now;
      $("#hud-cam").textContent = hero.camInfo();
    }
  }

  // Stack recede: as the next card slides over, this one shrinks to 0.9 and darkens.
  const stickTop = innerHeight * 0.12;
  cards.forEach((c, i) => {
    const inner = c.firstElementChild;
    const next = cards[i + 1];
    let k = 0;
    if (next) {
      const top = next.getBoundingClientRect().top;
      k = clamp01((innerHeight - top) / (innerHeight - stickTop));
    }
    inner.style.transform = k ? `scale(${1 - 0.1 * k})` : "";
    inner.style.setProperty("--shade", (0.55 * k).toFixed(3));
    inner.style.visibility = k >= 0.999 ? "hidden" : "";
    if (onScreen(c, 100) && k < 0.999) {
      const r = c.getBoundingClientRect();
      photos[i].update(clamp01((innerHeight - r.top) / (innerHeight + r.height)) * 2 - 1);
    }
  });

  if (onScreen(lapEl)) lap.update(pinProgress(lapEl) * 1.08);
  if (onScreen($("#build"))) config.update();
}
requestAnimationFrame(tick);
