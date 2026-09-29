(function (root) {
  "use strict";

  const config = root.CLEAN_THINGS_CONFIG || {};
  const sessionStore = root.CleanThingsSessionStore;
  let refreshPromise = null;
  let refreshGeneration = -1;
  let sessionGeneration = 0;
  const AUTH_RETRY_KEY = "cleanthings.auth.retry.v1";
  let authRetryUntil = {};
  try {
    const saved = JSON.parse(root.sessionStorage.getItem(AUTH_RETRY_KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) authRetryUntil = saved;
  } catch (error) { /* Storage may be unavailable. */ }

  // A usability backoff only. Supabase enforces the actual rate limit, including
  // requests made outside this app. Never store emails, passwords or tokens here.
  function authRetrySeconds(action) {
    const until = Number(authRetryUntil[action]);
    return Number.isFinite(until) ? Math.max(0, Math.min(86400, Math.ceil((until - Date.now()) / 1000))) : 0;
  }

  function setAuthRetry(action, seconds) {
    authRetryUntil[action] = Date.now() + Math.max(1, Math.min(86400, seconds)) * 1000;
    try { root.sessionStorage.setItem(AUTH_RETRY_KEY, JSON.stringify(authRetryUntil)); } catch (error) { /* In-memory fallback. */ }
  }

  function retryError(seconds) {
    const error = new Error("Too many attempts. Wait " + seconds + " seconds, then try again.");
    error.status = 429; error.retryAfterSeconds = seconds;
    return error;
  }

  async function authRequest(action, path, body) {
    const remaining = authRetrySeconds(action);
    if (remaining) throw retryError(remaining);
    try {
      return await request(path, { method: "POST", skipRefresh: true,
        headers: { Authorization: "Bearer " + config.supabasePublishableKey },
        body: JSON.stringify(body) });
    } catch (error) {
      if (error.status === 429) {
        setAuthRetry(action, error.retryAfterSeconds || 60);
        throw retryError(authRetrySeconds(action));
      }
      if (error.code === "invalid_credentials" || (action === "login" && error.status === 400 && (!error.code || error.code === 400))) {
        error.message = "The email or password is incorrect.";
      } else if (error.code === "email_not_confirmed") {
        error.message = "Unable to sign in. Check your details and any account verification email.";
      } else if (error.status >= 500) {
        error.message = action === "recovery" ? "The recovery email service is temporarily unavailable. Please try again later." : "Sign-in is temporarily unavailable. Please try again later.";
      }
      throw error;
    }
  }

  async function fetchPayload(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, Number(config.requestTimeoutMs) || 10000);
    try {
      const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (error) { payload = text; }
      if (!response.ok) {
        const error = new Error(String(payload && (payload.message || payload.msg || payload.error_description || payload.error) || "The live service returned an error."));
        error.status = response.status;
        error.code = payload && (payload.error_code || payload.code);
        if (response.status === 429) {
          const header = response.headers && response.headers.get("Retry-After");
          let seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
          error.retryAfterSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, seconds) : 60;
        }
        throw error;
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("The connection timed out. Check your connection and refresh before retrying a submission.");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function enabled() {
    return /^https:\/\/.+\.supabase\.co$/i.test(String(config.supabaseUrl || "")) && String(config.supabasePublishableKey || "").length > 20;
  }

  function session() {
    try { return sessionStore.read(); }
    catch (error) { return null; }
  }

  function saveSession(value) {
    if (value) {
      try { sessionStore.write(value); }
      catch (error) {
        sessionGeneration += 1;
        if (root.dispatchEvent && root.Event) root.dispatchEvent(new root.Event("cleanthings:session-ended"));
        throw error;
      }
    }
    else {
      sessionGeneration += 1;
      try { sessionStore.clear(); }
      finally { if (root.dispatchEvent && root.Event) root.dispatchEvent(new root.Event("cleanthings:session-ended")); }
    }
  }

  async function refreshSessionIfNeeded(force) {
    if (mfaVerification && mfaGeneration === sessionGeneration) { await mfaVerification; return session(); }
    const active = session();
    if (!active || !active.refresh_token) return active;
    const expiresAt = Number(active.expires_at || 0);
    if (!force && expiresAt && expiresAt > Math.floor(Date.now() / 1000) + 60) return active;
    if (refreshPromise && refreshGeneration === sessionGeneration) return refreshPromise;
    const generation = sessionGeneration;
    refreshGeneration = generation;
    const pending = fetchPayload(config.supabaseUrl.replace(/\/$/, "") + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: active.refresh_token })
    }).then(function (payload) {
      if (generation !== sessionGeneration) throw new Error("Your session ended. Sign in again.");
      saveSession(payload);
      return payload;
    }).catch(function (error) {
      const ended = ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "user_banned", "user_not_found"].includes(error.code);
      if (generation === sessionGeneration && ended) saveSession(null);
      throw error;
    }).finally(function () { if (refreshPromise === pending) refreshPromise = null; });
    refreshPromise = pending;
    return pending;
  }

  async function request(path, options) {
    options = options || {};
    if (!enabled()) throw new Error("The live database has not been configured yet.");
    const generation = sessionGeneration;
    const activeSession = options.skipRefresh ? session() : await refreshSessionIfNeeded();
    if (!options.skipRefresh && generation !== sessionGeneration) throw new Error("Your session changed. Please try again.");
    const headers = Object.assign({
      apikey: config.supabasePublishableKey,
      Authorization: "Bearer " + (activeSession && activeSession.access_token ? activeSession.access_token : config.supabasePublishableKey)
    }, options.headers || {});
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const fetchOptions = Object.assign({}, options, { headers: headers });
    delete fetchOptions.skipRefresh;
    try { return await fetchPayload(config.supabaseUrl.replace(/\/$/, "") + path, fetchOptions); }
    catch (error) {
      // A rejected resource request is not proof that the login was revoked.
      // Refresh once, never replay an old account's request under a new login.
      if (!options.skipRefresh && error.status === 401 && activeSession && activeSession.refresh_token && generation === sessionGeneration) {
        const current = session();
        if (!current) throw error;
        const renewed = current.access_token !== activeSession.access_token ? current : await refreshSessionIfNeeded(true);
        if (generation !== sessionGeneration || !renewed) throw error;
        fetchOptions.headers.Authorization = "Bearer " + renewed.access_token;
        return fetchPayload(config.supabaseUrl.replace(/\/$/, "") + path, fetchOptions);
      }
      throw error;
    }
  }

  async function signIn(email, password) {
    const generation = ++sessionGeneration;
    const result = await authRequest("login", "/auth/v1/token?grant_type=password", { email: email, password: password });
    if (generation !== sessionGeneration) throw new Error("Sign-in was cancelled.");
    saveSession(result);
    return result;
  }

  async function signUp(profile, password) {
    const generation = ++sessionGeneration;
    const response = await request("/auth/v1/signup", {
      method: "POST",
      skipRefresh: true,
      body: JSON.stringify({
        email: profile.email,
        password: password,
        data: { name: profile.name, phone: profile.phone }
      })
    });
    if (generation !== sessionGeneration) throw new Error("Account creation was cancelled.");
    // With email confirmation enabled, GoTrue may return the pending user
    // directly instead of wrapping it in { user: ... }. Normalise both valid
    // response formats so a successful registration is not shown as a failure.
    const result = response && response.id && !response.user
      ? { user: response, session: null }
      : response;
    if (result && result.access_token) saveSession(result);
    return result;
  }

  async function signOut() {
    const active = session();
    sessionGeneration += 1;
    let storageError = null;
    try { saveSession(null); } catch (error) { storageError = error; }
    try {
      if (active) await request("/auth/v1/logout?scope=local", { method: "POST", skipRefresh: true, headers: { Authorization: "Bearer " + active.access_token } });
    } finally { if (storageError) throw storageError; }
  }

  async function adminMfaStatus() {
    try {
      const result = await request("/rest/v1/rpc/admin_mfa_status", { method: "POST", body: "{}" });
      if (!result || result.enforced !== true || typeof result.required !== "boolean" || typeof result.verified !== "boolean") throw new Error("Administrator security could not be checked. Try again.");
      return result;
    } catch (error) {
      if (error.code === "PGRST202" || error.status === 404) {
        throw new Error("Two-step verification is awaiting server activation. Contact the app owner, or use the current tester build until rollout is ready.");
      }
      throw error;
    }
  }

  async function listMfaFactors() {
    const generation = sessionGeneration;
    const user = await request("/auth/v1/user");
    if (generation !== sessionGeneration || !session() || user.id !== session().user.id) throw new Error("Your session changed. Sign in again.");
    return (user.factors || []).filter(function (factor) { return factor.factor_type === "totp"; });
  }

  async function mfaRequest(path, options) {
    const remaining = authRetrySeconds("mfa");
    if (remaining) throw retryError(remaining);
    try { return await request(path, options); }
    catch (error) {
      if (error.status === 429) { setAuthRetry("mfa", error.retryAfterSeconds || 60); throw retryError(authRetrySeconds("mfa")); }
      throw error;
    }
  }

  async function enrollMfa() {
    const generation = sessionGeneration;
    const status = await adminMfaStatus();
    const factors = await listMfaFactors();
    if (generation !== sessionGeneration) throw new Error("Your session changed. Sign in again.");
    if (!status.required || (factors.some(function (factor) { return factor.status === "verified"; }) && !status.verified)) throw new Error("Verify an existing authenticator before adding another.");
    const result = await mfaRequest("/auth/v1/factors", { method: "POST", body: JSON.stringify({factor_type:"totp", issuer:"Clean Things", friendly_name:"Clean Things " + new Date().toISOString()}) });
    if (generation !== sessionGeneration) throw new Error("Your session changed. Sign in again.");
    if (!result || !result.id || !result.totp || !result.totp.secret || !result.totp.qr_code) throw new Error("Authenticator setup could not be loaded. Try again.");
    return result;
  }

  async function cancelMfaEnrollment(factorId) {
    const generation = sessionGeneration;
    const factors = await listMfaFactors();
    const factor = factors.find(function (item) { return item.id === factorId; });
    if (generation !== sessionGeneration) throw new Error("Your session changed. Sign in again.");
    if (!factor) return;
    if (factor.status !== "unverified") throw new Error("This authenticator is already active. Recheck your sign-in instead.");
    await mfaRequest("/auth/v1/factors/" + encodeURIComponent(factorId), { method: "DELETE" });
  }

  let mfaVerification = null;
  let mfaGeneration = -1;
  async function verifyMfa(factorId, code) {
    if (!/^[0-9]{6}$/.test(String(code))) throw new Error("Enter the six-digit code from your authenticator app.");
    if (!/^[0-9a-f-]{36}$/i.test(String(factorId))) throw new Error("Choose an authenticator and try again.");
    const remaining = authRetrySeconds("mfa");
    if (remaining) throw retryError(remaining);
    if (mfaVerification && mfaGeneration === sessionGeneration) throw new Error("Verification is already in progress.");
    const generation = sessionGeneration;
    await refreshSessionIfNeeded();
    if (generation !== sessionGeneration || !session()) throw new Error("Your session ended. Sign in again.");
    if (mfaVerification && mfaGeneration === generation) throw new Error("Verification is already in progress.");
    const active = session();
    const headers = {apikey:config.supabasePublishableKey, Authorization:"Bearer " + active.access_token, "Content-Type":"application/json"};
    const url = config.supabaseUrl.replace(/\/$/, "") + "/auth/v1/factors/" + encodeURIComponent(factorId);
    mfaGeneration = generation;
    const pending = (async function () {
      try {
        const challenge = await fetchPayload(url + "/challenge", {method:"POST", headers:headers, body:"{}"});
        if (generation !== sessionGeneration) throw new Error("Your session changed. Sign in again.");
        if (!challenge || !challenge.id) throw new Error("Verification could not start. Try again.");
        const verified = await fetchPayload(url + "/verify", {method:"POST", headers:headers, body:JSON.stringify({challenge_id:challenge.id, code:String(code)})});
        if (generation !== sessionGeneration) throw new Error("Your session changed. Sign in again.");
        if (!verified || !verified.access_token || !verified.refresh_token || !verified.user || verified.user.id !== active.user.id) throw new Error("Verification returned an invalid session. Sign in again.");
        if (!verified.expires_at) verified.expires_at = Math.floor(Date.now() / 1000) + Number(verified.expires_in || 0);
        saveSession(verified);
        return true;
      } catch (error) {
        if (error.status === 429) { setAuthRetry("mfa", error.retryAfterSeconds || 60); throw retryError(authRetrySeconds("mfa")); }
        if (["mfa_verification_failed", "mfa_challenge_expired", "mfa_verification_rejected"].includes(error.code)) throw new Error("That code was not accepted. Use the latest code and check that your phone time is automatic.");
        throw error;
      }
    })().finally(function () { if (mfaVerification === pending) mfaVerification = null; });
    mfaVerification = pending;
    return pending;
  }

  async function getMyProfile() {
    const activeSession = session();
    if (!activeSession || !activeSession.user) return null;
    const rows = await request("/rest/v1/profiles?user_id=eq." + encodeURIComponent(activeSession.user.id) + "&select=*");
    return rows && rows[0] ? rows[0] : null;
  }

  async function listProfiles() {
    return request("/rest/v1/profiles?select=*&order=created_at.desc");
  }

  async function updateProfile(userId, changes) {
    const rows = await request("/rest/v1/profiles?user_id=eq." + encodeURIComponent(userId), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes)
    });
    if (!rows || !rows.length) throw new Error("Profile was not saved. Refresh and try again.");
    return rows;
  }

  async function signedAvatarUrl(path) {
    if (!path) return "";
    const payload = await request("/storage/v1/object/sign/avatars/" + path.split("/").map(encodeURIComponent).join("/"), {
      method: "POST",
      body: JSON.stringify({ expiresIn: 3600 })
    });
    const signed = payload && (payload.signedURL || payload.signedUrl);
    return signed ? config.supabaseUrl.replace(/\/$/, "") + "/storage/v1" + signed : "";
  }

  async function uploadAvatar(file) {
    const active = await refreshSessionIfNeeded();
    if (!active || !active.user) throw new Error("Sign in before adding a profile photo.");
    if (!file || !/^(image\/jpeg|image\/png|image\/webp)$/.test(String(file.type || ""))) throw new Error("Choose a JPEG, PNG or WebP image.");
    if (file.size > 3 * 1024 * 1024) throw new Error("Profile photos must be 3 MB or smaller.");
    const path = active.user.id + "/profile";
    await request("/storage/v1/object/avatars/" + encodeURIComponent(active.user.id) + "/profile", {
      method: "POST",
      headers: { "Content-Type": file.type, "x-upsert": "true" },
      body: file
    });
    return { path: path, url: await signedAvatarUrl(path) };
  }

  async function removeAvatar(path) {
    if (!path) return;
    await request("/storage/v1/object/avatars", {
      method: "DELETE",
      body: JSON.stringify({ prefixes: [path] })
    });
  }

  async function uploadPaymentProof(file, bookingId) {
    const active = await refreshSessionIfNeeded();
    if (!active || !active.user) throw new Error("Sign in before uploading payment proof.");
    const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (!file || !types[file.type] || !file.size || file.size > 3 * 1024 * 1024) throw new Error("Choose a JPEG, PNG or WebP image up to 3 MB.");
    if (!/^[0-9a-f-]{36}$/i.test(String(bookingId || ""))) throw new Error("Refresh the booking before adding proof.");
    const path = active.user.id + "/" + bookingId + "/" + crypto.randomUUID() + "." + types[file.type];
    await request("/storage/v1/object/payment-proofs/" + path, {
      method: "POST", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file
    });
    return { path: path, name: file.name };
  }

  async function signedPaymentProofUrl(path) {
    if (!path) throw new Error("This booking has no stored proof image.");
    const result = await request("/storage/v1/object/sign/payment-proofs/" + path.split("/").map(encodeURIComponent).join("/"), {
      method: "POST", body: JSON.stringify({ expiresIn: 300 })
    });
    const signed = result && (result.signedURL || result.signedUrl);
    if (!signed) throw new Error("The proof image could not be opened.");
    return config.supabaseUrl.replace(/\/$/, "") + "/storage/v1" + signed;
  }

  async function requestPasswordReset(email) {
    if (!/^https:\/\//.test(String(config.passwordResetUrl || ""))) throw new Error("Password recovery has not been configured. Contact the business for help.");
    const result = await authRequest("recovery", "/auth/v1/recover?redirect_to=" + encodeURIComponent(config.passwordResetUrl), { email: email });
    setAuthRetry("recovery", 60);
    return result;
  }

  async function savePublicSettings(settings) {
    return request("/rest/v1/rpc/save_public_settings", { method: "POST", body: JSON.stringify({ settings: settings }) });
  }

  async function setDayAvailability(date, status) {
    return request("/rest/v1/rpc/set_day_availability", { method: "POST", body: JSON.stringify({ requested_date: date, requested_status: status }) });
  }

  async function listServices(includeHidden) {
    const query = includeHidden ? "" : "&enabled=eq.true";
    return request("/rest/v1/services?select=*&order=display_order.asc" + query);
  }

  async function saveService(service) {
    return request("/rest/v1/services?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(service)
    });
  }

  async function listAvailability(date) {
    return request("/rest/v1/rpc/appointment_availability", { method: "POST", body: JSON.stringify({ requested_date: date }) });
  }

  async function setAvailability(date, time, status) {
    return request("/rest/v1/availability_overrides?on_conflict=service_date,service_time", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ service_date: date, service_time: time, status: status })
    });
  }

  function bookingFromRow(row) {
    return {
      id: row.id,
      reference: row.reference,
      accountId: row.user_id || "",
      serviceId: row.service_id,
      serviceName: row.service_name,
      addOns: row.add_ons || [],
      serviceMode: row.service_mode,
      date: row.service_date || "",
      time: row.service_time ? String(row.service_time).slice(0, 5) : "",
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email || "",
      vehicle: row.vehicle,
      plate: row.plate,
      location: row.location || "",
      locationPin: row.location_pin || "",
      waterConfirmed: !!row.water_confirmed,
      notes: row.notes || "",
      total: Number(row.total || 0),
      status: row.status,
      payment: {
        method: row.payment_method || "Not selected",
        status: row.payment_status || "Not submitted",
        reference: row.payment_reference || "",
        proofName: row.payment_proof_name || "",
        proofPath: row.payment_proof_path || ""
      },
      createdAt: row.created_at,
      walkIn: !!row.walk_in,
      changeRequest: row.change_request || ""
    };
  }

  async function listBookings() {
    const rows = await request("/rest/v1/bookings?select=*&order=created_at.desc");
    return (rows || []).map(bookingFromRow);
  }

  async function createBooking(draft) {
    const active = session();
    if (!active || !active.user) throw new Error("Sign in or create an account before booking a service.");
    const result = await request("/rest/v1/rpc/create_booking", {
      method: "POST",
      body: JSON.stringify({ input: draft })
    });
    const row = Array.isArray(result) ? result[0] : result;
    return { booking: bookingFromRow(row) };
  }

  async function updateBooking(reference, changes) {
    const rows = await request("/rest/v1/bookings?reference=eq." + encodeURIComponent(reference), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes)
    });
    if (!rows || !rows[0]) throw new Error("The booking was not updated. Refresh and try again.");
    return bookingFromRow(rows[0]);
  }

  async function updateMyBooking(reference, action, details) {
    const result = await request("/rest/v1/rpc/update_my_booking", {
      method: "POST",
      body: JSON.stringify({ input: Object.assign({ reference: reference, action: action }, details || {}) })
    });
    const row = Array.isArray(result) ? result[0] : result;
    return row ? bookingFromRow(row) : null;
  }

  async function deleteBooking(reference) {
    return request("/rest/v1/bookings?reference=eq." + encodeURIComponent(reference), { method: "DELETE" });
  }

  async function createWalkIn(row) {
    const rows = await request("/rest/v1/bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    return rows && rows[0] ? bookingFromRow(rows[0]) : null;
  }

  async function listReceipts() {
    const rows = await request("/rest/v1/receipts?select=*,bookings(reference,service_name)&order=issued_at.desc");
    return (rows || []).map(function (row) {
      return {
        number: row.receipt_number,
        bookingReference: row.bookings ? row.bookings.reference : "",
        service: row.bookings ? row.bookings.service_name : "",
        amount: Number(row.amount || 0),
        method: row.payment_method,
        date: row.issued_at
      };
    });
  }

  async function listPublicSettings() {
    return request("/rest/v1/app_settings?is_public=eq.true&select=key,value");
  }

  async function saveSetting(key, value) {
    return request("/rest/v1/app_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ key: key, value: value, is_public: true })
    });
  }

  root.CleanThingsBackend = {
    enabled: enabled,
    authRetrySeconds: authRetrySeconds,
    session: session,
    sessionStorageStatus: function () { return sessionStore.status(); },
    adminMfaStatus: adminMfaStatus,
    listMfaFactors: listMfaFactors,
    enrollMfa: enrollMfa,
    cancelMfaEnrollment: cancelMfaEnrollment,
    verifyMfa: verifyMfa,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getMyProfile: getMyProfile,
    listProfiles: listProfiles,
    updateProfile: updateProfile,
    signedAvatarUrl: signedAvatarUrl,
    uploadAvatar: uploadAvatar,
    removeAvatar: removeAvatar,
    uploadPaymentProof: uploadPaymentProof,
    signedPaymentProofUrl: signedPaymentProofUrl,
    requestPasswordReset: requestPasswordReset,
    savePublicSettings: savePublicSettings,
    setDayAvailability: setDayAvailability,
    listServices: listServices,
    saveService: saveService,
    listAvailability: listAvailability,
    setAvailability: setAvailability,
    listBookings: listBookings,
    createBooking: createBooking,
    updateMyBooking: updateMyBooking,
    updateBooking: updateBooking,
    deleteBooking: deleteBooking,
    createWalkIn: createWalkIn,
    listReceipts: listReceipts,
    listPublicSettings: listPublicSettings,
    saveSetting: saveSetting,
    bookingFromRow: bookingFromRow
  };
})(window);
