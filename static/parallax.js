(function () {
  const FACTOR = 0.4;
  const root = document.documentElement;
  let pending = false;

  function update() {
    pending = false;
    const y = window.scrollY || window.pageYOffset || 0;
    root.style.setProperty("--parallax-y", `${-(y * FACTOR).toFixed(1)}px`);
  }

  function setY(y) {
    root.style.setProperty("--parallax-y", `${-(y * FACTOR).toFixed(1)}px`);
  }
  window.__parallax = { setY, syncToWindow: update, FACTOR };

  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("DOMContentLoaded", update);
  update();

  // ============================================================
  // Overscroll-up at top: show MATERIAL logo splash (visual-only)
  // ============================================================
  const THRESHOLD = 240;
  const RESET_IDLE_MS = 250;
  let accum = 0;
  let lastWheelAt = 0;
  let splashing = false;

  function triggerSplash() {
    const splash = document.getElementById("reload-splash");
    if (!splash) return;
    splashing = true;
    accum = 0;
    splash.classList.add("show");
    // Hold the logo on screen, then fade it out.
    setTimeout(() => splash.classList.remove("show"), 900);
    // Re-enable detection only after the fade-out finishes.
    setTimeout(() => { splashing = false; }, 1500);
  }

  window.addEventListener("wheel", (e) => {
    const now = performance.now();
    if (splashing) {
      e.preventDefault();
      return;
    }
    if (now - lastWheelAt > RESET_IDLE_MS) accum = 0;
    lastWheelAt = now;

    const y = window.scrollY || window.pageYOffset || 0;
    if (y <= 0 && e.deltaY < 0) {
      accum += -e.deltaY;
      if (accum >= THRESHOLD) triggerSplash();
    } else if (e.deltaY >= 0) {
      accum = 0;
    }
  }, { passive: false });
})();
