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

  function draw(pos) {
    const f = Math.max(0, Math.min(count - 1, Math.round(pos)));
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
    g.drawImage(im, W * cx - w / 2, H * cy - h / 2, w, h);
  }
  return { start, draw };
}
