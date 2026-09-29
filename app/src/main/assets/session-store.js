(function (root) {
  "use strict";
  const LEGACY_KEY = "cleanthings.supabase.session.v1";
  const nativeRequired = !!(root.location && root.location.origin === "https://appassets.androidplatform.net");
  const bridge = root.CleanThingsNativeSession;
  let initialised = false;
  let cached = null;
  let warning = "";
  let failed = false;
  const loginBridge = root.CleanThingsNativeLogin;
  let pendingLogin = null;
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
      if (error.code === 'legacy_lock') { cached = null; removeLegacy(); warning = error.message; return; }
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
    cancelSavedLogin();
    let error = null;
    try { removeLegacy(); } catch (failure) { error = failure; }
    try { if (nativeRequired) nativeCall("clear"); } catch (failure) { error = failure; }
    failed = !!error;
    warning = error ? "Saved sign-in could not be fully removed. Restart the app and sign out again." : "";
    if (error) throw new Error(warning);
  }
  function status() {
    initialise();
    return { encrypted: nativeRequired && !failed, persistent: nativeRequired && !failed, warning: warning, biometric: savedLoginStatus(),
      message: warning || (nativeRequired ? "Your saved sign-in is encrypted on this device." : "This browser preview keeps your sign-in only until this page closes or reloads.") };
  }
  function loginCall(method, args) {
    if (!nativeRequired || !loginBridge || typeof loginBridge[method] !== 'function') throw new Error('Biometric sign-in requires the updated Android app.');
    const result = JSON.parse(loginBridge[method].apply(loginBridge, args || []));
    if (!result || result.ok !== true) throw new Error(result && result.error || 'Saved login is unavailable.');
    return result.value;
  }
  function savedLoginStatus() {
    if (!nativeRequired || !loginBridge) return {available:false,enabled:false,reason:'Biometric sign-in is available in the Android app.'};
    try {
      const value = loginCall('status');
      if (!value || typeof value.available !== 'boolean' || typeof value.enabled !== 'boolean') throw new Error('Invalid status');
      return value;
    } catch (error) { return {available:false,enabled:true,reason:'Saved login is unavailable. Use your password or forget the saved login.'}; }
  }
  function cancelSavedLogin() {
    if (pendingLogin) pendingLogin.finish(new Error('Biometric sign-in cancelled.'));
    if (nativeRequired && loginBridge) { try { loginCall('cancel'); } catch (ignored) { /* Session clearing must still proceed. */ } }
  }
  function forgetSavedLogin() { cancelSavedLogin(); loginCall('forget'); }
  function savedLoginRequest(action, credentials) {
    if (!nativeRequired || !loginBridge) return Promise.reject(new Error('Biometric sign-in requires the Android app.'));
    if (pendingLogin) return Promise.reject(new Error('Biometric verification is already open.'));
    const id = 'login-' + Date.now() + '-' + (++requestSequence);
    return new Promise(function (resolve, reject) {
      let timer;
      function finish(error) {
        if (!pendingLogin || pendingLogin.id !== id) return;
        pendingLogin = null; clearTimeout(timer); root.removeEventListener('cleanthings:biometric-result', receive);
        if (error) { reject(error); return; }
        try {
          if (action === 'save') {
            if (!savedLoginStatus().enabled) throw new Error('Your login was not saved.');
            resolve(null);
          } else {
            // Native result is one-use and available only after actual biometric cryptography.
            const login = JSON.parse(loginCall('take', [id]));
            if (!login || login.kind !== 'saved-login-v1' || !login.email || !login.password || !login.userId) throw new Error('Saved login is invalid. Use your password.');
            resolve(login);
          }
        } catch (failure) { reject(failure); }
      }
      function receive(event) {
        const data = event.detail;
        if (!data || data.id !== id) return;
        finish(data.result && data.result.ok === true ? null : new Error(data.result && data.result.error || 'Biometric sign-in was not completed.'));
      }
      pendingLogin = {id:id,finish:finish}; root.addEventListener('cleanthings:biometric-result', receive);
      timer = setTimeout(function () { cancelSavedLogin(); }, 90000);
      try {
        loginCall(action, action === 'save' ? [JSON.stringify(Object.assign({kind:'saved-login-v1'},credentials)),id] : [id]);
      } catch (error) { finish(error); }
      credentials = null;
    });
  }
  // Browser previews never persist tokens or saved account credentials.
  root.CleanThingsSessionStore = Object.freeze({ read:read, write:write, clear:clear, status:status,
    saveLogin:function (credentials) { return savedLoginRequest('save', credentials); },
    useSavedLogin:function () { return savedLoginRequest('use'); },
    cancelSavedLogin:cancelSavedLogin, forgetSavedLogin:forgetSavedLogin });
})(window);
