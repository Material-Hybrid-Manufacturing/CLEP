(function () {
  const FACTOR = 0.25;
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

  function syncHeaderHeight() {
    const h = document.getElementById("app-header");
    if (!h) return;
    root.style.setProperty("--app-header-h", `${h.offsetHeight}px`);
  }
  window.addEventListener("load", syncHeaderHeight);
  window.addEventListener("resize", syncHeaderHeight);
  document.addEventListener("DOMContentLoaded", syncHeaderHeight);

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
  // Overscroll-up at top: show MATERIAL logo splash (touch-only)
  // Triggers only on a real overscroll gesture (e.g. iPad swipe-down at
  // the very top of the page). Mouse-wheel input is ignored so a desktop
  // user can't accidentally summon it.
  // ============================================================
  const THRESHOLD = 90;
  let touchStartY = null;
  let touchPulled = 0;
  let splashing = false;

  function triggerSplash() {
    const splash = document.getElementById("reload-splash");
    if (!splash) return;
    splashing = true;
    splash.classList.add("show");
    setTimeout(() => splash.classList.remove("show"), 300);
    setTimeout(() => { splashing = false; }, 700);
  }

  window.addEventListener("touchstart", (e) => {
    if (splashing) return;
    if (document.body.classList.contains("dialog-open")) return;
    if (!e.touches || e.touches.length !== 1) {
      touchStartY = null;
      return;
    }
    const y = window.scrollY || window.pageYOffset || 0;
    touchStartY = y <= 0 ? e.touches[0].clientY : null;
    touchPulled = 0;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (splashing || touchStartY === null) return;
    if (document.body.classList.contains("dialog-open")) return;
    const y = window.scrollY || window.pageYOffset || 0;
    if (y > 0) { touchStartY = null; return; }
    touchPulled = e.touches[0].clientY - touchStartY;
    if (touchPulled >= THRESHOLD) {
      triggerSplash();
      touchStartY = null;
    }
  }, { passive: true });

  window.addEventListener("touchend", () => {
    touchStartY = null;
    touchPulled = 0;
  }, { passive: true });
})();
