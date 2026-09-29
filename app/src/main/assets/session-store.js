(function (root) {
  "use strict";
  const LEGACY_KEY = "cleanthings.supabase.session.v1";
  const nativeRequired = !!(root.location && root.location.origin === "https://appassets.androidplatform.net");
  const bridge = root.CleanThingsNativeSession;
  let initialised = false;
  let cached = null;
  let warning = "";
  let failed = false;

  function nativeCall(method, value) {
    if (!bridge || typeof bridge[method] !== "function") throw new Error("Secure sign-in storage is unavailable. Restart the app and try again.");
    const result = JSON.parse(value === undefined ? bridge[method]() : bridge[method](value));
    if (!result || result.ok !== true) throw new Error("Secure sign-in storage is unavailable. Restart the app and try again.");
    return result.value;
  }
  function removeLegacy() { localStorage.removeItem(LEGACY_KEY); }
  function valid(value) {
    return value && typeof value === "object" && value.user && typeof value.user.id === "string";
  }
  function initialise() {
    if (initialised) return;
    initialised = true;
    try {
      const saved = nativeRequired ? nativeCall("read") : null;
      if (saved) {
        const value = JSON.parse(saved);
        if (!valid(value)) throw new Error("Saved sign-in could not be read. Please sign in again.");
        cached = value;
        removeLegacy();
        return;
      }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return;
      let value;
      try { value = JSON.parse(legacy); } catch (error) { removeLegacy(); return; }
      if (!valid(value)) { removeLegacy(); return; }
      if (nativeRequired) nativeCall("write", JSON.stringify(value));
      // Erase the old plaintext only after the encrypted write acknowledges success.
      removeLegacy();
      cached = value;
    } catch (error) {
      cached = null; failed = true;
      warning = "Saved sign-in could not be secured. Restart the app or sign in again.";
    }
  }
  function read() { initialise(); return cached; }
  function write(value) {
    initialise();
    try {
      if (nativeRequired) nativeCall("write", JSON.stringify(value));
      removeLegacy();
      cached = value; failed = false; warning = "";
    } catch (error) {
      cached = null; failed = true;
      warning = "Your sign-in could not be saved securely. Restart the app and sign in again.";
      // Prevent a previous account from reappearing after an unsuccessful account switch.
      try { if (nativeRequired) nativeCall("clear"); } catch (ignored) { /* Warning remains visible. */ }
      throw new Error(warning);
    }
  }
  function clear() {
    initialised = true; cached = null;
    let error = null;
    try { removeLegacy(); } catch (failure) { error = failure; }
    try { if (nativeRequired) nativeCall("clear"); } catch (failure) { error = failure; }
    failed = !!error;
    warning = error ? "Saved sign-in could not be fully removed. Restart the app and sign out again." : "";
    if (error) throw new Error(warning);
  }
  function status() {
    initialise();
    return { encrypted: nativeRequired && !failed, persistent: nativeRequired && !failed, warning: warning,
      message: warning || (nativeRequired ? "Your saved sign-in is encrypted on this device." : "This browser preview keeps your sign-in only until this page closes or reloads.") };
  }
  // Browser previews deliberately keep tokens in memory; there is no plaintext persistence fallback.
  root.CleanThingsSessionStore = Object.freeze({ read: read, write: write, clear: clear, status: status });
})(window);
