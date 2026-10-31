// The lap: a closed circuit drawn by scroll. Time, not distance, follows the scroll — the car
// spends longer in tight corners (speed = 1 / (1 + 9 · turn)), so the line brakes into each
// bend and fires out of it. The head glows hot, the drawn line cools behind it.

// A made-up 20.8 km circuit: hand-placed control points, smoothed with Catmull-Rom.
const CTRL = [
  [0.08, 0.62], [0.2, 0.7], [0.33, 0.66], [0.38, 0.52], [0.47, 0.46], [0.58, 0.55], [0.66, 0.7], [0.8, 0.72],
  [0.9, 0.6], [0.88, 0.42], [0.78, 0.36], [0.74, 0.22], [0.62, 0.16], [0.5, 0.24], [0.42, 0.18], [0.3, 0.2],
  [0.2, 0.3], [0.24, 0.42], [0.14, 0.48],
];
const LAP_S = 6 * 60 + 41.83;

function catmull(points, perSeg = 60) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  return out;
}

export function createLap(canvas, hud) {
  const g = canvas.getContext("2d");
  const pts = catmull(CTRL);
  const N = pts.length;
  // Turn per sample → speed → time; cumulative time maps scroll to position.
  const turn = pts.map((p, i) => {
    const a = pts[(i - 2 + N) % N], b = pts[(i + 2) % N];
    const a1 = Math.atan2(p[1] - a[1], p[0] - a[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  });
  const sm = turn.map((_, i) => {
    let s = 0;
    for (let k = -6; k <= 6; k++) s += turn[(i + k + N) % N];
    return s / 13;
  });
  const speed = sm.map((t) => 1 / (1 + 9 * t * 6));
  const T = [0];
  for (let i = 1; i < N; i++) {
    const ds = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    T.push(T[i - 1] + ds / speed[i]);
  }
  const total = T[N - 1];
  const vmin = Math.min(...speed), vmax = Math.max(...speed);

  let W = 0, H = 0, dpr = 1, box = { x: 0, y: 0, s: 1 };
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const s = Math.min(W * 0.92, H * 1.25);
    box = { x: (W - s) / 2 + (W > 900 ? W * 0.08 : 0), y: (H - s * 0.85) / 2, s };
  };
  resize();
  addEventListener("resize", resize);
  const X = (p) => box.x + p[0] * box.s, Y = (p) => box.y + p[1] * box.s * 0.85;

  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
  let lastIdx = -1;

  return {
    update(p) {
      const time = Math.max(0, Math.min(1, p)) * total;
      let idx = 0;
      while (idx < N - 1 && T[idx + 1] <= time) idx++;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      // The whole circuit, faint, with sector ticks.
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "rgba(238,243,245,0.1)";
      g.lineWidth = 10;
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(X(q), Y(q)) : g.moveTo(X(q), Y(q))));
      g.closePath();
      g.stroke();
      [0, Math.floor(N / 3), Math.floor((2 * N) / 3)].forEach((i, k) => {
        g.fillStyle = "rgba(238,243,245,0.5)";
        g.font = "500 11px JetBrains Mono, monospace";
        g.fillText(`S${k + 1}`, X(pts[i]) + 10, Y(pts[i]) - 10);
      });
      // Driven part: cools from white-hot at the head to violet behind it.
      if (idx > 1) {
        const tail = 260;
        for (let i = 1; i <= idx; i++) {
          const age = idx - i;
          const heat = Math.max(0, 1 - age / tail);
          g.strokeStyle = heat > 0 ? `rgba(${155 + heat * 100},${92 + heat * 150},255,${0.55 + heat * 0.45})` : "rgba(155,92,255,0.55)";
          g.lineWidth = 3 + heat * 3;
          g.beginPath();
          g.moveTo(X(pts[i - 1]), Y(pts[i - 1]));
          g.lineTo(X(pts[i]), Y(pts[i]));
          g.stroke();
        }
        // Head: additive glow + spark.
        const hx = X(pts[idx]), hy = Y(pts[idx]);
        g.globalCompositeOperation = "lighter";
        const grd = g.createRadialGradient(hx, hy, 0, hx, hy, 46);
        grd.addColorStop(0, "rgba(255,255,255,0.95)");
        grd.addColorStop(0.2, "rgba(196,166,255,0.6)");
        grd.addColorStop(1, "rgba(155,92,255,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(hx, hy, 46, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = "source-over";
      }
      if (idx !== lastIdx) {
        lastIdx = idx;
        const v = (speed[idx] - vmin) / (vmax - vmin);
        hud.time.textContent = fmt((time / total) * LAP_S);
        hud.speed.textContent = String(Math.round(92 + v * 238));
        hud.sector.textContent = `S${Math.min(3, Math.floor((idx / N) * 3) + 1)}`;
        hud.batt.textContent = String(Math.round(100 - (time / total) * 27));
      }
    },
  };
}
