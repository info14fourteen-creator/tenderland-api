(function () {
  const token = window.localStorage.getItem("tenderland_token")
    || window.sessionStorage.getItem("tenderland_token");

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
