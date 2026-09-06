/* Progressive, local-only sample playback. Authentication never depends on this. */
(() => {
  "use strict";
  document.querySelectorAll("[data-showcase]").forEach((root) => {
    const answer = root.querySelector("[data-answer]");
    const button = root.querySelector(".kc-ws-pause");
    if (!answer || !button) return;
    const prompt = root.querySelector(".kc-ws-prompt");
    const records = root.querySelector(".kc-ws-result");
    const options = root.querySelector(".kc-ws-options");
    const response = root.querySelector(".kc-ws-response");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 52rem)");
    const steps = Array.from(root.querySelectorAll(".kc-ws-chain li"));
    let paused = false, visible = true, timer = null, elapsed = 0;
    const interval = 100;
    function frame() {
      elapsed = (elapsed + interval) % 20000;
      steps.forEach((step, i) => {
        step.dataset.active = String(i === Math.floor(elapsed / 1600) % steps.length);
      });
    }
    function sync() {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
      const enabled = !reduced.matches && !narrow.matches;
      const running = enabled && !paused && !document.hidden && visible;
      root.dataset.running = String(running);
      button.hidden = !enabled;
      button.setAttribute("aria-pressed", String(paused));
      const label = paused ? "Resume workspace animation" : "Pause workspace animation";
      button.setAttribute("aria-label", label);
      button.title = label;
      if (!enabled) {
        steps.forEach(step => delete step.dataset.active);
      }
      if (running && steps.length) timer = window.setInterval(frame, interval);
    }
    button.addEventListener("click", () => { paused = !paused; sync(); });
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    narrow.addEventListener("change", sync);
    window.addEventListener("pagehide", () => { visible = false; sync(); });
    window.addEventListener("pageshow", () => { visible = true; sync(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(root);
    }
    if (options && prompt && records) {
      const choices = Array.from(options.querySelectorAll("button"));
      choices.forEach(choice => choice.addEventListener("click", () => {
        if (choice.getAttribute("aria-pressed") === "true") return;
        prompt.textContent = choice.dataset.question;
        answer.textContent = choice.dataset.response;
        answer.dataset.answer = choice.dataset.response;
        records.textContent = "Sample records · " + choice.dataset.records;
        choices.forEach(item => item.setAttribute("aria-pressed", String(item === choice)));
        if (response && response.animate && !reduced.matches) {
          response.getAnimations().forEach(animation => animation.cancel());
          response.animate([{ opacity: 0.7 }, { opacity: 1 }], { duration: 160 });
        }
      }));
      options.hidden = false;
    }
    sync();
  });
})();
