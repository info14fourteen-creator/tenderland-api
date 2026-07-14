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

  window.TenderlandLottie = { mount: mountLottie };
})();
