(function () {
  const panelToggle = document.querySelector("[data-home-panel-toggle]");
  const panelToggleIcon = document.querySelector("[data-home-panel-toggle-lottie]");
  const sidebarHomeIcon = document.querySelector("[data-home-sidebar-lottie]");
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

  const sidebarHomeItem = sidebarHomeIcon?.closest("[data-workspace-route]");
  const isHomeActive = currentPath === "/home";
  sidebarHomeItem?.classList.toggle("is-active", isHomeActive);
  if (isHomeActive) sidebarHomeItem?.setAttribute("aria-current", "page");

  const sidebarHomeAnimation = window.TenderlandLottie?.mount(sidebarHomeIcon, {
    autoplay: isHomeActive && !prefersReducedMotion,
    loop: true
  });
  if (!isHomeActive || prefersReducedMotion) sidebarHomeAnimation?.goToAndStop(0, true);
  sidebarHomeItem?.addEventListener("pointerdown", () => {
    if (!prefersReducedMotion) sidebarHomeAnimation?.goToAndPlay(0, true);
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
