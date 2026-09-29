(function (root) {
  "use strict";
  root.CleanThingsPullRefresh = function (options) {
    const surface = options.surface;
    const indicator = options.indicator;
    const status = options.status;
    let start = null;
    let distance = 0;
    let busy = false;
    const threshold = 64;
    function reset() {
      start = null;
      distance = 0;
      if (!busy) {
        indicator.hidden = true;
        indicator.classList.remove("is-ready", "is-loading");
        indicator.style.removeProperty("--pull-progress");
      }
    }
    function atTop() { return (root.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0) <= 0; }
    function canStart(target) {
      if (busy || !atTop() || !options.enabled()) return false;
      if (target.closest("input, textarea, select, button, a, [contenteditable], [role=dialog]")) return false;
      for (let node = target; node && node !== surface; node = node.parentElement) {
        const overflow = root.getComputedStyle(node).overflowY;
        if (/auto|scroll/.test(overflow) && node.scrollHeight > node.clientHeight) return false;
      }
      return true;
    }
    async function refresh() {
      if (busy || !options.enabled()) return;
      busy = true;
      indicator.hidden = false;
      indicator.classList.remove("is-ready");
      indicator.classList.add("is-loading");
      indicator.style.setProperty("--pull-progress", "1");
      status.textContent = "Refreshing…";
      try {
        const result = await options.refresh();
        status.textContent = result === false ? "Refresh could not be completed. Please try again." : "Up to date.";
      } catch (error) {
        status.textContent = "Refresh could not be completed. Please try again.";
      } finally { busy = false; reset(); }
    }
    surface.addEventListener("touchstart", function (event) {
      reset();
      if (event.touches.length !== 1 || !canStart(event.target)) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    surface.addEventListener("touchmove", function (event) {
      if (!start) return;
      if (event.touches.length !== 1 || !atTop() || !options.enabled()) { reset(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (dy < 0 || Math.abs(dx) > Math.max(12, Math.abs(dy))) { reset(); return; }
      if (dy < 10) return;
      event.preventDefault();
      distance = Math.min(88, dy * 0.5);
      indicator.hidden = false;
      indicator.style.setProperty("--pull-progress", String(distance / 88));
      const ready = distance >= threshold;
      indicator.classList.toggle("is-ready", ready);
      const message = ready ? "Release to refresh" : "Pull to refresh";
      if (status.textContent !== message) status.textContent = message;
    }, { passive: false });
    surface.addEventListener("touchend", function (event) {
      const ready = start && distance >= threshold && event.touches.length === 0;
      reset();
      if (ready) refresh();
    }, { passive: true });
    surface.addEventListener("touchcancel", reset, { passive: true });
    return { refresh: refresh, cancel: reset };
  };
})(window);
