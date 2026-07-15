(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  const menuToggle = document.querySelector("[data-mobile-menu-toggle]");
  const menuLayer = document.querySelector("[data-mobile-menu-layer]");

  document.querySelectorAll("[data-mobile-menu-route]").forEach((item) => {
    const isActive = item.dataset.mobileMenuRoute === currentPath;
    item.classList.toggle("is-active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
  });

  document.querySelectorAll("[data-mobile-nav-route]").forEach((item) => {
    const isActive = item.dataset.mobileNavRoute === currentPath;
    item.classList.toggle("is-active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
  });

  document.querySelectorAll("[data-mobile-nav-lottie]").forEach((target) => {
    const item = target.closest(".mobile-nav-item");
    const animation = window.TenderlandLottie?.mount(target, {
      autoplay: false,
      loop: true
    });

    if (!animation) return;

    let releaseTimer = null;

    const play = () => {
      window.clearTimeout(releaseTimer);
      if (!prefersReducedMotion) animation.goToAndPlay(0, true);
    };

    const stopIfInactive = () => {
      if (item?.classList.contains("is-active")) return;
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => animation.goToAndStop(0, true), 420);
    };

    if (item?.classList.contains("is-active") && !prefersReducedMotion) {
      animation.play();
    } else {
      animation.goToAndStop(0, true);
    }

    item?.addEventListener("pointerdown", play);
    item?.addEventListener("pointerup", stopIfInactive);
    item?.addEventListener("pointercancel", stopIfInactive);
    item?.addEventListener("pointerleave", stopIfInactive);
    item?.addEventListener("focus", play);
    item?.addEventListener("blur", stopIfInactive);
  });

  function setMenuOpen(isOpen) {
    if (!menuToggle || !menuLayer) return;
    menuLayer.hidden = !isOpen;
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.classList.toggle("is-active", isOpen);
    document.body.classList.toggle("is-mobile-menu-open", isOpen);
    if (isOpen) menuLayer.querySelector("a")?.focus();
  }

  menuToggle?.addEventListener("click", () => {
    setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
  });

  document.querySelectorAll("[data-mobile-menu-close]").forEach((button) => {
    button.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menuLayer?.hidden) return;
    setMenuOpen(false);
    menuToggle?.focus();
  });
})();
