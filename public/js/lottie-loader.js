(function () {
  function mountLottie(target, options = {}) {
    if (!window.lottie || !target) return null;

    const animation = window.lottie.loadAnimation({
      container: target,
      renderer: "svg",
      loop: options.loop ?? true,
      autoplay: options.autoplay ?? true,
      path: options.path || target.dataset.lottiePath
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animation.goToAndStop(0, true);
    }

    return animation;
  }

  function mountAll(root = document) {
    return Array.from(root.querySelectorAll("[data-lottie-path]")).map((target) =>
      mountLottie(target)
    );
  }

  window.TenderlandLottie = { mount: mountLottie, mountAll };
})();
