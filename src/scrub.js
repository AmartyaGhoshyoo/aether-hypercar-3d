// Scroll-scrubbed video (the Cast & Render method). The mp4 is all-intra (every frame a keyframe),
// downloaded whole into a blob so seeks never wait on the network, and `currentTime` eases toward
// the scroll target instead of snapping — that glide is what makes slow scrolling silky.
export function createScrub({ video, url, onProgress, onReady }) {
  let duration = 0, seekTo = 0, seekAt = 0, ready = false, attached = false;

  function attach(src) {
    if (attached) return;
    attached = true;
    video.addEventListener("loadedmetadata", () => {
      duration = video.duration || 0;
      video.pause();
      seekAt = seekTo;
      try { video.currentTime = seekAt; } catch (e) {}
    });
    const go = () => {
      if (ready) return;
      ready = true;
      onReady?.();
    };
    video.addEventListener("loadeddata", go);
    video.addEventListener("canplaythrough", go);
    video.addEventListener("error", go);
    video.src = src;
    video.load();
    setTimeout(go, 12000); // a stalled decode must never strand the page behind the loader
  }

  // Whole-file download with a real progress number; on any failure, stream the URL instead.
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const bail = setTimeout(() => {
    if (!attached) (ctrl?.abort(), onProgress?.(1), attach(url));
  }, 15000);
  fetch(url, ctrl ? { signal: ctrl.signal } : {})
    .then((res) => {
      if (!res.ok || !res.body) throw new Error("fetch failed");
      const total = +res.headers.get("content-length") || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      return new Promise((resolve, reject) => {
        const pump = () =>
          reader.read().then((r) => {
            if (r.done) return resolve(new Blob(chunks, { type: "video/mp4" }));
            chunks.push(r.value);
            got += r.value.length;
            onProgress?.(total ? got / total : Math.min(got / 15e6, 0.95));
            pump();
          }, reject);
        pump();
      });
    })
    .then((blob) => (clearTimeout(bail), onProgress?.(1), attach(URL.createObjectURL(blob))))
    .catch(() => (clearTimeout(bail), onProgress?.(1), attach(url)));

  // iOS won't paint a frame from a video that has never played: play/pause once on first touch.
  const unlock = () => {
    const p = video.play();
    if (p && p.then) p.then(() => video.pause()).catch(() => {});
    else video.pause();
  };
  ["touchstart", "pointerdown", "wheel", "keydown"].forEach((ev) => addEventListener(ev, unlock, { once: true, passive: true }));

  return {
    /** Call every animation frame with scroll progress 0..1. Returns the current time in seconds. */
    update(p, still = false) {
      if (!duration) return 0;
      seekTo = p * duration;
      const gap = seekTo - seekAt;
      if (Math.abs(gap) > 0.0008) {
        seekAt += still ? gap : gap * 0.115;
        if (video.readyState >= 2 && !video.seeking) {
          try { video.currentTime = seekAt; } catch (e) {}
        }
      }
      return seekAt;
    },
    get duration() { return duration; },
  };
}
