(function () {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const status = document.querySelector(".auth-status");
  const tabs = Array.from(document.querySelectorAll("[data-auth-mode]"));
  const panels = Array.from(document.querySelectorAll("[data-auth-panel]"));
  const loginForm = document.querySelector('[data-auth-panel="login"]');
  const registerForm = document.querySelector('[data-auth-panel="register"]');
  const forgotButton = document.querySelector("[data-forgot-password]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function setLoading(form, isLoading) {
    const button = form.querySelector(".primary-button");
    button.disabled = isLoading;
  }

  function setMode(mode) {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.authMode === mode;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.authPanel !== mode);
    });

    setStatus("");
  }

  async function requestJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "REQUEST_FAILED");
    }

    return payload;
  }

  function storeSession(token, remember) {
    const storage = remember ? window.localStorage : window.sessionStorage;
    storage.setItem("tenderland_token", token);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.authMode));
  });

  document.querySelectorAll("[data-mobile-nav-lottie]").forEach((target) => {
    const item = target.closest(".mobile-nav-item");
    const isActive = item?.classList.contains("is-active");
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
      if (isActive) return;
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => animation.goToAndStop(0, true), 420);
    };

    if (isActive && !prefersReducedMotion) {
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

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    if (!emailPattern.test(email)) {
      setStatus("Введите корректную почту.", true);
      return;
    }

    setLoading(loginForm, true);

    try {
      const payload = await requestJson("/api/auth/login", { email, password });
      storeSession(payload.token, formData.get("remember") === "on");
      setStatus("Вход выполнен.");
    } catch (error) {
      setStatus(error.message === "INVALID_CREDENTIALS" ? "Неверная почта или пароль." : "Не удалось войти.", true);
    } finally {
      setLoading(loginForm, false);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const inviteCode = String(formData.get("inviteCode") || "").trim();

    if (!emailPattern.test(email)) {
      setStatus("Введите корректную почту.", true);
      return;
    }

    if (!inviteCode) {
      setStatus("Нужен код приглашения.", true);
      return;
    }

    setLoading(registerForm, true);

    try {
      const payload = await requestJson("/api/auth/register", {
        email,
        inviteCode
      });

      setStatus(payload.passwordDelivery === "email" ? "Пароль отправлен на почту." : "Регистрация выполнена.");
    } catch (error) {
      const message = {
        INVALID_INVITATION: "Код приглашения недействителен.",
        USER_EMAIL_EXISTS: "Эта почта уже зарегистрирована.",
        MAIL_NOT_CONFIGURED: "Отправка почты ещё не настроена.",
        MAIL_DELIVERY_FAILED: "Не удалось отправить письмо с паролем."
      }[error.message] || "Не удалось зарегистрироваться.";

      setStatus(message, true);
    } finally {
      setLoading(registerForm, false);
    }
  });

  forgotButton.addEventListener("click", async () => {
    const email = String(new FormData(loginForm).get("email") || "").trim().toLowerCase();

    if (!emailPattern.test(email)) {
      setStatus("Введите почту, чтобы восстановить пароль.", true);
      return;
    }

    try {
      await requestJson("/api/auth/forgot-password", { email });
      setStatus("Если почта есть в базе, мы подготовим восстановление.");
    } catch (_error) {
      setStatus("Введите корректную почту.", true);
    }
  });

  setMode("login");
})();
