# Nº77 GR Supra GT300 — a cinematic studio showcase

A scroll-driven showcase of a real HD race-car model, built by Amartya Ghosh. Instead of drawing the
car live in the browser, the car is **rendered offline in Blender (Cycles)** — 120 film-quality frames,
one every 3° — and the page flips through them as you scroll. That's how product sites get a
photographic look that real-time 3D can't reach.

## What it does

1. **The spin (560svh, pinned):** a canvas draws frame `round(progress × 119)`; the car turns a full
   360° while five chapters of copy swap in. Frames load in a smart order (every 8th first) so the car
   appears instantly, and an honest loader fills with the real download.
2. **Details:** close-up renders (nose, wheel, wing, profile) on cards that stack and recede.
3. **The lap:** a circuit drawn by scroll where time follows the scroll, so the line brakes into corners.
4. **Spec sheet:** the car, and how the site was made.

## Make the frames again (or with another car)

```bash
# 120 turntable frames (≈ 90 s each at 1920×1080 on an M-series Mac)
STUDIO_KEEP=1 STUDIO_LENS=52 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  -P ~/Downloads/assets/car/blender/studio.py -- <car.glb> <studio.hdr> <out_dir> 0 119 120 64 1920 1080
# close-up stills
STUDIO_KEEP=1 STUDIO_STILLS=1 … same command … <stills_dir> 0 0 1 128 2400 1350
# PNG → WebP for the site (desktop 1920 + phone 960)
python3 ~/Downloads/assets/car/blender/to_web.py <out_dir> public
```

## Run

```bash
npm install
npm run dev      # http://localhost:3007
```

## Credits

- 3D model: “ToyotaGR Supra GT300 | www.vecarz.com” by **vecarz** (kadir kandemir), CC BY 4.0 (Sketchfab)
- Studio light: Poly Haven “Studio Small 09”, CC0 · Rendered in Blender (Cycles)
- Fan-made showcase; not affiliated with Toyota, TOM'S or Super GT.
