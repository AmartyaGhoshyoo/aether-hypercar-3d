// An image sequence on a canvas: frames rendered in Blender, one picture per step.
// Fast path: frames are decoded off the main thread before use, the canvas is only redrawn when
// the frame number changes, and it runs at the image's own resolution (not the screen's).
export function createSequence({ canvas, dir, prefix, count, onProgress, layout }) {
  const g = canvas.getContext("2d", { alpha: false });
  const imgs = new Array(count);
  let loaded = 0, W = 0, H = 0, started = false, last = -1;

  const url = (i) => `${dir}/${prefix}${String(i).padStart(3, "0")}.webp`;
  const start = () => {
    if (started) return;
    started = true;
    // Every 8th frame first, then the gaps: the motion works early and gets smoother as it loads.
    const order = [];
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < count; i += step) if (!order.includes(i)) order.push(i);
    // A few at a time, so the first frames aren't stuck behind 200 downloads.
    let next = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++];
      const im = new Image();
      im.src = url(i);
      im.decode()
        .then(() => (imgs[i] = im))
        .catch(() => {})
        .finally(() => {
          onProgress?.(++loaded / count);
          if (Math.abs(i - last) < 6) last = -1; // a nearer frame arrived: redraw
          pump();
        });
    };
    for (let k = 0; k < 6; k++) pump();
  };
  const nearest = (i) => {
    for (let d = 0; d < count; d++) {
      const a = imgs[Math.min(count - 1, i + d)], b = imgs[Math.max(0, i - d)];
      if (a) return a;
      if (b) return b;
    }
    return null;
  };
  const resize = () => {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    last = -1;
  };
  resize();
  addEventListener("resize", resize);

  // Always show one sharp frame (no blending). `wrap` lets a turntable go round past 0/last.
  function draw(pos, wrap = false) {
    let f = Math.round(pos);
    f = wrap ? ((f % count) + count) % count : Math.max(0, Math.min(count - 1, f));
    if (f === last) return;
    const im = nearest(f);
    if (!im) return;
    last = f;
    // Canvas size = the picture's on-screen size, capped at the image's own pixels.
    const { scale, cx, cy } = layout(W, H, im);
    const w = im.width * scale, h = im.height * scale;
    const k = Math.min(1, im.width / w) * Math.min(devicePixelRatio, 1.5);
    if (canvas.width !== Math.round(W * k)) {
      canvas.width = Math.round(W * k);
      canvas.height = Math.round(H * k);
    }
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = "#050506";
    g.fillRect(0, 0, W, H);
    const x = W * cx - w / 2, y = H * cy - h / 2;
    g.drawImage(im, x, y, w, h);
    // Melt the picture's edges into the page so it has no visible border.
    const band = (gx0, gy0, gx1, gy1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
      gr.addColorStop(0, "#050506");
      gr.addColorStop(1, "rgba(5,5,6,0)");
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    };
    const ex = w * 0.16, ey = h * 0.14;
    if (x > 0) band(x, 0, x + ex, 0, x - 1, 0, ex + 1, H);
    if (x + w < W) band(x + w, 0, x + w - ex, 0, x + w - ex, 0, ex + 1, H);
    if (y > 0) band(0, y, 0, y + ey, 0, y - 1, W, ey + 1);
    if (y + h < H) band(0, y + h, 0, y + h - ey, 0, y + h - ey, W, ey + 1);
  }
  return { start, draw };
}
