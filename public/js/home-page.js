(function () {
  const panelToggle = document.querySelector("[data-home-panel-toggle]");
  const panelToggleIcon = document.querySelector("[data-home-panel-toggle-lottie]");
  const sidebarHomeIcon = document.querySelector("[data-home-sidebar-lottie]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = window.localStorage.getItem("tenderland_token")
    || window.sessionStorage.getItem("tenderland_token");
  let panelToggleAnimation = null;

  function mountPanelToggleAnimation() {
    panelToggleAnimation?.destroy();
    panelToggleIcon.replaceChildren();
    panelToggleIcon.dataset.lottiePath = "/assets/panel-toggle.json";
    panelToggleAnimation = window.TenderlandLottie?.mount(panelToggleIcon, {
      path: "/assets/panel-toggle.json",
      autoplay: false,
      loop: false
    });
    panelToggleAnimation?.goToAndStop(0, true);
  }

  function setPanelCollapsed(isCollapsed) {
    document.body.classList.toggle("is-left-panel-collapsed", isCollapsed);
    panelToggle.setAttribute("aria-expanded", String(!isCollapsed));

    const label = isCollapsed ? "Развернуть левую панель" : "Свернуть левую панель";
    panelToggle.setAttribute("aria-label", label);
    panelToggle.title = label;
  }

  if (panelToggle && panelToggleIcon) {
    mountPanelToggleAnimation();
    panelToggle.addEventListener("click", () => {
      if (!prefersReducedMotion) panelToggleAnimation?.goToAndPlay(0, true);

      const isCollapsed = !document.body.classList.contains("is-left-panel-collapsed");
      setPanelCollapsed(isCollapsed);
    });
  }

  const sidebarHomeAnimation = window.TenderlandLottie?.mount(sidebarHomeIcon, {
    autoplay: !prefersReducedMotion,
    loop: true
  });
  if (prefersReducedMotion) sidebarHomeAnimation?.goToAndStop(0, true);

  function returnToLogin() {
    window.localStorage.removeItem("tenderland_token");
    window.sessionStorage.removeItem("tenderland_token");
    window.location.replace("/");
  }

  if (!token) {
    returnToLogin();
    return;
  }

  fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  })
    .then((response) => {
      if (!response.ok) throw new Error("INVALID_SESSION");
      return response.json();
    })
    .then(() => document.body.classList.add("is-ready"))
    .catch(returnToLogin);
})();
