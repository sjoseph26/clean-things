(function (root) {
  "use strict";
  const LEGACY_KEY = "cleanthings.supabase.session.v1";
  const nativeRequired = !!(root.location && root.location.origin === "https://appassets.androidplatform.net");
  const bridge = root.CleanThingsNativeSession;
  let initialised = false;
  let cached = null;
  let warning = "";
  let failed = false;
  let locked = false;
  let pendingBiometric = null;
  let requestSequence = 0;

  function nativeCall(method, value) {
    if (!bridge || typeof bridge[method] !== "function") throw new Error("Secure sign-in storage is unavailable. Restart the app and try again.");
    const result = JSON.parse(value === undefined ? bridge[method]() : bridge[method](value));
    if (!result || result.ok !== true) {
      const error = new Error(result && result.error || "Secure sign-in storage is unavailable. Restart the app and try again.");
      error.code = result && result.code; throw error;
    }
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
      if (error.code === "locked") { cached = null; locked = true; removeLegacy(); return; }
      cached = null; failed = true;
      warning = "Saved sign-in could not be secured. Restart the app or sign in again.";
    }
  }
  function read() {
    initialise();
    if (nativeRequired && bridge && typeof bridge.biometricStatus === "function" && biometricStatus().locked) { cached = null; locked = true; }
    return cached;
  }
  function write(value) {
    initialise();
    try {
      if (nativeRequired) nativeCall("write", JSON.stringify(value));
      removeLegacy();
      cached = value; failed = false; warning = "";
    } catch (error) {
      if (error.code === "locked" || error.code === "busy") {
        if (error.code === "locked") { cached = null; locked = true; }
        throw error; // Never delete a protected session because a write was refused.
      }
      cached = null; failed = true;
      warning = "Your sign-in could not be saved securely. Restart the app and sign in again.";
      // Prevent a previous account from reappearing after an unsuccessful account switch.
      try { if (nativeRequired) nativeCall("clear"); } catch (ignored) { /* Warning remains visible. */ }
      throw new Error(warning);
    }
  }
  function clear() {
    initialised = true; cached = null;
    if (pendingBiometric) pendingBiometric.finish(new Error("Verification cancelled."));
    let error = null;
    try { removeLegacy(); } catch (failure) { error = failure; }
    try { if (nativeRequired) nativeCall("clear"); } catch (failure) { error = failure; }
    failed = !!error;
    warning = error ? "Saved sign-in could not be fully removed. Restart the app and sign out again." : "";
    if (error) throw new Error(warning);
    locked = false;
  }
  function biometricStatus() {
    if (!nativeRequired) return { available: false, enabled: false, locked: false, reason: "Biometric unlock is available in the Android app." };
    if (!bridge || typeof bridge.biometricStatus !== "function") return { available: false, enabled: false, locked: locked, reason: "Update the Android app to use biometric unlock." };
    try {
      const value = nativeCall("biometricStatus");
      if (!value || typeof value.enabled !== "boolean" || typeof value.locked !== "boolean" || typeof value.available !== "boolean") throw new Error("Invalid status");
      return value;
    } catch (error) { return { available: false, enabled: true, locked: true, reason: "Saved sign-in is unavailable. Use password sign-in to reset it." }; }
  }
  function biometric(action) {
    initialise();
    if (!nativeRequired || !bridge || typeof bridge.biometric !== "function") return Promise.reject(new Error("Biometric unlock requires the Android app."));
    if (!["enable", "unlock", "disable"].includes(action)) return Promise.reject(new Error("Unknown biometric action."));
    if (pendingBiometric) return Promise.reject(new Error("Biometric verification is already open."));
    const id = "bio-" + Date.now() + "-" + (++requestSequence);
    return new Promise(function (resolve, reject) {
      let timer;
      function finish(error) {
        if (!pendingBiometric || pendingBiometric.id !== id) return;
        pendingBiometric = null; clearTimeout(timer);
        root.removeEventListener("cleanthings:biometric-result", receive);
        if (error) { reject(error); return; }
        initialised = false; cached = null; locked = false; failed = false; warning = "";
        initialise();
        const result = biometricStatus();
        if (result.locked || (action !== "disable" && !result.enabled) || (action === "disable" && result.enabled) || !cached) {
          reject(new Error("Saved sign-in could not be unlocked. Use password sign-in.")); return;
        }
        resolve(result);
      }
      function receive(event) {
        const data = event.detail;
        if (!data || data.id !== id) return;
        finish(data.result && data.result.ok === true ? null : new Error(data.result && data.result.error || "Biometric verification was not completed."));
      }
      pendingBiometric = { id: id, finish: finish };
      root.addEventListener("cleanthings:biometric-result", receive);
      timer = setTimeout(function () {
        try { nativeCall("cancelBiometric"); } catch (ignored) { /* Stay locked on failure. */ }
        finish(new Error("Verification timed out. Try again."));
      }, 90000);
      try {
        const result = JSON.parse(bridge.biometric(action, id));
        if (!result || result.ok !== true) finish(new Error(result && result.error || "Biometric verification could not start."));
      } catch (error) { finish(error); }
    });
  }
  function status() {
    initialise();
    const biometric = biometricStatus();
    return { encrypted: nativeRequired && !failed, persistent: nativeRequired && !failed, warning: warning,
      biometric: biometric,
      message: warning || (nativeRequired ? "Your saved sign-in is encrypted on this device." : "This browser preview keeps your sign-in only until this page closes or reloads.") };
  }
  function lock() {
    if (!nativeRequired || !biometricStatus().enabled) throw new Error("Enable biometric unlock first.");
    if (pendingBiometric) pendingBiometric.finish(new Error("Verification cancelled."));
    nativeCall("cancelBiometric"); cached = null; locked = true; initialised = true;
  }
  // Browser previews deliberately keep tokens in memory; there is no plaintext persistence fallback.
  root.CleanThingsSessionStore = Object.freeze({ read: read, write: write, clear: clear, status: status, biometric: biometric, lock: lock });
})(window);
