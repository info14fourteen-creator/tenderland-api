(function () {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const status = document.querySelector(".auth-status");
  const tabs = Array.from(document.querySelectorAll("[data-auth-mode]"));
  const panels = Array.from(document.querySelectorAll("[data-auth-panel]"));
  const loginForm = document.querySelector('[data-auth-panel="login"]');
  const registerForm = document.querySelector('[data-auth-panel="register"]');
  const forgotButton = document.querySelector("[data-forgot-password]");
  const cornerAnimations = new Map();

  function syncCornerAnimation(mode) {
    cornerAnimations.forEach(({ animation, target }, animationMode) => {
      const isActive = animationMode === mode;
      target.classList.toggle("is-active", isActive);

      if (isActive) {
        animation.play();
      } else {
        animation.goToAndStop(0, true);
      }
    });
  }

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

    syncCornerAnimation(mode);
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

  document.querySelectorAll("[data-auth-corner-lottie]").forEach((target) => {
    const animation = window.TenderlandLottie?.mount(target, {
      autoplay: false,
      loop: true
    });

    if (animation) {
      cornerAnimations.set(target.dataset.authCornerLottie, { animation, target });
    }
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
    const password = String(formData.get("password") || "");
    const passwordConfirm = String(formData.get("passwordConfirm") || "");
    const inviteCode = String(formData.get("inviteCode") || "").trim();

    if (!emailPattern.test(email)) {
      setStatus("Введите корректную почту.", true);
      return;
    }

    if (password.length < 8) {
      setStatus("Пароль должен быть не короче 8 символов.", true);
      return;
    }

    if (password !== passwordConfirm) {
      setStatus("Пароли не совпадают.", true);
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
        password,
        passwordConfirm,
        inviteCode
      });

      storeSession(payload.token, true);
      setStatus("Регистрация выполнена.");
    } catch (error) {
      const message = {
        INVALID_INVITATION: "Код приглашения недействителен.",
        USER_EMAIL_EXISTS: "Эта почта уже зарегистрирована."
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
