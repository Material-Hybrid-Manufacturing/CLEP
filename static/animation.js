(function () {
  "use strict";

  const T = {
    SHOW_LINES: 80,
    FADE_REST: 1400,
    CONDENSE: 2100,
    HEADER_AT: 2400,
    REFLOW: 2900,
    APP_AT: 3000,
    DONE_AT: 3500,
  };

  const boot = document.getElementById("boot");
  const stack = document.getElementById("boot-stack");
  const header = document.getElementById("app-header");
  const main = document.getElementById("app-main");
  const forLine = stack ? stack.querySelector(".boot-line.for") : null;

  function showHeaderAndApp() {
    header.classList.remove("hidden-on-boot");
    header.classList.add("visible");
    main.classList.remove("hidden-on-boot");
    main.classList.add("visible");
    requestAnimationFrame(() => main.classList.add("shown"));
  }

  function skip() {
    if (boot) boot.classList.add("boot-removed");
    showHeaderAndApp();
    document.dispatchEvent(new CustomEvent("clep:booted"));
  }

  if (sessionStorage.getItem("clep_booted") === "1" || !stack) {
    skip();
    return;
  }

  setTimeout(() => stack.classList.add("visible"), T.SHOW_LINES);

  setTimeout(() => {
    stack.querySelectorAll(".rest").forEach((el) => el.classList.add("fade"));
    if (forLine) forLine.classList.add("gone");
  }, T.FADE_REST);

  // Remove the "for" row from the layout once it's faded so the remaining
  // four letters reposition tightly without an empty gap.
  setTimeout(() => {
    if (forLine) forLine.style.display = "none";
  }, T.FADE_REST + 600);

  function measureBrandRect() {
    if (!header) return null;
    const wasHidden = header.classList.contains("hidden-on-boot");
    const prevVis = header.style.visibility;
    const prevOp = header.style.opacity;
    header.classList.remove("hidden-on-boot");
    header.style.visibility = "hidden";
    header.style.opacity = "0";
    const brand = header.querySelector(".brand");
    const rect = brand ? brand.getBoundingClientRect() : null;
    header.style.visibility = prevVis;
    header.style.opacity = prevOp;
    if (wasHidden) header.classList.add("hidden-on-boot");
    return rect;
  }

  function measureCondensedStackRect() {
    const savedTransition = stack.style.transition;
    stack.style.transition = "none";
    stack.classList.add("condensed");
    void stack.offsetHeight;
    const rect = stack.getBoundingClientRect();
    stack.classList.remove("condensed");
    void stack.offsetHeight;
    stack.style.transition = savedTransition;
    return rect;
  }

  setTimeout(() => {
    const brandRect = measureBrandRect();
    if (brandRect) {
      const condensedRect = measureCondensedStackRect();
      const tx = brandRect.left - condensedRect.left;
      const ty = brandRect.top - condensedRect.top;
      stack.style.transform = `translate(${tx}px, ${ty}px)`;
    }
    stack.classList.add("condensed");
  }, T.CONDENSE);

  setTimeout(() => {
    header.classList.remove("hidden-on-boot");
    header.classList.add("visible");
  }, T.HEADER_AT);

  setTimeout(() => {
    main.classList.remove("hidden-on-boot");
    main.classList.add("visible");
    requestAnimationFrame(() => main.classList.add("shown"));
  }, T.APP_AT);

  setTimeout(() => {
    boot.classList.add("boot-done");
    setTimeout(() => boot.classList.add("boot-removed"), 500);
    sessionStorage.setItem("clep_booted", "1");
    document.dispatchEvent(new CustomEvent("clep:booted"));
  }, T.DONE_AT);
})();
