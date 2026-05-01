(function () {
  const FACTOR = 0.4;
  const root = document.documentElement;
  let pending = false;

  function update() {
    pending = false;
    const y = window.scrollY || window.pageYOffset || 0;
    root.style.setProperty("--parallax-y", `${-(y * FACTOR).toFixed(1)}px`);
  }

  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("DOMContentLoaded", update);
  update();
})();
