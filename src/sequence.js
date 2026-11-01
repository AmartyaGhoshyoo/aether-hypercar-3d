// An image sequence on a canvas: frames rendered in Blender, one picture per step. Call
// `draw(position)` with a frame position (it may be fractional); the nearest loaded frame is shown,
// fitted to the screen, with its edges melted into the render's own background colour.
export function createSequence({ canvas, dir, prefix, count, onProgress, layout }) {
  const g = canvas.getContext("2d");
  const imgs = new Array(count);
  let loaded = 0, bg = "", W = 0, H = 0, dpr = 1;

  const url = (i) => `${dir}/${prefix}${String(i).padStart(3, "0")}.webp`;
  const start = () => {
    // Every 8th frame first, then the gaps: the motion is usable before everything has arrived.
    const order = [];
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < count; i += step) if (!order.includes(i)) order.push(i);
    order.forEach((i) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => ((imgs[i] = im), onProgress?.(++loaded / count));
      im.onerror = () => onProgress?.(++loaded / count);
      im.src = url(i);
    });
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
    dpr = Math.min(devicePixelRatio, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  };
  resize();
  addEventListener("resize", resize);

  /** Where the picture sits on screen: {x, y, w, h} in CSS pixels (useful for labels). */
  let rect = { x: 0, y: 0, w: 0, h: 0 };
  function draw(pos, nudge = { x: 0, y: 0 }) {
    const im = nearest(Math.round(pos));
    if (!im) return rect;
    const { scale, cx, cy } = layout(W, H, im);
    const w = im.width * scale, h = im.height * scale;
    const x = W * cx - w / 2 - nudge.x * 18, y = H * cy - h / 2 - nudge.y * 10;
    rect = { x, y, w, h };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!bg) {
      // Read the render's background colour once from a corner pixel.
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const cg = c.getContext("2d");
      cg.drawImage(im, 2, 2, 1, 1, 0, 0, 1, 1);
      const d = cg.getImageData(0, 0, 1, 1).data;
      bg = `rgb(${d[0]},${d[1]},${d[2]})`;
      canvas.parentElement.style.background = bg;
    }
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.drawImage(im, x, y, w, h);
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, bg);
      gr.addColorStop(1, bg.replace("rgb", "rgba").replace(")", ",0)"));
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    };
    const ex = w * 0.14, ey = h * 0.16;
    fade(x, 0, x + ex, 0, x - 1, y - 1, ex, h + 2);
    fade(x + w, 0, x + w - ex, 0, x + w - ex + 1, y - 1, ex, h + 2);
    fade(0, y, 0, y + ey, x - 1, y - 1, w + 2, ey);
    fade(0, y + h, 0, y + h - ey, x - 1, y + h - ey + 1, w + 2, ey);
    return rect;
  }
  return { start, draw, get rect() { return rect; } };
}
