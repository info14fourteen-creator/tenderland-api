(function () {
  const panelToggle = document.querySelector("[data-home-panel-toggle]");
  const panelToggleIcon = document.querySelector("[data-home-panel-toggle-lottie]");
  const sidebarItems = document.querySelectorAll("[data-workspace-route]");
  const searchForm = document.querySelector("[data-workspace-search]");
  const searchInput = searchForm?.querySelector(".workspace-search-input");
  const searchIcon = document.querySelector("[data-workspace-search-lottie]");
  const accountLink = document.querySelector("[data-workspace-account-link]");
  const accountIcon = document.querySelector("[data-workspace-account-lottie]");
  const notificationButton = document.querySelector("[data-workspace-notifications]");
  const notificationIcon = document.querySelector("[data-workspace-notification-lottie]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
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

  sidebarItems.forEach((item) => {
    const isActive = item.dataset.workspaceRoute === currentPath;
    const icon = item.querySelector("[data-workspace-sidebar-lottie]");
    item.classList.toggle("is-active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");

    const animation = window.TenderlandLottie?.mount(icon, {
      autoplay: isActive && !prefersReducedMotion,
      loop: true
    });
    if (!isActive || prefersReducedMotion) animation?.goToAndStop(0, true);
    item.addEventListener("pointerdown", () => {
      if (!prefersReducedMotion) animation?.goToAndPlay(0, true);
    });
  });

  const searchAnimation = window.TenderlandLottie?.mount(searchIcon, {
    autoplay: false,
    loop: false
  });
  searchAnimation?.goToAndStop(0, true);

  const playSearchAnimation = () => {
    if (!prefersReducedMotion) searchAnimation?.goToAndPlay(0, true);
  };
  searchInput?.addEventListener("focus", playSearchAnimation);
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    playSearchAnimation();
  });

  const isAccountActive = currentPath === "/account";
  accountLink?.classList.toggle("is-active", isAccountActive);
  if (isAccountActive) accountLink?.setAttribute("aria-current", "page");

  const accountAnimation = window.TenderlandLottie?.mount(accountIcon, {
    autoplay: isAccountActive && !prefersReducedMotion,
    loop: true
  });
  if (!isAccountActive || prefersReducedMotion) accountAnimation?.goToAndStop(0, true);
  accountLink?.addEventListener("pointerdown", () => {
    if (!prefersReducedMotion) accountAnimation?.goToAndPlay(0, true);
  });

  const notificationAnimation = window.TenderlandLottie?.mount(notificationIcon, {
    autoplay: false,
    loop: false
  });
  notificationAnimation?.goToAndStop(0, true);
  notificationButton?.addEventListener("click", () => {
    if (!prefersReducedMotion) notificationAnimation?.goToAndPlay(0, true);
  });

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
