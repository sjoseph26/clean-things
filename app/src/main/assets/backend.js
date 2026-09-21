(function (root) {
  "use strict";

  const config = root.CLEAN_THINGS_CONFIG || {};
  const SESSION_KEY = "cleanthings.supabase.session.v1";
  let refreshPromise = null;
  let sessionGeneration = 0;

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
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch (error) { return null; }
  }

  function saveSession(value) {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else {
      localStorage.removeItem(SESSION_KEY);
      if (root.dispatchEvent && root.Event) root.dispatchEvent(new root.Event("cleanthings:session-ended"));
    }
  }

  async function refreshSessionIfNeeded() {
    const active = session();
    if (!active || !active.refresh_token) return active;
    const expiresAt = Number(active.expires_at || 0);
    if (expiresAt && expiresAt > Math.floor(Date.now() / 1000) + 60) return active;
    if (refreshPromise) return refreshPromise;
    const generation = sessionGeneration;
    refreshPromise = fetchPayload(config.supabaseUrl.replace(/\/$/, "") + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: active.refresh_token })
    }).then(function (payload) {
      if (generation !== sessionGeneration) throw new Error("Your session ended. Sign in again.");
      saveSession(payload);
      return payload;
    }).catch(function (error) {
      if (generation === sessionGeneration && (error.status === 400 || error.status === 401 || error.status === 403)) saveSession(null);
      throw error;
    }).finally(function () { refreshPromise = null; });
    return refreshPromise;
  }

  async function request(path, options) {
    options = options || {};
    if (!enabled()) throw new Error("The live database has not been configured yet.");
    const activeSession = options.skipRefresh ? session() : await refreshSessionIfNeeded();
    const headers = Object.assign({
      apikey: config.supabasePublishableKey,
      Authorization: "Bearer " + (activeSession && activeSession.access_token ? activeSession.access_token : config.supabasePublishableKey)
    }, options.headers || {});
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const fetchOptions = Object.assign({}, options, { headers: headers });
    delete fetchOptions.skipRefresh;
    try { return await fetchPayload(config.supabaseUrl.replace(/\/$/, "") + path, fetchOptions); }
    catch (error) {
      if (!options.skipRefresh && error.status === 401 && activeSession) saveSession(null);
      throw error;
    }
  }

  async function signIn(email, password) {
    const generation = ++sessionGeneration;
    const result = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      skipRefresh: true,
      body: JSON.stringify({ email: email, password: password })
    });
    if (generation !== sessionGeneration) throw new Error("Sign-in was cancelled.");
    saveSession(result);
    return result;
  }

  async function signUp(profile, password) {
    const response = await request("/auth/v1/signup", {
      method: "POST",
      skipRefresh: true,
      body: JSON.stringify({
        email: profile.email,
        password: password,
        data: { name: profile.name, phone: profile.phone }
      })
    });
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
    saveSession(null);
    if (active) await request("/auth/v1/logout", { method: "POST", skipRefresh: true, headers: { Authorization: "Bearer " + active.access_token } });
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
    return request("/auth/v1/recover?redirect_to=" + encodeURIComponent(config.passwordResetUrl), {
      method: "POST", skipRefresh: true, body: JSON.stringify({ email: email })
    });
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
    session: session,
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
