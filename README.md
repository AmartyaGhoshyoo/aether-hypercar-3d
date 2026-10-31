# AETHER One — an electric hypercar site (concept)

A cinematic, true-3D product site for a fictional electric hypercar. Built by Amartya Ghosh as a
portfolio piece. Vanilla JavaScript + three.js + Lenis, bundled by Vite.

## What it does

1. **The drive (600svh, pinned):** one real 3D car in a dark studio. Scrolling flies the camera
   around it on a spline — front ¾, side (with aero streamlines laid over the real body by ray-casting),
   rear, straight down, close front — while five chapters of copy swap in. Moving the cursor
   **x-rays the car**: the scene is drawn twice (paint, and a glowing fresnel "ghost" of every part) and
   a trail painted by the cursor mixes them, with a violet edge. A scan band does the same once on load.
2. **Made (sticky stack):** four cards that recede (scale 0.9, darken) as the next slides over. Each
   photo is **raised into 3D** from a depth map and filmed by a camera that drifts with cursor and scroll.
3. **The lap (420svh, pinned):** a circuit drawn by scroll where time follows the scroll, so the line
   brakes into corners and fires out of them; a white-hot head cools to violet; live lap/speed/sector/battery.
4. **Configure:** the same car on a drag-to-turn turntable; paint and wheels change the shared materials
   (the hero car changes too), packs change the price; "Reserve" opens a build-slot form (demo only).

Honest loader (fills with the real 9 MB download), reduced-motion support, phone framing.

## Run

```bash
npm install
npm run dev      # http://localhost:3007
```

## Files

- `src/car.js` — loads the model once, normalises it, swaps the sample logos for an AETHER plate, paints
- `src/hero.js` — studio, camera spline, cursor x-ray composite, streamlines
- `src/depthphoto.js` — photo + depth map → displaced mesh with a moving camera
- `src/lap.js` — circuit, braking time curve, hot head
- `src/config.js` — turntable configurator
- `src/main.js` — Lenis + the single ticker, split text, stack recede, configurator UI

To change a photo: put it in `public/img/`, make a depth map with Depth-Anything V2
(`depth.py photo.jpg photo_depth.png`) and point the card's `data-photo` / `data-depth` at them.

## Credits (all free)

- Car: “Car Concept” © 2024 Darmstadt Graphics Group GmbH, model & textures by Eric Chadwick,
  CC BY 4.0, from the Khronos glTF Sample Assets (textures downscaled; logos replaced)
- Studio light: Poly Haven “Studio Small 09”, CC0
- Photos: Unsplash (Unsplash License) — 1645400379459, 1777383975764, 1777642328916, 1766353134008
- Depth maps: Depth-Anything V2 Small (Apache-2.0)
