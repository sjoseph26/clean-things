(function () {
  "use strict";

  const Core = window.CleanThingsCore;
  const Backend = window.CleanThingsBackend;
  const STORE_KEY = "cleanthings.prototype.v1";
  const DEMO_PIN = "2468";
  const DEMO_CUSTOMER_PASSWORD = "demo123";
  const DEFAULT_MMG_DETAILS = {
    accountName: "Clean Things (Demo)",
    number: "000-0000",
    note: "Use the booking reference as the payment note. These details are fictional."
  };

  const defaultServices = [
    {
      id: "essential",
      name: "Essential Wash",
      icon: "🚙",
      price: 3000,
      duration: "40 min",
      description: "A careful exterior wash, wheel rinse and hand dry.",
      includes: ["Exterior wash", "Wheel rinse", "Hand dry"],
      addOns: [
        { id: "tyre-shine", name: "Tyre shine", price: 800, description: "Clean, finished tyre appearance" },
        { id: "interior-vacuum", name: "Interior vacuum", price: 1500, description: "Seats, mats and floor vacuum" }
      ]
    },
    {
      id: "complete",
      name: "Complete Care",
      icon: "✨",
      price: 5500,
      duration: "70 min",
      popular: true,
      description: "Exterior care plus interior vacuum and dashboard wipe-down.",
      includes: ["Exterior wash", "Interior vacuum", "Dashboard wipe", "Tyre shine"],
      addOns: [
        { id: "seat-shampoo", name: "Seat shampoo", price: 3000, description: "Deep fabric-seat cleaning" },
        { id: "engine-bay", name: "Engine-bay clean", price: 2500, description: "Careful surface clean and finish" }
      ]
    },
    {
      id: "full-detail",
      name: "Full Detail",
      icon: "💎",
      price: 12000,
      duration: "3 hrs",
      description: "A deeper interior and exterior treatment for a complete refresh.",
      includes: ["Deep interior clean", "Exterior wash", "Light polish", "Tyre finish"],
      addOns: [
        { id: "seat-shampoo", name: "Seat shampoo", price: 3000, description: "Deep fabric-seat cleaning" },
        { id: "headlight-restore", name: "Headlight restoration", price: 3500, description: "Restore clarity to faded lenses" }
      ]
    }
  ];

  const defaultSlots = [
    { value: "08:30", label: "8:30 AM" },
    { value: "10:00", label: "10:00 AM" },
    { value: "11:30", label: "11:30 AM" },
    { value: "13:00", label: "1:00 PM" },
    { value: "14:30", label: "2:30 PM" },
    { value: "16:00", label: "4:00 PM" }
  ];

  const topbar = document.getElementById("topbar");
  const main = document.getElementById("app-main");
  const bottomNav = document.getElementById("bottom-nav");
  const modalRoot = document.getElementById("modal-root");
  const toast = document.getElementById("toast");

  let toastTimer;
  let authEpoch = 0;
  let availabilityEpoch = 0;
  const pendingActions = new Set();
  let state = loadState();
  let services = state.services;
  let availableSlots = state.schedule.slots;
  let ui = {
    screen: "home",
    bookingStep: 1,
    draft: newDraft(),
    selectedBookingRef: null,
    adminTab: "overview",
    adminDate: dateFromNow(1),
    adminSearch: "",
    adminStatus: "All",
    accountMode: "signin",
    authNotice: "",
    pendingBookingServiceId: null,
    backendStatus: Backend && Backend.enabled() ? "connecting" : "setup"
  };

  function fieldMessage(id, message) {
    const node = document.getElementById(id);
    if (node) node.textContent = message;
    else showToast(message);
  }

  function clearIdentity() {
    authEpoch += 1;
    sessionStorage.removeItem("cleanthings.customer.id");
    sessionStorage.removeItem("cleanthings.admin.auth");
    if (isLive()) { state.accounts = []; state.bookings = []; state.receipts = []; }
    ui.draft = newDraft();
    ui.selectedBookingRef = null;
    saveState();
  }

  async function logout() {
    const request = isLive() ? Backend.signOut() : Promise.resolve();
    clearIdentity();
    closeModal();
    ui.screen = "account";
    render();
    try { await request; showToast("Signed out."); }
    catch (error) { showToast("Signed out on this device. Remote session revocation could not be confirmed."); }
  }

  function isLive() {
    return !!(Backend && Backend.enabled());
  }

  function serviceFromRow(row) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      price: Number(row.price || 0),
      duration: row.duration,
      description: row.description || "",
      includes: row.includes || [],
      addOns: row.add_ons || [],
      enabled: row.enabled !== false,
      popular: !!row.popular,
      displayOrder: Number(row.display_order || 0)
    };
  }

  function serviceToRow(service) {
    return {
      id: service.id,
      name: service.name,
      icon: service.icon,
      price: Number(service.price || 0),
      duration: service.duration,
      description: service.description || "",
      includes: service.includes || [],
      add_ons: service.addOns || [],
      enabled: service.enabled !== false,
      popular: !!service.popular,
      display_order: Number(service.displayOrder || 0)
    };
  }

  function profileToAccount(profile) {
    return {
      id: profile.user_id,
      name: profile.name || "Customer",
      phone: profile.phone || "",
      email: profile.email || "",
      vehicle: profile.vehicle || "",
      plate: profile.plate || "",
      location: profile.location || "",
      avatarPath: profile.avatar_path || "",
      avatarUrl: "",
      role: profile.role || "customer",
      createdAt: profile.created_at
    };
  }

  async function hydrateAvatar(account) {
    if (!account || !account.avatarPath || !isLive()) return account;
    try { account.avatarUrl = await Backend.signedAvatarUrl(account.avatarPath); }
    catch (error) { account.avatarUrl = ""; }
    return account;
  }

  function avatarMarkup(account, small) {
    const className = "profile-avatar" + (small ? " small" : "");
    if (account && account.avatarUrl) return '<img class="' + className + '" src="' + Core.safeText(account.avatarUrl) + '" alt="' + Core.safeText(account.name || "Customer") + ' profile photo">';
    return '<div class="' + className + '">' + Core.safeText(((account && account.name) || "?").charAt(0).toUpperCase()) + '</div>';
  }

  async function bootstrapBackend() {
    if (!isLive()) return;
    const epoch = authEpoch;
    ui.backendStatus = "connecting";
    render();
    try {
      const data = await Promise.all([Backend.listServices(false), Backend.listPublicSettings(), Backend.getMyProfile()]);
      if (epoch !== authEpoch) return;
      services = data[0].map(serviceFromRow);
      state.services = services;
      const publicSettings = data[1];
      (publicSettings || []).forEach(function (item) {
        if (item.key === "business_name") state.settings.businessName = item.value;
        if (item.key === "mmg_account_name") state.settings.mmgAccountName = item.value;
        if (item.key === "mmg_number") state.settings.mmgNumber = item.value;
      });
      if (data[2]) await activateAccount(data[2]);
      else { state.accounts = []; state.bookings = []; state.receipts = []; sessionStorage.removeItem("cleanthings.customer.id"); sessionStorage.removeItem("cleanthings.admin.auth"); }
      if (epoch !== authEpoch) return;
      ui.backendStatus = "online";
      saveState();
      render();
    } catch (error) {
      if (epoch !== authEpoch) return;
      ui.backendStatus = "error";
      render();
      showToast("Live connection unavailable: " + error.message);
    }
  }

  function dateFromNow(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function defaultState() {
    return {
      bookings: [
        {
          reference: "CT-DEMO-01",
          serviceId: "complete",
          serviceName: "Complete Care",
          addOns: ["seat-shampoo"],
          serviceMode: "bay",
          date: dateFromNow(2),
          time: "10:00",
          name: "Demo Customer",
          phone: "592-600-0000",
          vehicle: "Toyota Allion",
          plate: "DEMO-001",
          location: "",
          waterConfirmed: false,
          notes: "Fictional record for team testing.",
          total: 8500,
          status: "Confirmed",
          payment: { method: "MMG", status: "Pending review", reference: "MMG-DEMO-001", proofName: "demo-receipt.jpg" },
          createdAt: new Date().toISOString(),
          demo: true
        }
      ],
      receipts: [],
      accounts: [
        { id: "ADMIN-DEMO-01", name: "Demo Administrator", phone: "5926000001", email: "demo.admin@example.com", password: "DemoAdmin123", role: "admin", createdAt: new Date().toISOString() },
        {
          id: "CUS-DEMO-01",
          name: "Demo Customer",
          phone: "592-600-0000",
          email: "demo.customer@example.com",
          password: DEMO_CUSTOMER_PASSWORD,
          role: "customer",
          vehicle: "Toyota Allion",
          plate: "DEMO-001",
          location: "Georgetown, Guyana",
          createdAt: new Date().toISOString()
        }
      ],
      services: JSON.parse(JSON.stringify(defaultServices)),
      schedule: {
        slots: JSON.parse(JSON.stringify(defaultSlots)),
        blockedSlots: [],
        closedDates: []
      },
      settings: {
        businessName: "Clean Things",
        mmgAccountName: DEFAULT_MMG_DETAILS.accountName,
        mmgNumber: DEFAULT_MMG_DETAILS.number,
        adminPin: DEMO_PIN
      },
      preferences: { theme: "light" }
    };
  }

  function loadState() {
    if (isLive()) {
      const clean = defaultState();
      clean.accounts = []; clean.bookings = []; clean.receipts = []; clean.services = [];
      try { const old = JSON.parse(localStorage.getItem(STORE_KEY)); if (old && old.preferences) clean.preferences = old.preferences; } catch (error) { /* start fresh */ }
      sessionStorage.removeItem("cleanthings.customer.id");
      sessionStorage.removeItem("cleanthings.admin.auth");
      localStorage.removeItem(STORE_KEY);
      return clean;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.bookings) && Array.isArray(saved.receipts)) {
        const defaults = defaultState();
        saved.accounts = Array.isArray(saved.accounts) ? saved.accounts : defaults.accounts;
        saved.services = Array.isArray(saved.services) && saved.services.length ? saved.services : defaults.services;
        saved.schedule = saved.schedule || defaults.schedule;
        saved.schedule.slots = Array.isArray(saved.schedule.slots) ? saved.schedule.slots : defaults.schedule.slots;
        saved.schedule.blockedSlots = Array.isArray(saved.schedule.blockedSlots) ? saved.schedule.blockedSlots : [];
        saved.schedule.closedDates = Array.isArray(saved.schedule.closedDates) ? saved.schedule.closedDates : [];
        saved.settings = Object.assign({}, defaults.settings, saved.settings || {});
        saved.preferences = Object.assign({}, defaults.preferences, saved.preferences || {});
        return saved;
      }
    } catch (error) {
      console.warn("Unable to restore demo data", error);
    }
    return defaultState();
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(isLive() ? { preferences: state.preferences } : state)); }
    catch (error) { showToast("Device storage is full or unavailable. Changes may not survive a restart."); }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.preferences.theme || "light";
  }

  function currentAccount() {
    const accountId = sessionStorage.getItem("cleanthings.customer.id");
    if (isLive() && (!Backend.session() || !Backend.session().user || Backend.session().user.id !== accountId)) return null;
    return state.accounts.find(function (account) { return account.id === accountId; }) || null;
  }

  function customerBookings() {
    const account = currentAccount();
    if (!account) return [];
    return state.bookings.filter(function (booking) {
      return booking.accountId === account.id || (!isLive() && booking.phone === account.phone);
    });
  }

  function routeToAccount(message, pendingServiceId) {
    ui.accountMode = "signin";
    ui.authNotice = message || "Sign in or create an account to continue.";
    ui.pendingBookingServiceId = typeof pendingServiceId === "string" ? pendingServiceId : null;
    ui.screen = "account";
    history.pushState({ screen: "account" }, "", "#account");
    render();
    window.scrollTo(0, 0);
  }

  function beginBooking(serviceId) {
    if (isLive() && ui.backendStatus !== "online") { showToast("Wait for the connection or tap Refresh before booking."); return; }
    if (!currentAccount()) {
      routeToAccount("Sign in or create an account before booking a service.", serviceId || "");
      return;
    }
    navigate("booking", serviceId ? { serviceId: serviceId } : { resetBooking: true });
  }

  async function activateAccount(profile) {
    if (!profile) throw new Error("Your account profile could not be loaded. Please try signing in again.");
    const epoch = authEpoch;
    const account = await hydrateAvatar(profileToAccount(profile));
    const data = await Promise.all([Backend.listBookings(), Backend.listReceipts(), Backend.listServices(account.role === "admin")]);
    if (epoch !== authEpoch || !Backend.session() || Backend.session().user.id !== account.id) throw new Error("Your session ended. Sign in again.");
    state.accounts = [account];
    state.bookings = data[0]; state.receipts = data[1];
    services = data[2].map(serviceFromRow); state.services = services;
    sessionStorage.setItem("cleanthings.customer.id", account.id);
    ui.backendStatus = "online";
    if (account.role === "admin") {
      sessionStorage.setItem("cleanthings.admin.auth", "true");
      const profiles = await Backend.listProfiles();
      if (epoch !== authEpoch) throw new Error("Your session ended.");
      const hydrated = await Promise.all(profiles.map(function (item) { return hydrateAvatar(profileToAccount(item)); }));
      if (epoch !== authEpoch) throw new Error("Your session ended.");
      state.accounts = hydrated;
    } else {
      sessionStorage.removeItem("cleanthings.admin.auth");
    }
    saveState();
    return account;
  }

  function finishAccountEntry(account) {
    const pendingServiceId = ui.pendingBookingServiceId;
    ui.pendingBookingServiceId = null;
    ui.authNotice = "";
    if (account && account.role === "admin") {
      ui.screen = "admin";
      ui.adminTab = "overview";
      history.pushState({ screen: "admin" }, "", "#admin");
      render();
      window.scrollTo(0, 0);
      showToast("Administrator access enabled.");
      return;
    }
    if (pendingServiceId !== null) {
      navigate("booking", pendingServiceId ? { serviceId: pendingServiceId } : { resetBooking: true });
      showToast("Signed in. You can now complete your booking.");
      return;
    }
    render();
    showToast("Welcome back, " + account.name + ".");
  }

  function mmgDetails() {
    return {
      accountName: state.settings.mmgAccountName,
      number: state.settings.mmgNumber,
      note: isLive() ? "Pay using the business details above and include your booking reference. Payment is verified manually." : DEFAULT_MMG_DETAILS.note
    };
  }

  function slotKey(date, time) {
    return date + "|" + time;
  }

  function isSlotUnavailable(date, time, ignoreReference) {
    if (!ignoreReference && isLive() && (ui.availabilityDate !== date || ui.availabilityLoading || ui.availabilityError)) return true;
    if (state.schedule.closedDates.indexOf(date) >= 0) return true;
    if (state.schedule.blockedSlots.indexOf(slotKey(date, time)) >= 0) return true;
    if (!ignoreReference && (state.schedule.occupiedSlots || []).indexOf(slotKey(date, time)) >= 0) return true;
    return state.bookings.some(function (booking) {
      return booking.reference !== ignoreReference && booking.date === date && booking.time === time && booking.status !== "Cancelled";
    });
  }

  function newDraft(serviceId) {
    const account = typeof state !== "undefined" ? currentAccount() : null;
    return {
      serviceId: serviceId || "",
      addOns: [],
      serviceMode: "",
      date: dateFromNow(1),
      time: "",
      name: account ? account.name : "",
      phone: account ? account.phone : "",
      vehicle: account ? account.vehicle : "",
      plate: account ? account.plate : "",
      location: account ? account.location : "",
      locationPin: "",
      waterConfirmed: false,
      notes: ""
      ,requestId: window.crypto.randomUUID()
    };
  }

  function serviceById(id) {
    return services.find(function (service) { return service.id === id; });
  }

  function bookingByRef(reference) {
    return state.bookings.find(function (booking) { return booking.reference === reference; });
  }

  function receiptFor(reference) {
    return state.receipts.find(function (receipt) { return receipt.bookingReference === reference; });
  }

  function persistAndRender(message) {
    saveState();
    render();
    if (message) showToast(message);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2800);
  }

  function formatDate(value) {
    if (!value) return "Not set";
    const date = new Date(value + "T12:00:00");
    return date.toLocaleDateString("en-GY", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function formatTime(value) {
    const slot = availableSlots.find(function (item) { return item.value === value; });
    return slot ? slot.label : (value || "Not set");
  }

  function statusBadge(status) {
    const lower = String(status || "").toLowerCase();
    let style = "warning";
    if (lower === "paid" || lower === "completed" || lower === "confirmed") style = "success";
    if (lower.indexOf("cancel") >= 0 || lower === "rejected") style = "danger";
    return '<span class="badge ' + style + '">' + Core.safeText(status || "Pending") + "</span>";
  }

  function navigate(screen, options) {
    options = options || {};
    if ((screen === "booking" || screen === "bookings" || screen === "payment") && !currentAccount()) {
      routeToAccount(screen === "bookings" ? "Sign in or create an account to view your bookings." : "Sign in or create an account before booking a service.", options.serviceId || "");
      return;
    }
    ui.screen = screen;
    if (options.reference) ui.selectedBookingRef = options.reference;
    if (options.serviceId) {
      ui.draft = newDraft(options.serviceId);
      ui.bookingStep = 1;
    }
    if (options.resetBooking) {
      ui.draft = newDraft();
      ui.bookingStep = 1;
    }
    history.pushState({ screen: screen }, "", "#" + screen);
    render();
    if (isLive() && ["home", "services", "bookings", "admin"].includes(screen)) refreshCurrentView();
    window.scrollTo(0, 0);
  }

  function renderTopbar() {
    topbar.classList.toggle("admin-topbar", ui.screen === "admin");
    const titles = {
      services: ["Services", "Demo catalogue & pricing"],
      booking: ["Book a service", "Four quick steps"],
      success: ["Booking created", "Next steps"],
      bookings: ["My bookings", "Status & payment"],
      payment: ["Pay with MMG", "Demo payment flow"],
      account: ["My account", "Profile, preferences & access"],
      admin: ["Admin Management", isLive() ? "Full business control" : "Full prototype control"]
    };
    if (ui.screen === "home") {
      topbar.innerHTML = '<div class="brand-lockup"><img src="logo.png" alt=""><div><h1>Clean Things</h1><span class="topbar-sub">Booking & service management</span></div></div><button class="header-btn" data-action="info" aria-label="About Clean Things">ⓘ</button>';
      return;
    }
    const title = titles[ui.screen] || ["Clean Things", isLive() ? "Mobile service app" : "Mobile prototype"];
    topbar.innerHTML = '<div><h1>' + title[0] + '</h1><span class="topbar-sub">' + title[1] + '</span></div><button class="header-btn" data-action="home" aria-label="Go to home">⌂</button>';
  }

  function renderBottomNav() {
    if (ui.screen === "admin") {
      bottomNav.classList.add("admin-bottom-nav");
      const adminItems = [
        ["overview", "◫", "Overview"],
        ["bookings", "▣", "Bookings"],
        ["schedule", "▦", "Schedule"],
        ["customers", "♙", "Customers"],
        ["more", "•••", "More"]
      ];
      bottomNav.innerHTML = adminItems.map(function (item) {
        const active = ui.adminTab === item[0] || (item[0] === "more" && ["services", "payments", "settings"].indexOf(ui.adminTab) >= 0);
        return '<button class="nav-item ' + (active ? "active" : "") + '" data-action="admin-tab" data-tab="' + item[0] + '"><span aria-hidden="true">' + item[1] + '</span>' + item[2] + '</button>';
      }).join("");
      return;
    }
    bottomNav.classList.remove("admin-bottom-nav");
    const items = [
      ["home", "⌂", "Home"],
      ["services", "✦", "Services"],
      ["bookings", "▣", "Bookings"],
      ["account", "♙", "Account"]
    ];
    const active = ui.screen === "booking" || ui.screen === "success" || ui.screen === "payment" ? "bookings" : ui.screen;
    bottomNav.innerHTML = items.map(function (item) {
      return '<button class="nav-item ' + (active === item[0] ? "active" : "") + '" data-action="nav" data-screen="' + item[0] + '"' + (active === item[0] ? ' aria-current="page"' : "") + '><span aria-hidden="true">' + item[1] + '</span>' + item[2] + '</button>';
    }).join("");
  }

  function renderHome() {
    const upcoming = customerBookings().find(function (booking) { return booking.status !== "Cancelled" && booking.status !== "Completed"; });
    const connection = ui.backendStatus === "online" ? '<span class="badge success">● Live database</span>' : ui.backendStatus === "connecting" ? '<span class="badge warning">Connecting…</span>' : ui.backendStatus === "error" ? '<span class="badge danger">Offline retry needed</span>' : '<span class="badge demo">Setup mode</span>';
    return '<div class="page">' +
      '<section class="hero"><p class="eyebrow">Clean car. Clear schedule.</p><h2>Book your next clean without the back-and-forth.</h2><p>Choose a package, see the price and reserve a time at the wash bay or your location.</p><button class="btn btn-primary" data-action="start-booking">Book a service <span aria-hidden="true">→</span></button></section>' +
      '<div class="section-head"><div><h2>Quick actions</h2><p>What would you like to do?</p></div>' + connection + '</div>' +
      '<div class="quick-grid">' +
        '<button class="quick-card" data-action="nav" data-screen="services"><span aria-hidden="true">✦</span><strong>View services</strong><small>Packages, add-ons and prices</small></button>' +
        '<button class="quick-card" data-action="nav" data-screen="bookings"><span aria-hidden="true">▣</span><strong>My bookings</strong><small>Status, changes and payments</small></button>' +
      '</div>' +
      '<div class="section-head"><div><h2>' + (upcoming ? "Next appointment" : "No appointment yet") + '</h2><p>' + (upcoming ? "Your latest active booking" : "Create a booking in a few steps") + '</p></div></div>' +
      (upcoming ? bookingCompactCard(upcoming) : '<div class="empty"><div class="empty-icon">🫧</div><h3>Your schedule is clear</h3><p>Browse the demo services and choose a convenient time.</p><button class="btn btn-secondary" data-action="start-booking">Start booking</button></div>') +
      (isLive() ? '<div class="info-callout"><strong>Connected version:</strong> Bookings are stored in the live database. MMG remains a confirmation workflow until the approved payment integration is added.</div>' : '<div class="info-callout warning-callout"><strong>Setup mode:</strong> This build is using device-only data until the Supabase project URL and publishable key are added.</div>') +
    '</div>';
  }

  function serviceCard(service) {
    return '<article class="card"><div class="card-row"><div class="service-icon" aria-hidden="true">' + Core.safeText(service.icon) + '</div><div class="card-grow"><div class="status-line"><h3>' + Core.safeText(service.name) + '</h3>' + (service.popular ? '<span class="badge">Popular</span>' : "") + '</div><p>' + Core.safeText(service.description) + '</p><div class="meta">' + Core.safeText(service.duration) + ' · ' + service.includes.length + ' inclusions</div></div></div><div class="divider"></div><div class="card-row"><div class="card-grow"><span class="meta">Starting from</span><div class="price">' + Core.money(service.price) + '</div></div><button class="btn btn-secondary btn-small" data-action="service-details" data-service="' + Core.safeText(service.id) + '">Details</button><button class="btn btn-primary btn-small" data-action="book-service" data-service="' + Core.safeText(service.id) + '">Book</button></div></article>';
  }

  function renderServices() {
    const activeServices = services.filter(function (service) { return service.enabled !== false; });
    return '<div class="page"><div class="info-callout"><strong>Transparent pricing:</strong> Select add-ons during booking and the estimated total updates immediately.</div><div class="service-grid">' + activeServices.map(serviceCard).join("") + '</div>' + (isLive() ? '' : '<p class="meta" style="text-align:center;margin-top:16px">All prices shown are fictional prototype data.</p>') + '</div>';
  }

  function progress(step) {
    const labels = ["Service", "Schedule", "Details", "Review"];
    return '<div class="progress" aria-label="Booking progress">' + labels.map(function (label, index) {
      return '<div class="progress-item ' + (index + 1 <= step ? "active" : "") + '">' + label + '</div>';
    }).join("") + '</div>';
  }

  function renderBooking() {
    let content = "";
    if (ui.bookingStep === 1) content = bookingServiceStep();
    if (ui.bookingStep === 2) content = bookingScheduleStep();
    if (ui.bookingStep === 3) content = bookingDetailsStep();
    if (ui.bookingStep === 4) content = bookingReviewStep();
    return '<div class="page">' + progress(ui.bookingStep) + content + '</div>';
  }

  function bookingServiceStep() {
    const selected = serviceById(ui.draft.serviceId);
    const total = Core.calculateTotal(selected, ui.draft.addOns);
    const options = services.filter(function (service) { return service.enabled !== false; }).map(function (service) {
      return '<label class="choice-card"><input type="radio" name="service" data-role="service-choice" value="' + Core.safeText(service.id) + '" ' + (ui.draft.serviceId === service.id ? "checked" : "") + '><span class="choice-body"><span class="choice-title"><span>' + Core.safeText(service.icon) + ' ' + Core.safeText(service.name) + '</span><span>' + Core.money(service.price) + '</span></span><span class="choice-copy">' + Core.safeText(service.description) + ' · ' + Core.safeText(service.duration) + '</span></span></label>';
    }).join("");
    const addOns = selected ? '<div class="section-head"><div><h3>Customise your service</h3><p>Optional add-ons</p></div></div><div class="addon-list">' + selected.addOns.map(function (addOn) {
      return '<label class="check-row"><input type="checkbox" data-role="addon-choice" value="' + Core.safeText(addOn.id) + '" ' + (ui.draft.addOns.indexOf(addOn.id) >= 0 ? "checked" : "") + '><span class="check-copy"><strong>' + Core.safeText(addOn.name) + '</strong><small>' + Core.safeText(addOn.description) + '</small></span><strong>' + Core.money(addOn.price) + '</strong></label>';
    }).join("") + '</div>' : "";
    return '<h2>Choose a package</h2><p class="meta" style="margin-bottom:15px">Compare the demo packages and add only what you need.</p>' + options + addOns + '<div class="card" style="margin-top:16px"><div class="summary-row total-row"><span>Estimated total</span><strong class="js-total">' + Core.money(total) + '</strong></div><p class="meta">Final price may change only if an administrator approves extra work.</p></div><button class="btn btn-primary btn-block" data-action="booking-next" ' + (!selected ? "disabled" : "") + '>Continue to schedule →</button>';
  }

  function bookingScheduleStep() {
    return '<h2>Where and when?</h2><p class="meta" style="margin-bottom:15px">Unavailable times cannot be selected.</p>' +
      '<label class="choice-card"><input type="radio" name="mode" data-role="mode-choice" value="bay" ' + (ui.draft.serviceMode === "bay" ? "checked" : "") + '><span class="choice-body"><span class="choice-title"><span>🏁 Wash bay</span><span>No travel</span></span><span class="choice-copy">Bring the vehicle to the Clean Things wash bay.</span></span></label>' +
      '<label class="choice-card"><input type="radio" name="mode" data-role="mode-choice" value="mobile" ' + (ui.draft.serviceMode === "mobile" ? "checked" : "") + '><span class="choice-body"><span class="choice-title"><span>📍 On-location</span><span>We travel</span></span><span class="choice-copy">Clean Things brings the equipment. You provide a suitable water source.</span></span></label>' +
      '<div class="field"><label for="booking-date">Appointment date</label><input id="booking-date" type="date" min="' + dateFromNow(1) + '" value="' + ui.draft.date + '"></div>' +
      '<div class="field"><label>Available times</label><div class="slot-grid">' + availableSlots.map(function (slot) {
        const unavailable = isSlotUnavailable(ui.draft.date, slot.value);
        return '<button type="button" class="slot ' + (ui.draft.time === slot.value ? "selected" : "") + ' ' + (unavailable ? "unavailable" : "") + '" data-action="select-slot" data-time="' + slot.value + '" ' + (unavailable ? 'disabled aria-label="' + Core.safeText(slot.label) + ' unavailable"' : "") + '>' + slot.label + '</button>';
      }).join("") + '</div><span id="schedule-error" class="field-error"></span></div>' +
      '<div class="button-row"><button class="btn btn-ghost" data-action="booking-back">← Back</button><button class="btn btn-primary card-grow" data-action="booking-next">Continue →</button></div>';
  }

  function fieldError(errors, name) {
    return errors && errors[name] ? '<span class="field-error">' + Core.safeText(errors[name]) + '</span>' : "";
  }

  function bookingDetailsStep(errors) {
    errors = errors || {};
    const mobileFields = ui.draft.serviceMode === "mobile" ? '<div class="field"><label for="location">Service location</label><textarea id="location" name="location" autocomplete="street-address" placeholder="Street, village/town and a useful landmark">' + Core.safeText(ui.draft.location) + '</textarea>' + fieldError(errors, "location") + '<label for="location-pin" style="margin-top:10px">Map pin / coordinates <span class="meta">(optional)</span></label><input id="location-pin" name="locationPin" value="' + Core.safeText(ui.draft.locationPin) + '" placeholder="e.g. 6.8013, -58.1551"><div class="button-row location-actions"><button type="button" class="btn btn-primary btn-small" data-action="choose-current-location">◎ Pin my current location</button><button type="button" class="btn btn-secondary btn-small" data-action="choose-location">🗺 Choose manually</button>' + (ui.draft.locationPin ? '<span class="badge success">Pin captured</span>' : '') + '</div><span class="field-hint">Use the phone’s GPS, then drag the pin if the service entrance is slightly different.</span></div><label class="check-row"><input type="checkbox" name="waterConfirmed" ' + (ui.draft.waterConfirmed ? "checked" : "") + '><span class="check-copy"><strong>Suitable water source available</strong><small>Required for an on-location service</small></span></label>' + fieldError(errors, "waterConfirmed") : '<div class="info-callout">Wash-bay selected. Location and water-source fields are not required.</div>';
    return '<h2>Customer & vehicle details</h2><p class="meta" style="margin-bottom:15px">Only information needed to provide the service is requested.</p><form id="details-form" novalidate>' +
      '<div class="field"><label for="name">Customer name</label><input id="name" name="name" autocomplete="name" value="' + Core.safeText(ui.draft.name) + '" placeholder="e.g. Demo Customer">' + fieldError(errors, "name") + '</div>' +
      '<div class="field"><label for="phone">Telephone number</label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="' + Core.safeText(ui.draft.phone) + '" placeholder="592-600-0000">' + fieldError(errors, "phone") + '</div>' +
      '<div class="form-grid"><div class="field"><label for="vehicle">Vehicle make/model</label><input id="vehicle" name="vehicle" value="' + Core.safeText(ui.draft.vehicle) + '" placeholder="Toyota Allion">' + fieldError(errors, "vehicle") + '</div><div class="field"><label for="plate">Registration</label><input id="plate" name="plate" autocapitalize="characters" value="' + Core.safeText(ui.draft.plate) + '" placeholder="DEMO-001">' + fieldError(errors, "plate") + '</div></div>' +
      mobileFields +
      '<div class="field" style="margin-top:15px"><label for="notes">Service notes <span class="meta">(optional)</span></label><textarea id="notes" name="notes" placeholder="Anything the service team should know?">' + Core.safeText(ui.draft.notes) + '</textarea></div>' +
      '<div class="button-row"><button type="button" class="btn btn-ghost" data-action="booking-back">← Back</button><button type="submit" class="btn btn-primary card-grow">Review booking →</button></div>' +
    '</form>';
  }

  function bookingReviewStep() {
    const service = serviceById(ui.draft.serviceId);
    const selectedNames = service.addOns.filter(function (item) { return ui.draft.addOns.indexOf(item.id) >= 0; }).map(function (item) { return item.name; });
    const total = Core.calculateTotal(service, ui.draft.addOns);
    return '<h2>Review your booking</h2><p class="meta" style="margin-bottom:15px">Check the details before submitting.</p><div class="card">' +
      summaryRow("Service", service.name) +
      summaryRow("Add-ons", selectedNames.length ? selectedNames.join(", ") : "None") +
      summaryRow("Service type", ui.draft.serviceMode === "mobile" ? "On-location" : "Wash bay") +
      summaryRow("Appointment", formatDate(ui.draft.date) + " · " + formatTime(ui.draft.time)) +
      summaryRow("Customer", ui.draft.name + " · " + ui.draft.phone) +
      summaryRow("Vehicle", ui.draft.vehicle + " · " + ui.draft.plate.toUpperCase()) +
      (ui.draft.serviceMode === "mobile" ? summaryRow("Location", ui.draft.location) + summaryRow("Water source", "Confirmed") : "") +
      '<div class="summary-row total-row"><span>Estimated total</span><strong>' + Core.money(total) + '</strong></div></div>' +
      '<label class="check-row" style="margin-bottom:14px"><input id="confirm-accuracy" type="checkbox"><span class="check-copy"><strong>I checked the demo booking details</strong><small>I understand the booking will be sent for confirmation.</small></span></label><span id="review-error" class="field-error"></span>' +
      '<div class="button-row"><button class="btn btn-ghost" data-action="booking-back">← Back</button><button class="btn btn-primary card-grow" data-action="confirm-booking">Submit booking</button></div>';
  }

  function summaryRow(label, value) {
    return '<div class="summary-row"><span>' + Core.safeText(label) + '</span><strong>' + Core.safeText(value) + '</strong></div>';
  }

  function renderSuccess() {
    const booking = bookingByRef(ui.selectedBookingRef);
    if (!booking) return renderEmptyBookings();
    return '<div class="page"><div class="success-panel"><div class="success-mark">✓</div><h2>Booking request sent</h2><p>An administrator can now review and confirm this appointment.</p><div class="reference">' + Core.safeText(booking.reference) + '</div><p class="meta">Keep this reference for payment and status checks.</p></div><div class="card" style="margin-top:15px">' + summaryRow("Service", booking.serviceName) + summaryRow("Appointment", formatDate(booking.date) + " · " + formatTime(booking.time)) + summaryRow("Estimated total", Core.money(booking.total)) + '</div><div class="info-callout"><strong>Booking updates:</strong> Check My bookings for confirmation, payment review and service status.</div><div class="button-row"><button class="btn btn-primary card-grow" data-action="pay-booking" data-reference="' + Core.safeText(booking.reference) + '">View MMG details</button><button class="btn btn-ghost card-grow" data-action="nav" data-screen="bookings">My bookings</button></div></div>';
  }

  function bookingCompactCard(booking) {
    return '<article class="card"><div class="status-line"><span class="booking-ref">' + Core.safeText(booking.reference) + '</span>' + statusBadge(booking.status) + (booking.demo ? '<span class="badge demo">Sample</span>' : "") + '</div><h3>' + Core.safeText(booking.serviceName) + '</h3><p>' + formatDate(booking.date) + ' · ' + formatTime(booking.time) + '</p><div class="divider"></div><div class="card-row"><div class="card-grow"><span class="meta">Payment</span><div>' + statusBadge(booking.payment.status) + '</div></div><strong class="price">' + Core.money(booking.total) + '</strong></div></article>';
  }

  function renderEmptyBookings() {
    return '<div class="empty"><div class="empty-icon">▣</div><h3>No bookings found</h3><p>Create a wash-bay or on-location booking to see it here.</p><button class="btn btn-primary" data-action="start-booking">Book a service</button></div>';
  }

  function renderBookings() {
    if (!currentAccount()) {
      return '<div class="page"><div class="empty"><div class="empty-icon">♙</div><h3>Sign in to view bookings</h3><p>Your bookings are private and linked to your account.</p><button class="btn btn-primary" data-action="nav" data-screen="account">Sign in or create account</button></div></div>';
    }
    const records = customerBookings();
    if (!records.length) return '<div class="page">' + renderEmptyBookings() + '</div>';
    return '<div class="page"><div class="info-callout"><strong>Status at a glance:</strong> Booking and payment updates stay linked to the booking reference.</div>' + records.slice().reverse().map(function (booking) {
      const receipt = receiptFor(booking.reference);
      return '<article class="card"><div class="status-line"><span class="booking-ref">' + Core.safeText(booking.reference) + '</span>' + statusBadge(booking.status) + (booking.demo ? '<span class="badge demo">Sample</span>' : "") + '</div><h3>' + Core.safeText(booking.serviceName) + '</h3><p>' + (booking.walkIn ? "Walk-in transaction" : formatDate(booking.date) + ' · ' + formatTime(booking.time)) + '</p><p class="meta">' + (booking.serviceMode === "mobile" ? "On-location" : "Wash bay") + ' · ' + Core.safeText(booking.vehicle) + '</p>' + (booking.changeRequest ? '<div class="info-callout warning-callout"><strong>Request:</strong> ' + Core.safeText(booking.changeRequest) + '</div>' : "") + '<div class="divider"></div><div class="card-row"><div class="card-grow"><span class="meta">Payment status</span><div style="margin-top:5px">' + statusBadge(booking.payment.status) + '</div></div><strong class="price">' + Core.money(booking.total) + '</strong></div><div class="button-row" style="margin-top:14px">' + (booking.payment.status !== "Paid" && booking.status !== "Cancelled" && booking.status !== "Completed" ? '<button class="btn btn-secondary btn-small" data-action="pay-booking" data-reference="' + Core.safeText(booking.reference) + '">Pay with MMG</button>' : "") + (receipt ? '<button class="btn btn-secondary btn-small" data-action="view-receipt" data-reference="' + Core.safeText(booking.reference) + '">View receipt</button>' : "") + (!booking.walkIn && booking.status !== "Cancelled" && booking.status !== "Completed" ? '<button class="btn btn-ghost btn-small" data-action="request-reschedule" data-reference="' + Core.safeText(booking.reference) + '">Reschedule</button><button class="btn btn-ghost btn-small" data-action="request-cancel" data-reference="' + Core.safeText(booking.reference) + '">Cancel</button>' : "") + '</div></article>';
    }).join("") + '</div>';
  }

  function renderPayment() {
    const booking = bookingByRef(ui.selectedBookingRef) || customerBookings()[0];
    if (!booking) return '<div class="page">' + renderEmptyBookings() + '</div>';
    ui.selectedBookingRef = booking.reference;
    if (booking.payment.status === "Paid" || ["Cancelled", "Completed"].includes(booking.status)) return '<div class="page"><div class="info-callout">Payment submission is closed for this booking.</div><button class="btn btn-secondary" data-action="nav" data-screen="bookings">Back to bookings</button></div>';
    const details = mmgDetails();
    return '<div class="page"><div class="card"><div class="status-line"><span class="booking-ref">' + Core.safeText(booking.reference) + '</span>' + statusBadge(booking.payment.status) + '</div><h3>' + Core.safeText(booking.serviceName) + '</h3><div class="summary-row total-row"><span>Amount due</span><strong>' + Core.money(booking.total) + '</strong></div></div><div class="card"><div class="status-line"><h3>MMG payment details</h3>' + (isLive() ? '' : '<span class="badge demo">Fictional</span>') + '</div>' + summaryRow("Account name", details.accountName) + summaryRow("MMG number", details.number) + summaryRow("Payment note", booking.reference) + '<p class="meta" style="margin-top:10px">' + details.note + '</p><button class="btn btn-secondary btn-small" style="margin-top:12px" data-action="copy-mmg" data-reference="' + Core.safeText(booking.reference) + '">Copy payment note</button></div><form id="payment-form" class="card" novalidate><h3>Submit payment evidence</h3><p class="meta" style="margin-bottom:15px">Enter a reference or select an image. Connected accounts can upload a JPEG, PNG or WebP image up to 3 MB.</p><div class="field"><label for="payment-reference">MMG reference</label><input id="payment-reference" name="reference" autocomplete="off" value="' + Core.safeText(booking.payment.reference || "") + '" placeholder="e.g. MMG-DEMO-123"></div><div class="field"><label for="payment-proof">Proof image <span class="meta">(optional)</span></label><input id="payment-proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp"><span class="field-hint">Current: ' + Core.safeText(booking.payment.proofName || "No image selected") + '</span></div><span id="payment-error" class="field-error"></span><button class="btn btn-primary btn-block" type="submit">Submit for admin review</button></form></div>';
  }

  function renderAccount() {
    const account = currentAccount();
    const themeLabel = state.preferences.theme === "dark" ? "Use light mode" : "Use dark mode";
    if (!account) {
      return '<div class="page"><div class="account-welcome"><div class="service-icon">♙</div><h2>Account access</h2><p>Customers and administrators use the same secure sign-in. Access is based on the account role.</p></div>' + (ui.authNotice ? '<div class="info-callout warning-callout"><strong>Account required:</strong> ' + Core.safeText(ui.authNotice) + '</div>' : '') + '<div class="account-tabs"><button class="account-tab ' + (ui.accountMode === "signin" ? "active" : "") + '" data-action="account-mode" data-mode="signin">Sign in</button><button class="account-tab ' + (ui.accountMode === "create" ? "active" : "") + '" data-action="account-mode" data-mode="create">Create account</button></div>' + (ui.accountMode === "signin" ? customerLoginForm() : customerCreateForm()) + '</div>';
    }
    const count = customerBookings().length;
    const management = account.role === "admin" ? '<div class="card admin-access-card"><h3>Management access</h3><p>Your account has administrator privileges.</p><button class="btn btn-admin btn-block" data-action="open-management" style="margin-top:14px">Open management dashboard</button></div>' : '';
    return '<div class="page"><div class="profile-card">' + avatarMarkup(account, false) + '<div><h2>' + Core.safeText(account.name) + '</h2><p>' + Core.safeText(account.phone) + '</p></div></div><div class="metric-grid"><div class="metric"><strong>' + count + '</strong><span>Total bookings</span></div><div class="metric"><strong>' + customerBookings().filter(function (b) { return b.status === "Completed"; }).length + '</strong><span>Completed</span></div><div class="metric"><strong>' + customerBookings().filter(function (b) { return b.payment.status === "Paid"; }).length + '</strong><span>Paid</span></div></div><div class="card"><h3>Saved details</h3>' + summaryRow("Email", account.email || "Not set") + summaryRow("Vehicle", account.vehicle || "Not set") + summaryRow("Registration", account.plate || "Not set") + summaryRow("Default location", account.location || "Not set") + '<button class="btn btn-secondary btn-block" data-action="edit-profile" style="margin-top:14px">Edit profile & photo</button></div>' + management + '<div class="card"><h3>Preferences</h3><button class="setting-row" data-action="toggle-theme"><span><strong>◐ ' + themeLabel + '</strong><small>Change the app appearance</small></span><span>›</span></button><button class="setting-row" data-action="customer-logout"><span><strong>Sign out</strong><small>Clear this account from this device</small></span><span>›</span></button></div></div>';
  }

  function customerLoginForm() {
    if (isLive()) return '<form id="customer-login-form" class="card" novalidate><div class="info-callout"><strong>One sign-in:</strong> Customers see their bookings; authorised administrators receive management controls automatically.</div><div class="field"><label for="customer-email">Email</label><input id="customer-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="customer-password">Password</label><input id="customer-password" name="password" type="password" autocomplete="current-password" required></div><span id="customer-login-error" class="field-error"></span><button class="btn btn-primary btn-block" type="submit">Sign in</button><button type="button" class="btn btn-ghost btn-block" data-action="forgot-password">Reset password</button></form>';
    return '<form id="customer-login-form" class="card" novalidate><div class="info-callout"><strong>Demo login:</strong> 592-600-0000 / demo123</div><div class="field"><label for="customer-phone">Telephone</label><input id="customer-phone" name="phone" type="tel" value="592-600-0000"></div><div class="field"><label for="customer-password">Password</label><input id="customer-password" name="password" type="password" value="demo123"></div><span id="customer-login-error" class="field-error"></span><button class="btn btn-primary btn-block" type="submit">Sign in</button><button type="button" class="btn btn-ghost btn-block" data-action="forgot-password">Reset password</button></form>';
  }

  function customerCreateForm() {
    return '<form id="customer-create-form" class="card" novalidate><div class="info-callout"><strong>Before you begin:</strong> Use an email address that is not already registered. One confirmation email can be requested per address each minute.</div><div class="field"><label for="new-name">Full name</label><input id="new-name" name="name" autocomplete="name" required></div><div class="field"><label for="new-phone">Telephone</label><input id="new-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+592 600 0000" required><span class="field-hint">Use a Guyana number with or without +592.</span></div><div class="field"><label for="new-email">Email</label><input id="new-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required><span class="field-hint">The confirmation link will be sent to this address.</span></div><div class="field"><label for="new-password">Password</label><input id="new-password" name="password" type="password" minlength="8" autocomplete="new-password" required><ul class="password-rules" aria-label="Password requirements"><li>At least 8 characters</li><li>At least one letter</li><li>At least one number</li></ul></div><div class="field"><label for="confirm-password">Confirm password</label><input id="confirm-password" name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></div><span id="customer-create-error" class="field-error" role="alert"></span><button class="btn btn-primary btn-block" type="submit">Create account</button></form>';
  }

  function renderAdmin() {
    if (!currentAccount() || currentAccount().role !== "admin") return '<div class="page"><div class="empty"><div class="empty-icon">🔐</div><h3>Administrator account required</h3><p>Use the regular account sign-in. Management access appears only for an authorised administrator.</p><button class="btn btn-primary" data-action="nav" data-screen="account">Go to sign in</button></div></div>';
    return '<div class="page admin-page">' + adminTabContent() + '</div>';
  }

  function adminTabContent() {
    if (ui.adminTab === "bookings") return adminBookings();
    if (ui.adminTab === "schedule") return adminSchedule();
    if (ui.adminTab === "customers") return adminCustomers();
    if (ui.adminTab === "services") return adminServices();
    if (ui.adminTab === "payments") return adminPayments();
    if (ui.adminTab === "settings") return adminSettings();
    if (ui.adminTab === "more") return adminMore();
    return adminOverview();
  }

  function adminOverview() {
    const pending = state.bookings.filter(function (b) { return b.status === "Pending confirmation"; }).length;
    const payments = state.bookings.filter(function (b) { return b.payment.status === "Pending review"; }).length;
    const revenue = state.bookings.filter(function (b) { return b.payment.status === "Paid"; }).reduce(function (sum, b) { return sum + Number(b.total || 0); }, 0);
    const upcoming = state.bookings.filter(function (b) { return b.status !== "Cancelled" && b.status !== "Completed"; }).length;
    return '<div class="admin-title-row"><div><p class="eyebrow admin-eyebrow">Control centre</p><h2>Business overview</h2><p>Manage the full ' + (isLive() ? "business" : "prototype") + ' from one place.</p></div><button class="btn btn-ghost btn-small" data-action="admin-logout">Sign out</button></div><div class="admin-metrics"><button data-action="admin-tab" data-tab="bookings"><span>Awaiting</span><strong>' + pending + '</strong><small>Confirmations</small></button><button data-action="admin-tab" data-tab="schedule"><span>Upcoming</span><strong>' + upcoming + '</strong><small>Bookings</small></button><button data-action="admin-tab" data-tab="payments"><span>Review</span><strong>' + payments + '</strong><small>Payments</small></button><button><span>Paid revenue</span><strong class="metric-money">' + Core.money(revenue) + '</strong><small>' + (isLive() ? "Recorded total" : "Prototype total") + '</small></button></div><div class="section-head"><div><h3>Quick management</h3><p>Common admin tasks</p></div></div><div class="admin-action-grid"><button data-action="admin-tab" data-tab="bookings"><span>▣</span><strong>Manage bookings</strong><small>Edit, confirm or cancel</small></button><button data-action="admin-tab" data-tab="schedule"><span>▦</span><strong>Adjust schedule</strong><small>Open or block time slots</small></button><button data-action="admin-tab" data-tab="services"><span>✦</span><strong>Edit services</strong><small>Prices, add-ons and visibility</small></button><button data-action="admin-tab" data-tab="customers"><span>♙</span><strong>View customers</strong><small>Profiles and history</small></button><button data-action="open-walkin"><span>＋</span><strong>Add walk-in</strong><small>Record a paid service</small></button></div><div class="section-head"><div><h3>Needs attention</h3><p>Most recent pending records</p></div></div>' + (state.bookings.filter(function (b) { return b.status === "Pending confirmation" || b.payment.status === "Pending review"; }).slice(-3).reverse().map(adminBookingCard).join("") || '<div class="empty"><div class="empty-icon">✓</div><h3>All caught up</h3><p>No bookings or payments need attention.</p></div>');
  }

  function adminBookings() {
    const query = ui.adminSearch.toLowerCase();
    const records = state.bookings.slice().reverse().filter(function (booking) {
      const matchesText = !query || [booking.reference, booking.name, booking.phone, booking.vehicle, booking.plate].join(" ").toLowerCase().indexOf(query) >= 0;
      const matchesStatus = ui.adminStatus === "All" || booking.status === ui.adminStatus;
      return matchesText && matchesStatus;
    });
    return '<div class="admin-section-head"><div><h2>Bookings</h2><p>' + records.length + ' record(s) shown</p></div><button class="btn btn-admin btn-small" data-action="open-walkin">+ Walk-in</button></div><div class="admin-filter"><input id="admin-booking-search" type="search" placeholder="Search customer, vehicle or reference" value="' + Core.safeText(ui.adminSearch) + '"><select id="admin-status-filter"><option>All</option>' + ["Pending confirmation", "Confirmed", "Completed", "Cancelled"].map(function (status) { return '<option ' + (ui.adminStatus === status ? "selected" : "") + '>' + status + '</option>'; }).join("") + '</select></div>' + (records.length ? records.map(adminBookingCard).join("") : '<div class="empty"><div class="empty-icon">⌕</div><h3>No matching bookings</h3><p>Try another search or status filter.</p></div>');
  }

  function adminBookingCard(booking) {
    const paymentPending = booking.payment.status === "Pending review";
    return '<article class="card admin-record"><div class="status-line"><span class="booking-ref">' + Core.safeText(booking.reference) + '</span>' + statusBadge(booking.status) + statusBadge(booking.payment.status) + '</div><h3>' + Core.safeText(booking.name) + '</h3><p>' + Core.safeText(booking.serviceName) + ' · ' + Core.money(booking.total) + '</p><p class="meta">' + (booking.walkIn ? "Walk-in" : formatDate(booking.date) + " · " + formatTime(booking.time)) + ' · ' + Core.safeText(booking.vehicle) + '</p>' + (booking.locationPin ? '<p class="meta">📍 ' + Core.safeText(booking.locationPin) + '</p>' : '') + (booking.changeRequest ? '<div class="info-callout warning-callout">' + Core.safeText(booking.changeRequest) + '</div>' : "") + (booking.payment.proofPath ? '<button class="btn btn-secondary btn-small" data-action="view-proof" data-reference="' + Core.safeText(booking.reference) + '">View proof image</button>' : '') + (paymentPending ? '<div class="info-callout"><strong>MMG evidence:</strong> ' + Core.safeText(booking.payment.reference || booking.payment.proofName || "Submitted") + '</div>' : "") + '<div class="button-row" style="margin-top:13px">' + (booking.status === "Pending confirmation" ? '<button class="btn btn-secondary btn-small" data-action="admin-booking" data-admin-action="confirm" data-reference="' + Core.safeText(booking.reference) + '">Confirm</button>' : "") + (booking.status !== "Completed" && booking.status !== "Cancelled" ? '<button class="btn btn-secondary btn-small" data-action="admin-booking" data-admin-action="complete" data-reference="' + Core.safeText(booking.reference) + '">Complete</button><button class="btn btn-ghost btn-small" data-action="admin-booking" data-admin-action="cancel" data-reference="' + Core.safeText(booking.reference) + '">Cancel</button>' : "") + (paymentPending ? '<button class="btn btn-admin btn-small" data-action="admin-booking" data-admin-action="verify" data-reference="' + Core.safeText(booking.reference) + '">Verify MMG</button><button class="btn btn-danger btn-small" data-action="admin-booking" data-admin-action="reject" data-reference="' + Core.safeText(booking.reference) + '">Reject</button>' : "") + '<button class="btn btn-ghost btn-small" data-action="edit-booking" data-reference="' + Core.safeText(booking.reference) + '">Edit</button>' + (receiptFor(booking.reference) ? '<button class="btn btn-ghost btn-small" data-action="view-receipt" data-reference="' + Core.safeText(booking.reference) + '">Receipt</button>' : "") + '<button class="btn btn-danger btn-small" data-action="delete-booking" data-reference="' + Core.safeText(booking.reference) + '">Delete</button></div></article>';
  }

  function adminSchedule() {
    const date = ui.adminDate;
    const closed = state.schedule.closedDates.indexOf(date) >= 0;
    const dayBookings = state.bookings.filter(function (b) { return b.date === date && b.status !== "Cancelled"; });
    return '<div class="admin-section-head"><div><h2>Schedule</h2><p>Open or block appointment availability</p></div></div><div class="card"><div class="field"><label for="admin-date">Manage date</label><input id="admin-date" type="date" value="' + date + '"></div><button class="btn ' + (closed ? "btn-secondary" : "btn-danger") + ' btn-block" data-action="toggle-day" ' + (!closed && dayBookings.length ? "disabled" : "") + '>' + (closed ? "Open this day" : dayBookings.length ? "Move or cancel bookings before closing" : "Close this entire day") + '</button></div><div class="section-head"><div><h3>Time slots</h3><p>' + dayBookings.length + ' active booking(s) on this date</p></div></div><div class="schedule-admin-grid">' + availableSlots.map(function (slot) { const booked = dayBookings.find(function (b) { return b.time === slot.value; }); const blocked = state.schedule.blockedSlots.indexOf(slotKey(date, slot.value)) >= 0; return '<button class="schedule-slot-admin ' + (closed || blocked ? "blocked" : booked ? "booked" : "open") + '" data-action="toggle-admin-slot" data-time="' + slot.value + '" ' + (booked ? "disabled" : "") + '><strong>' + slot.label + '</strong><span>' + (closed ? "Day closed" : booked ? Core.safeText(booked.name) : blocked ? "Blocked" : "Open") + '</span></button>'; }).join("") + '</div><div class="info-callout"><strong>How it works:</strong> Booked slots cannot be blocked until the booking is moved or cancelled. Changes immediately affect customer availability' + (isLive() ? " across connected devices" : " on this device") + '.</div>';
  }

  function customerRecords() {
    const map = {};
    state.accounts.filter(function (account) { return account.role !== "admin"; }).forEach(function (account) { map[account.phone] = Object.assign({ accountId: account.id, bookingCount: 0, totalSpent: 0 }, account); });
    state.bookings.forEach(function (booking) { const key = booking.phone || booking.name; if (!map[key]) map[key] = { id: "guest-" + key, name: booking.name, phone: booking.phone, email: "", vehicle: booking.vehicle, plate: booking.plate, location: booking.location, bookingCount: 0, totalSpent: 0 }; map[key].bookingCount += 1; if (booking.payment.status === "Paid") map[key].totalSpent += Number(booking.total || 0); });
    return Object.keys(map).map(function (key) { return map[key]; });
  }

  function adminCustomers() {
    const records = customerRecords();
    return '<div class="admin-section-head"><div><h2>Customers</h2><p>' + records.length + ' customer record(s)</p></div></div>' + records.map(function (customer) { return '<article class="card"><div class="card-row">' + avatarMarkup(customer, true) + '<div class="card-grow"><h3>' + Core.safeText(customer.name) + '</h3><p>' + Core.safeText(customer.phone || "No phone") + '</p></div><span class="badge">' + customer.bookingCount + ' booking(s)</span></div><div class="divider"></div><div class="summary-row"><span>Vehicle</span><strong>' + Core.safeText(customer.vehicle || "Not set") + '</strong></div><div class="summary-row"><span>Paid total</span><strong>' + Core.money(customer.totalSpent) + '</strong></div><button class="btn btn-secondary btn-block" style="margin-top:12px" data-action="edit-customer" data-phone="' + Core.safeText(customer.phone || "") + '">View / edit customer</button></article>'; }).join("");
  }

  function adminServices() {
    return '<div class="admin-section-head"><div><h2>Services & pricing</h2><p>Edit what customers can book</p></div><button class="btn btn-admin btn-small" data-action="add-service">+ Service</button></div>' + services.map(function (service) { return '<article class="card"><div class="card-row"><div class="service-icon">' + Core.safeText(service.icon) + '</div><div class="card-grow"><h3>' + Core.safeText(service.name) + '</h3><p>' + Core.money(service.price) + ' · ' + Core.safeText(service.duration) + '</p></div>' + statusBadge(service.enabled === false ? "Hidden" : "Active") + '</div><div class="button-row" style="margin-top:13px"><button class="btn btn-secondary btn-small" data-action="edit-service" data-service="' + Core.safeText(service.id) + '">Edit</button><button class="btn btn-ghost btn-small" data-action="toggle-service" data-service="' + Core.safeText(service.id) + '">' + (service.enabled === false ? "Show" : "Hide") + '</button></div></article>'; }).join("");
  }

  function adminPayments() {
    const pending = state.bookings.filter(function (booking) { return booking.payment.status === "Pending review"; }).slice().reverse();
    return '<div class="admin-section-head"><div><h2>Payment review</h2><p>' + pending.length + ' awaiting verification</p></div></div>' + (pending.length ? pending.map(adminBookingCard).join("") : '<div class="empty"><div class="empty-icon">✓</div><h3>No payments waiting</h3><p>Submitted MMG evidence will appear here.</p></div>');
  }

  function adminSettings() {
    const pinField = isLive() ? '' : '<div class="field"><label for="admin-new-pin">Admin PIN</label><input id="admin-new-pin" name="adminPin" inputmode="numeric" maxlength="6" value="' + Core.safeText(state.settings.adminPin) + '"></div>';
    return '<div class="admin-section-head"><div><h2>Business settings</h2><p>' + (isLive() ? "Live shared configuration" : "Local prototype configuration") + '</p></div></div><form id="admin-settings-form" class="card"><div class="field"><label for="business-name">Business name</label><input id="business-name" name="businessName" value="' + Core.safeText(state.settings.businessName) + '"></div><div class="field"><label for="mmg-name">MMG account name</label><input id="mmg-name" name="mmgAccountName" value="' + Core.safeText(state.settings.mmgAccountName) + '"></div><div class="field"><label for="mmg-number">MMG number</label><input id="mmg-number" name="mmgNumber" value="' + Core.safeText(state.settings.mmgNumber) + '"></div>' + pinField + '<button class="btn btn-admin btn-block" type="submit">Save settings</button></form><div class="card"><h3>Appearance & data</h3><button class="setting-row" data-action="toggle-theme"><span><strong>◐ Toggle dark mode</strong><small>Current: ' + Core.safeText(state.preferences.theme) + '</small></span><span>›</span></button>' + (isLive() ? '' : '<button class="setting-row danger-text" data-action="reset-demo"><span><strong>Reset prototype data</strong><small>Restore fictional default records</small></span><span>›</span></button>') + '</div>';
  }

  function adminMore() {
    return '<div class="admin-section-head"><div><h2>More controls</h2><p>Services, payments and configuration</p></div></div><div class="admin-menu-list"><button data-action="admin-tab" data-tab="services"><span class="service-icon">✦</span><span><strong>Services & pricing</strong><small>Add, edit, hide or reprice packages</small></span><b>›</b></button><button data-action="admin-tab" data-tab="payments"><span class="service-icon">＄</span><span><strong>Payment review</strong><small>Verify or reject submitted evidence</small></span><b>›</b></button><button data-action="admin-tab" data-tab="settings"><span class="service-icon">⚙</span><span><strong>Business settings</strong><small>MMG details, theme and data</small></span><b>›</b></button><button data-action="open-walkin"><span class="service-icon">＋</span><span><strong>Record walk-in</strong><small>Add a completed customer transaction</small></span><b>›</b></button></div>';
  }

  function render() {
    applyTheme();
    renderTopbar();
    renderBottomNav();
    if (ui.screen === "home") main.innerHTML = renderHome();
    else if (ui.screen === "services") main.innerHTML = renderServices();
    else if (ui.screen === "booking") main.innerHTML = renderBooking();
    else if (ui.screen === "success") main.innerHTML = renderSuccess();
    else if (ui.screen === "bookings") main.innerHTML = renderBookings();
    else if (ui.screen === "payment") main.innerHTML = renderPayment();
    else if (ui.screen === "account") main.innerHTML = renderAccount();
    else if (ui.screen === "admin") main.innerHTML = renderAdmin();
    else main.innerHTML = renderHome();
    if (isLive() && !["booking", "payment", "success"].includes(ui.screen)) main.insertAdjacentHTML("afterbegin", '<button class="btn btn-secondary refresh-button" data-action="refresh-live">Refresh</button>');
    if (ui.screen === "booking" && ui.bookingStep === 2 && isLive()) {
      const status = ui.availabilityLoading ? "Loading availability…" : ui.availabilityError;
      if (status) fieldMessage("schedule-error", status);
    }
    bindRenderedForms();
  }

  async function refreshCurrentView() {
    if (!isLive() || pendingActions.has("refresh")) return;
    pendingActions.add("refresh");
    const epoch = authEpoch; const screen = ui.screen;
    try {
      const account = currentAccount();
      const data = await Promise.all([Backend.listServices(!!(account && account.role === "admin")), Backend.listPublicSettings(), account ? Backend.listBookings() : [], account ? Backend.listReceipts() : []]);
      if (epoch !== authEpoch) return;
      services = data[0].map(serviceFromRow); state.services = services;
      data[1].forEach(function (item) { const keys = {business_name:"businessName",mmg_account_name:"mmgAccountName",mmg_number:"mmgNumber"}; if (keys[item.key]) state.settings[keys[item.key]] = item.value; });
      state.bookings = data[2]; state.receipts = data[3];
      ui.backendStatus = "online";
      if (!account && Backend.session()) { const profile = await Backend.getMyProfile(); if (profile) await activateAccount(profile); }
      if (epoch === authEpoch && ui.screen === screen && !modalRoot.firstChild) render();
    } catch (error) { ui.backendStatus = "error"; showToast("Refresh failed: " + error.message); }
    finally { pendingActions.delete("refresh"); }
  }

  function bindRenderedForms() {
    const detailsForm = document.getElementById("details-form");
    if (detailsForm) detailsForm.addEventListener("submit", submitDetails);
    const paymentForm = document.getElementById("payment-form");
    if (paymentForm) paymentForm.addEventListener("submit", submitPayment);
    const customerLogin = document.getElementById("customer-login-form");
    if (customerLogin) customerLogin.addEventListener("submit", submitCustomerLogin);
    const customerCreate = document.getElementById("customer-create-form");
    if (customerCreate) customerCreate.addEventListener("submit", submitCustomerCreate);
    const settingsForm = document.getElementById("admin-settings-form");
    if (settingsForm) settingsForm.addEventListener("submit", submitAdminSettings);
    const bookingSearch = document.getElementById("admin-booking-search");
    if (bookingSearch) bookingSearch.addEventListener("input", function (event) { ui.adminSearch = event.target.value; render(); const next = document.getElementById("admin-booking-search"); if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); } });
    const statusFilter = document.getElementById("admin-status-filter");
    if (statusFilter) statusFilter.addEventListener("change", function (event) { ui.adminStatus = event.target.value; render(); });
    const adminDate = document.getElementById("admin-date");
    if (adminDate) adminDate.addEventListener("change", async function (event) { ui.adminDate = event.target.value; if (isLive()) await loadAvailability(ui.adminDate); render(); });
  }

  async function loadAvailability(date) {
    if (!isLive()) return;
    const epoch = ++availabilityEpoch;
    ui.availabilityLoading = true; ui.availabilityError = "";
    if (ui.screen === "booking" && ui.bookingStep === 2) render();
    let rows;
    try { rows = await Backend.listAvailability(date); }
    catch (error) { if (epoch === availabilityEpoch) { ui.availabilityLoading = false; ui.availabilityError = error.message; } throw error; }
    if (epoch !== availabilityEpoch) return;
    ui.availabilityLoading = false; ui.availabilityDate = date;
    state.schedule.occupiedSlots = (state.schedule.occupiedSlots || []).filter(function (key) { return !key.startsWith(date + "|"); });
    state.schedule.blockedSlots = state.schedule.blockedSlots.filter(function (key) { return !key.startsWith(date + "|"); });
    (rows || []).forEach(function (row) {
      if (row.status === "blocked") state.schedule.blockedSlots.push(slotKey(date, String(row.service_time).slice(0, 5)));
      if (row.status === "booked") state.schedule.occupiedSlots.push(slotKey(date, String(row.service_time).slice(0, 5)));
    });
    const allBlocked = availableSlots.every(function (slot) { return state.schedule.blockedSlots.indexOf(slotKey(date, slot.value)) >= 0; });
    state.schedule.closedDates = state.schedule.closedDates.filter(function (item) { return item !== date; });
    if (allBlocked) state.schedule.closedDates.push(date);
    saveState();
  }

  function captureDetailsDraft() {
    const form = document.getElementById("details-form");
    if (!form) return;
    const data = new FormData(form);
    ["name", "phone", "vehicle", "plate", "location", "locationPin", "notes"].forEach(function (key) { ui.draft[key] = String(data.get(key) || "").trim(); });
    ui.draft.waterConfirmed = data.get("waterConfirmed") === "on";
  }

  function submitDetails(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    ui.draft.name = String(data.get("name") || "").trim();
    ui.draft.phone = String(data.get("phone") || "").trim();
    ui.draft.vehicle = String(data.get("vehicle") || "").trim();
    ui.draft.plate = String(data.get("plate") || "").trim().toUpperCase();
    ui.draft.location = String(data.get("location") || "").trim();
    ui.draft.locationPin = String(data.get("locationPin") || ui.draft.locationPin || "").trim();
    ui.draft.waterConfirmed = data.get("waterConfirmed") === "on";
    ui.draft.notes = String(data.get("notes") || "").trim();
    const errors = Core.validateBooking(ui.draft);
    if (Object.keys(errors).length) {
      main.innerHTML = '<div class="page">' + progress(3) + bookingDetailsStep(errors) + '</div>';
      bindRenderedForms();
      showToast("Please correct the highlighted details.");
      return;
    }
    ui.bookingStep = 4;
    render();
    window.scrollTo(0, 0);
  }

  async function submitPayment(event) {
    event.preventDefault();
    const booking = bookingByRef(ui.selectedBookingRef);
    if (!booking || booking.payment.status === "Paid" || ["Cancelled", "Completed"].includes(booking.status)) return;
    if (pendingActions.has("payment")) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const reference = String(data.get("reference") || "").trim();
    const proofInput = document.getElementById("payment-proof");
    const file = proofInput && proofInput.files && proofInput.files[0];
    let proofPath = booking.payment.proofPath || "";
    let proofName = proofPath ? booking.payment.proofName : "";
    if (!reference && !file && !proofPath) {
      document.getElementById("payment-error").textContent = "Enter an MMG reference or select a proof image.";
      return;
    }
    pendingActions.add("payment");
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    const epoch = authEpoch;
    try {
      let updated;
      if (isLive()) {
        if (file) {
          // Retain the uploaded path on this form for a retry after an uncertain RPC response.
          const uploaded = form.proofFile === file && form.proofUpload ? form.proofUpload : await Backend.uploadPaymentProof(file, booking.id);
          form.proofFile = file; form.proofUpload = uploaded;
          proofPath = uploaded.path; proofName = uploaded.name;
        }
        updated = await Backend.updateMyBooking(booking.reference, "submit_payment", { paymentReference: reference, paymentProofName: proofName, paymentProofPath: proofPath });
        if (!updated) throw new Error("Payment was not saved. Refresh before retrying.");
      } else {
        if (file) throw new Error("Image upload requires a connected account. Use a fictional reference in demo mode.");
        updated = { payment: { method: "MMG", status: "Pending review", reference: reference, proofName: "", proofPath: "" } };
      }
      if (epoch !== authEpoch) return;
      Object.assign(booking, updated);
      saveState(); navigate("bookings"); showToast("Payment evidence submitted for admin review.");
    } catch (error) { fieldMessage("payment-error", error.message); }
    finally { pendingActions.delete("payment"); button.disabled = false; }
  }

  async function submitCustomerLogin(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (isLive()) {
      if (pendingActions.has("login")) return;
      pendingActions.add("login"); authEpoch += 1;
      const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
      try {
        await Backend.signIn(String(data.get("email") || "").trim(), String(data.get("password") || ""));
        const profile = await Backend.getMyProfile();
        const account = await activateAccount(profile);
        finishAccountEntry(account);
      } catch (error) {
        fieldMessage("customer-login-error", error.message);
      } finally { pendingActions.delete("login"); button.disabled = false; }
      return;
    }
    const phone = String(data.get("phone") || "").trim();
    const password = String(data.get("password") || "");
    const account = state.accounts.find(function (item) { return item.phone === phone && item.password === password; });
    if (!account) {
      document.getElementById("customer-login-error").textContent = "The telephone number or password is incorrect.";
      return;
    }
    sessionStorage.setItem("cleanthings.customer.id", account.id);
    finishAccountEntry(account);
  }

  function friendlySignUpError(error) {
    const message = String(error && error.message ? error.message : error || "");
    const normalised = message.toLowerCase();
    if (normalised.includes("rate limit") || normalised.includes("too many")) return "Too many confirmation emails were requested. Wait at least 60 seconds, then try once with the same email.";
    if (normalised.includes("already registered") || normalised.includes("already exists") || normalised.includes("user already")) return "An account already uses this email. Choose Sign in, or reset the password instead.";
    if (normalised.includes("password")) return "Use at least 8 characters with at least one letter and one number.";
    if (normalised.includes("email") && normalised.includes("invalid")) return "Enter a valid email address without spaces.";
    if (normalised.includes("sending") || normalised.includes("smtp")) return "The confirmation email service is temporarily unavailable. Wait a moment and try once more.";
    return message || "The account could not be created. Check each field and try again once.";
  }

  async function submitCustomerCreate(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    const error = document.getElementById("customer-create-error");
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    error.textContent = "";
    if (name.length < 2) { error.textContent = "Enter your full name."; return; }
    if (!Core.validPhone(phone)) { error.textContent = "Enter a valid telephone number, for example +592 600 0000."; return; }
    if (isLive() && !/^\S+@\S+\.\S+$/.test(email)) { error.textContent = "Enter a valid email address."; return; }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { error.textContent = "Use at least 8 characters with at least one letter and one number."; return; }
    if (password !== confirmPassword) { error.textContent = "The two passwords do not match."; return; }
    if (isLive()) {
      if (pendingActions.has("signup")) return;
      pendingActions.add("signup"); authEpoch += 1;
      submitButton.disabled = true;
      submitButton.textContent = "Creating account…";
      try {
        const result = await Backend.signUp({ name: name, phone: phone, email: email }, password);
        if (!result || !result.user) throw new Error("The account could not be created.");
        if (Array.isArray(result.user.identities) && result.user.identities.length === 0) throw new Error("User already registered");
        if (!result.access_token) {
          ui.accountMode = "signin";
          ui.authNotice = "Account created. Open the newest confirmation email, confirm the address, then return here to sign in.";
          render();
          return;
        }
        const profile = await Backend.getMyProfile();
        const account = await activateAccount(profile);
        finishAccountEntry(account);
      } catch (liveError) {
        error.textContent = friendlySignUpError(liveError);
        submitButton.disabled = false;
        submitButton.textContent = "Create account";
      } finally { pendingActions.delete("signup"); }
      return;
    }
    if (state.accounts.some(function (account) { return account.phone === phone; })) {
      error.textContent = "An account already uses this telephone number.";
      return;
    }
    const account = { id: "CUS-" + String(Date.now()).slice(-8), name: name, phone: phone, email: email, password: password, vehicle: "", plate: "", location: "", createdAt: new Date().toISOString() };
    state.accounts.push(account);
    saveState();
    sessionStorage.setItem("cleanthings.customer.id", account.id);
    finishAccountEntry(account);
  }

  async function submitAdminSettings(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = Object.assign({}, state.settings, {
      businessName: String(data.get("businessName") || "").trim(),
      mmgAccountName: String(data.get("mmgAccountName") || "").trim(),
      mmgNumber: String(data.get("mmgNumber") || "").trim()
    });
    if (!next.businessName || !next.mmgAccountName || !next.mmgNumber) { showToast("Complete all business settings."); return; }
    if (!isLive()) { next.adminPin = String(data.get("adminPin") || "").trim(); if (!/^\d{4,6}$/.test(next.adminPin)) { showToast("Admin PIN must contain 4 to 6 digits."); return; } }
    try { if (isLive()) await Backend.savePublicSettings({ business_name: next.businessName, mmg_account_name: next.mmgAccountName, mmg_number: next.mmgNumber }); }
    catch (error) { showToast("Settings update failed: " + error.message); return; }
    state.settings = next; persistAndRender("Business settings saved.");
  }

  function createReceiptIfEligible(booking) {
    if (isLive()) return;
    if (booking.status !== "Completed" || booking.payment.status !== "Paid" || receiptFor(booking.reference)) return;
    state.receipts.push({
      number: "RCT-" + String(Date.now()).slice(-8),
      bookingReference: booking.reference,
      service: booking.serviceName,
      amount: booking.total,
      method: booking.payment.method,
      date: new Date().toISOString()
    });
  }

  async function handleAdminAction(action, reference) {
    const original = bookingByRef(reference);
    if (!original || pendingActions.has(reference)) return;
    const booking = JSON.parse(JSON.stringify(original));
    if (action === "confirm") booking.status = "Confirmed";
    if (action === "complete") booking.status = "Completed";
    if (action === "cancel") booking.status = "Cancelled";
    if (action === "verify") {
      booking.payment.status = "Paid";
      booking.payment.method = "MMG";
    }
    if (action === "reject") booking.payment.status = "Rejected";
    if (action === "confirm" || action === "cancel") booking.changeRequest = "";
    if (isLive()) {
      pendingActions.add(reference);
      try {
        const changes = {
          status: booking.status,
          payment_status: booking.payment.status,
          payment_method: booking.payment.method,
          change_request: booking.changeRequest || "",
          updated_at: new Date().toISOString()
        };
        const updated = await Backend.updateBooking(reference, changes);
        if (!updated) throw new Error("The record was not saved.");
        Object.assign(booking, updated);
      } catch (error) { showToast("Update failed: " + error.message); return; }
      finally { pendingActions.delete(reference); }
    }
    Object.assign(original, booking);
    if (isLive()) { try { state.receipts = await Backend.listReceipts(); } catch (error) { showToast("Record saved. Refresh to load the receipt."); } }
    createReceiptIfEligible(booking);
    persistAndRender("Record updated successfully.");
  }

  let modalReturnFocus = null;
  function openModal(title, content) {
    modalReturnFocus = document.activeElement;
    modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"><section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-sheet><div class="modal-handle"></div><div class="modal-head"><h2 id="modal-title">' + Core.safeText(title) + '</h2><button class="close-btn" type="button" data-action="close-modal" aria-label="Close">×</button></div>' + content + '</section></div>';
    const sheet = modalRoot.querySelector("[data-modal-sheet]");
    sheet.addEventListener("click", function (event) {
      // Keep ordinary taps inside the sheet away from the close-enabled
      // backdrop, while allowing buttons inside the sheet to reach the shared
      // document action handler.
      if (Core.shouldStopModalClick(sheet, event.target)) event.stopPropagation();
    });
    sheet.querySelectorAll(".field").forEach(function (field, index) {
      const label = field.querySelector("label"); const input = field.querySelector("input,select,textarea");
      if (label && input && !label.htmlFor) { if (!input.id) input.id = "modal-field-" + index; label.htmlFor = input.id; }
    });
    sheet.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); closeModal(); return; }
      if (event.key !== "Tab") return;
      const nodes = Array.from(sheet.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href]'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    const focusTarget = modalRoot.querySelector("button, input, select, textarea");
    if (focusTarget) focusTarget.focus();
  }

  function closeModal() {
    modalRoot.innerHTML = "";
    if (modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus();
  }

  function showServiceDetails(id) {
    const service = serviceById(id);
    if (!service) return;
    openModal(service.name, '<div class="status-line"><span class="price">' + Core.money(service.price) + '</span><span class="badge">' + Core.safeText(service.duration) + '</span><span class="badge demo">Demo price</span></div><p>' + Core.safeText(service.description) + '</p><div class="section-head"><div><h3>Included</h3></div></div><div class="addon-list">' + service.includes.map(function (item) { return '<div class="check-row"><span aria-hidden="true">✓</span><span class="check-copy"><strong>' + Core.safeText(item) + '</strong></span></div>'; }).join("") + '</div><button class="btn btn-primary btn-block" style="margin-top:16px" data-action="book-service" data-service="' + Core.safeText(service.id) + '">Choose this package</button>');
  }

  function showAbout() {
    openModal(isLive() ? "About Clean Things" : "About this prototype", '<img src="logo.png" alt="Clean Things logo" style="display:block;width:112px;height:112px;object-fit:cover;border-radius:50%;margin:0 auto 14px"><p>' + (isLive() ? "This connected application provides role-based accounts, bookings, status tracking, MMG evidence and administrator management controls." : "This installable classroom prototype implements accounts, booking, status, MMG evidence and administrator management controls.") + '</p><div class="info-callout warning-callout">' + (isLive() ? "Connected records are stored in the secured project database." : "Use fictional information only. Setup-mode data stays on this Android device.") + ' Payment proof images use private storage in connected mode; demo mode accepts references only.</div>' + (isLive() ? '<div class="info-callout"><strong>WhatsApp and Facebook:</strong> Booking alerts use Meta\'s WhatsApp Cloud API. The app does not include Facebook login, posting or messaging.</div>' : '') + '<div class="button-row">' + (isLive() ? '' : '<button class="btn btn-danger" data-action="reset-demo">Reset demo data</button>') + '<button class="btn btn-ghost" data-action="close-modal">Close</button></div>');
  }

  function showReceipt(reference) {
    const receipt = receiptFor(reference);
    if (!receipt) return;
    openModal("Digital receipt", '<div class="success-panel"><div class="success-mark">✓</div><span class="badge demo">' + (isLive() ? 'Recorded transaction' : 'Demo receipt') + '</span><div class="reference">' + Core.safeText(receipt.number) + '</div></div><div class="card" style="margin-top:15px">' + summaryRow("Booking", receipt.bookingReference) + summaryRow("Service", receipt.service) + summaryRow("Amount", Core.money(receipt.amount)) + summaryRow("Method", receipt.method) + summaryRow("Date", new Date(receipt.date).toLocaleString("en-GY")) + '</div><p class="meta">' + (isLive() ? 'Issued from the recorded completed payment.' : 'This fictional receipt is not proof of a real transaction.') + '</p><div class="button-row"><button class="btn btn-secondary card-grow" data-action="share-receipt" data-channel="email" data-reference="' + Core.safeText(receipt.bookingReference) + '">✉ Email</button><button class="btn btn-primary card-grow" data-action="share-receipt" data-channel="whatsapp" data-reference="' + Core.safeText(receipt.bookingReference) + '">◉ WhatsApp</button></div>');
  }

  function receiptText(reference) {
    const receipt = receiptFor(reference);
    if (!receipt) return "";
    return state.settings.businessName + " receipt " + Core.safeText(receipt.number) + "\nBooking: " + Core.safeText(receipt.bookingReference) + "\nService: " + receipt.service + "\nAmount: " + Core.money(receipt.amount) + "\nMethod: " + receipt.method + (isLive() ? "" : "\nFictional demo receipt only.");
  }

  function openEditProfile() {
    const original = currentAccount();
    const account = original ? Object.assign({}, original) : null;
    if (!account) return;
    const photoField = isLive() ? '<div class="field"><label>Profile photo <span class="meta">(optional, max 3 MB)</span></label><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><span class="field-hint">Choose an image from your phone.</span></div>' + (account.avatarPath ? '<button class="btn btn-ghost btn-block" type="button" data-action="remove-avatar">Remove current photo</button>' : "") : '<div class="info-callout">Profile photos are available when using a live account.</div>';
    openModal("Edit customer profile", '<form id="profile-form">' + photoField + '<div class="field"><label>Name</label><input name="name" value="' + Core.safeText(account.name) + '"></div><div class="field"><label>Telephone</label><input name="phone" type="tel" value="' + Core.safeText(account.phone) + '"></div><div class="field"><label>Email</label><input name="email" type="email" readonly value="' + Core.safeText(account.email || "") + '" readonly></div><div class="form-grid"><div class="field"><label>Vehicle</label><input name="vehicle" value="' + Core.safeText(account.vehicle || "") + '"></div><div class="field"><label>Registration</label><input name="plate" value="' + Core.safeText(account.plate || "") + '"></div></div><div class="field"><label>Default location</label><textarea name="location">' + Core.safeText(account.location || "") + '</textarea></div><span id="profile-form-error" class="field-error"></span><button class="btn btn-primary btn-block" type="submit">Save profile</button></form>');
    document.getElementById("profile-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const oldPhone = account.phone;
      account.name = String(data.get("name") || "").trim(); account.phone = String(data.get("phone") || "").trim();  account.vehicle = String(data.get("vehicle") || "").trim(); account.plate = String(data.get("plate") || "").trim().toUpperCase(); account.location = String(data.get("location") || "").trim();
      if (!account.name || !Core.validPhone(account.phone)) { fieldMessage("profile-form-error", "Enter a name and a valid telephone number."); return; }
      if (isLive()) {
        try {
          const photo = data.get("avatar");
          if (photo && photo.size) { const uploaded = await Backend.uploadAvatar(photo); account.avatarPath = uploaded.path; account.avatarUrl = uploaded.url; }
          await Backend.updateProfile(account.id, { name: account.name, phone: account.phone, vehicle: account.vehicle, plate: account.plate, location: account.location, avatar_path: account.avatarPath || "", updated_at: new Date().toISOString() });
        } catch (error) { document.getElementById("profile-form-error").textContent = error.message; return; }
      }
      Object.assign(original, account);
      if (!isLive()) state.bookings.forEach(function (booking) { if (booking.accountId === account.id || booking.phone === oldPhone) { booking.accountId = account.id; booking.name = account.name; booking.phone = account.phone; } });
      saveState(); closeModal(); render(); showToast("Customer profile updated.");
    });
  }

  function openEditBooking(reference) {
    const original = bookingByRef(reference);
    const booking = original ? JSON.parse(JSON.stringify(original)) : null;
    if (!booking) return;
    openModal("Edit booking", '<form id="edit-booking-form"><div class="field"><label>Customer</label><input name="name" value="' + Core.safeText(booking.name) + '"></div><div class="field"><label>Telephone</label><input name="phone" type="tel" value="' + Core.safeText(booking.phone) + '"></div><div class="field"><label>Service</label><select name="serviceId">' + services.map(function (service) { return '<option value="' + Core.safeText(service.id) + '" ' + (booking.serviceId === service.id ? "selected" : "") + '>' + Core.safeText(service.name) + '</option>'; }).join("") + '</select></div><div class="form-grid"><div class="field"><label>Date</label><input name="date" type="date" value="' + Core.safeText(booking.date || dateFromNow(1)) + '"></div><div class="field"><label>Time</label><select name="time">' + availableSlots.map(function (slot) { return '<option value="' + slot.value + '" ' + (booking.time === slot.value ? "selected" : "") + '>' + slot.label + '</option>'; }).join("") + '</select></div></div><div class="form-grid"><div class="field"><label>Status</label><select name="status">' + ["Pending confirmation", "Confirmed", "Completed", "Cancelled"].map(function (status) { return '<option ' + (booking.status === status ? "selected" : "") + '>' + status + '</option>'; }).join("") + '</select></div><div class="field"><label>Total (GYD)</label><input name="total" type="number" min="0" value="' + Number(booking.total || 0) + '"></div></div><div class="field"><label>Admin notes</label><textarea name="notes">' + Core.safeText(booking.notes || "") + '</textarea></div><span id="edit-booking-error" class="field-error"></span><button class="btn btn-admin btn-block" type="submit">Save booking changes</button></form>');
    document.getElementById("edit-booking-form").addEventListener("submit", async function (event) {
      event.preventDefault(); const data = new FormData(event.currentTarget); const date = String(data.get("date")); const time = String(data.get("time"));
      if (isSlotUnavailable(date, time, booking.reference) && String(data.get("status")) !== "Cancelled") { document.getElementById("edit-booking-error").textContent = "That time is blocked or already booked."; return; }
      const service = serviceById(String(data.get("serviceId"))); if (!service || !String(data.get("name") || "").trim() || !Core.validPhone(data.get("phone")) || !Number.isFinite(Number(data.get("total"))) || Number(data.get("total")) < 0) { fieldMessage("edit-booking-error", "Check the customer, phone, service and total."); return; } booking.name = String(data.get("name") || "").trim(); booking.phone = String(data.get("phone") || "").trim(); booking.serviceId = service.id; booking.serviceName = service.name; booking.date = date; booking.time = time; booking.status = String(data.get("status")); booking.total = Number(data.get("total") || 0); booking.notes = String(data.get("notes") || "").trim();
      if (isLive()) {
        try {
          const updated = await Backend.updateBooking(booking.reference, { customer_name: booking.name, customer_phone: booking.phone, service_id: service.id, service_name: service.name, service_date: date, service_time: time, status: booking.status, total: booking.total, notes: booking.notes, change_request: "", updated_at: new Date().toISOString() });
          if (updated) Object.assign(booking, updated);
        } catch (error) { document.getElementById("edit-booking-error").textContent = error.message; return; }
      }
      booking.changeRequest = ""; Object.assign(original, booking);
      if (isLive()) { try { state.receipts = await Backend.listReceipts(); } catch (error) { showToast("Booking saved; refresh to load receipts."); } }
      createReceiptIfEligible(booking); saveState(); closeModal(); render(); showToast("Booking updated.");
    });
  }

  function confirmDeleteBooking(reference) {
    const booking = bookingByRef(reference); if (!booking) return;
    openModal("Delete booking?", '<div class="info-callout error-callout"><strong>This removes ' + Core.safeText(reference) + ' and its linked receipt ' + (isLive() ? 'from the shared database for every account.' : 'from this demo device.') + '</strong></div><div class="button-row"><button class="btn btn-danger card-grow" data-action="confirm-delete-booking" data-reference="' + reference + '">Delete permanently</button><button class="btn btn-ghost card-grow" data-action="close-modal">Keep booking</button></div>');
  }

  function openEditCustomer(phone) {
    const customer = customerRecords().find(function (item) { return item.phone === phone; }); if (!customer) return;
    openModal("Customer record", '<form id="edit-customer-form"><div class="field"><label>Name</label><input name="name" value="' + Core.safeText(customer.name) + '"></div><div class="field"><label>Telephone</label><input name="phone" value="' + Core.safeText(customer.phone || "") + '"></div><div class="field"><label>Email</label><input name="email" type="email" readonly value="' + Core.safeText(customer.email || "") + '"></div><div class="form-grid"><div class="field"><label>Vehicle</label><input name="vehicle" value="' + Core.safeText(customer.vehicle || "") + '"></div><div class="field"><label>Registration</label><input name="plate" value="' + Core.safeText(customer.plate || "") + '"></div></div><div class="field"><label>Location</label><textarea name="location">' + Core.safeText(customer.location || "") + '</textarea></div><button class="btn btn-admin btn-block" type="submit">Save customer</button></form>');
    document.getElementById("edit-customer-form").addEventListener("submit", async function (event) { event.preventDefault(); const data = new FormData(event.currentTarget); const newPhone = String(data.get("phone") || "").trim(); const account = state.accounts.find(function (item) { return item.phone === phone; }); const changes = { name: String(data.get("name") || "").trim(), phone: newPhone, vehicle: String(data.get("vehicle") || "").trim(), plate: String(data.get("plate") || "").trim().toUpperCase(), location: String(data.get("location") || "").trim(), updated_at: new Date().toISOString() }; if (!changes.name || !Core.validPhone(changes.phone)) { showToast("Enter a name and valid telephone number."); return; } if (isLive() && !customer.accountId) { showToast("Edit this walk-in through its booking record."); return; } if (isLive() && customer.accountId) { try { await Backend.updateProfile(customer.accountId, changes); } catch (error) { showToast("Customer update failed: " + error.message); return; } } if (account) { account.name = changes.name; account.phone = changes.phone;  account.vehicle = changes.vehicle; account.plate = changes.plate; account.location = changes.location; } if (!isLive()) state.bookings.forEach(function (booking) { if (booking.phone === phone) { booking.name = changes.name; booking.phone = changes.phone; booking.vehicle = changes.vehicle || booking.vehicle; booking.plate = changes.plate || booking.plate; booking.location = changes.location || booking.location; } }); saveState(); closeModal(); render(); showToast("Customer record updated."); });
  }

  function openServiceEditor(service) {
    const isNew = !service;
    const item = service ? JSON.parse(JSON.stringify(service)) : { id: "service-" + String(Date.now()).slice(-7), icon: "🫧", name: "", price: 0, duration: "45 min", description: "", includes: ["Professional vehicle care"], addOns: [], enabled: true };
    const includesText = (item.includes || []).join("\n");
    const addOnsText = (item.addOns || []).map(function (addOn) { return addOn.name + " | " + Number(addOn.price || 0) + " | " + (addOn.description || ""); }).join("\n");
    openModal(isNew ? "Add service" : "Edit service", '<form id="service-form"><div class="form-grid"><div class="field"><label>Icon</label><input name="icon" value="' + Core.safeText(item.icon) + '"></div><div class="field"><label>Duration</label><input name="duration" value="' + Core.safeText(item.duration) + '"></div></div><div class="field"><label>Service name</label><input name="name" value="' + Core.safeText(item.name) + '"></div><div class="form-grid"><div class="field"><label>Price (GYD)</label><input name="price" type="number" min="0" value="' + Number(item.price || 0) + '"></div><div class="field"><label>Display order</label><input name="displayOrder" type="number" min="0" value="' + Number(item.displayOrder || services.length + 1) + '"></div></div><div class="field"><label>Description</label><textarea name="description">' + Core.safeText(item.description || "") + '</textarea></div><div class="field"><label>What is included</label><textarea name="includes" rows="4">' + Core.safeText(includesText) + '</textarea><span class="field-hint">Enter one included item per line.</span></div><div class="field"><label>Add-ons</label><textarea name="addOns" rows="5">' + Core.safeText(addOnsText) + '</textarea><span class="field-hint">One per line: Name | Price | Description</span></div><label class="check-row"><input name="popular" type="checkbox" ' + (item.popular ? "checked" : "") + '><span><strong>Mark as popular</strong><small>Highlights this service for customers</small></span></label><span id="service-form-error" class="field-error"></span><button class="btn btn-admin btn-block" type="submit">' + (isNew ? "Add service" : "Save service") + '</button></form>');
    document.getElementById("service-form").addEventListener("submit", async function (event) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") || "").trim(); const includes = Core.serviceIncludesFromText(data.get("includes")); if (!name || !includes.length) { document.getElementById("service-form-error").textContent = !name ? "Enter a service name." : "Enter at least one included item."; return; } item.icon = String(data.get("icon") || "🫧"); item.duration = String(data.get("duration") || "").trim(); item.name = name; item.price = Math.max(0, Number(data.get("price") || 0)); item.description = String(data.get("description") || "").trim(); item.includes = includes; try { item.addOns = Core.serviceAddOnsFromText(data.get("addOns"), service ? service.addOns : []); } catch (error) { fieldMessage("service-form-error", error.message); return; } item.popular = data.get("popular") === "on"; item.displayOrder = Number(data.get("displayOrder") || 0); if (isLive()) { try { await Backend.saveService(serviceToRow(item)); } catch (error) { document.getElementById("service-form-error").textContent = error.message; return; } } if (isNew) services.push(item); else Object.assign(service, item); services.sort(function (a, b) { return Number(a.displayOrder || 0) - Number(b.displayOrder || 0); }); saveState(); closeModal(); render(); showToast(isNew ? "Service added." : "Service updated."); });
  }

  function coordinatesFromText(value) {
    const match = String(value || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -85 || latitude > 85 || longitude < -180 || longitude > 180) return null;
    return { latitude: latitude, longitude: longitude };
  }

  function worldPoint(latitude, longitude, zoom) {
    const scale = 256 * Math.pow(2, zoom);
    const boundedLatitude = Math.max(-85, Math.min(85, latitude));
    const sine = Math.sin(boundedLatitude * Math.PI / 180);
    return {
      x: (longitude + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale
    };
  }

  function coordinatesFromWorld(x, y, zoom) {
    const scale = 256 * Math.pow(2, zoom);
    const longitude = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const latitude = 180 / Math.PI * Math.atan(Math.sinh(n));
    return {
      latitude: Math.max(-85, Math.min(85, latitude)),
      longitude: ((longitude + 540) % 360) - 180
    };
  }

  function requestCurrentLocation(onSuccess, onFailure) {
    if (!navigator.geolocation) {
      showToast("Location is not available on this device. Choose a point on the map instead.");
      if (onFailure) onFailure();
      return;
    }
    showToast("Requesting current location…");
    navigator.geolocation.getCurrentPosition(function (position) {
      onSuccess(position.coords.latitude, position.coords.longitude);
    }, function (error) {
      if (error && error.code === 1) showToast("Location permission is off. Allow Clean Things in Android Settings, or choose a point on the map.");
      else if (error && error.code === 3) showToast("Location request timed out. Try again or choose a point on the map.");
      else showToast("Current location is unavailable. Choose a point on the map instead.");
      if (onFailure) onFailure(error);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  function openLocationPicker(useCurrentLocation) {
    captureDetailsDraft();
    const locationField = document.getElementById("location");
    if (locationField) ui.draft.location = locationField.value.trim();
    const pinField = document.getElementById("location-pin");
    const current = coordinatesFromText(pinField ? pinField.value : ui.draft.locationPin) || { latitude: 6.8013, longitude: -58.1551 };
    const mapState = { latitude: current.latitude, longitude: current.longitude, zoom: 14 };

    openModal("Choose service location", '<p class="meta map-help">Use the phone’s GPS, then drag the map or tap a point to adjust the centre pin.</p><button type="button" class="btn btn-primary btn-block map-current-button" data-map-current>◎ Use my current location</button><p class="field-hint map-location-status" data-map-status aria-live="polite">The centre pin is the location that will be saved.</p><div id="location-map" class="location-map" role="application" aria-label="Interactive location map"><div class="map-tiles" aria-hidden="true"></div><div class="map-pin" aria-hidden="true">●</div><div class="map-controls"><button type="button" data-map-zoom="1" aria-label="Zoom in">+</button><button type="button" data-map-zoom="-1" aria-label="Zoom out">−</button></div></div><p class="map-attribution">Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></p><div class="form-grid map-coordinate-fields"><div class="field"><label for="map-latitude">Latitude</label><input id="map-latitude" type="number" step="0.000001"></div><div class="field"><label for="map-longitude">Longitude</label><input id="map-longitude" type="number" step="0.000001"></div></div><button type="button" class="btn btn-primary btn-block" data-map-save>Use this pinned location</button><p class="field-hint">Map tiles require internet. You can still enter latitude and longitude manually.</p>');

    const map = document.getElementById("location-map");
    const tiles = map.querySelector(".map-tiles");
    const latitudeInput = document.getElementById("map-latitude");
    const longitudeInput = document.getElementById("map-longitude");
    const currentButton = modalRoot.querySelector("[data-map-current]");
    const locationStatus = modalRoot.querySelector("[data-map-status]");

    function renderMap() {
      const width = map.clientWidth || 520;
      const height = map.clientHeight || 280;
      const centre = worldPoint(mapState.latitude, mapState.longitude, mapState.zoom);
      const leftWorld = centre.x - width / 2;
      const topWorld = centre.y - height / 2;
      const minimumX = Math.floor(leftWorld / 256);
      const maximumX = Math.floor((leftWorld + width) / 256);
      const minimumY = Math.floor(topWorld / 256);
      const maximumY = Math.floor((topWorld + height) / 256);
      const tileCount = Math.pow(2, mapState.zoom);
      tiles.innerHTML = "";
      for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
        if (tileY < 0 || tileY >= tileCount) continue;
        for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
          const image = document.createElement("img");
          const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
          image.src = "https://tile.openstreetmap.org/" + mapState.zoom + "/" + wrappedX + "/" + tileY + ".png";
          image.alt = "";
          image.draggable = false;
          image.style.left = (tileX * 256 - leftWorld) + "px";
          image.style.top = (tileY * 256 - topWorld) + "px";
          tiles.appendChild(image);
        }
      }
      latitudeInput.value = mapState.latitude.toFixed(6);
      longitudeInput.value = mapState.longitude.toFixed(6);
    }

    function updateFromInputs() {
      const next = coordinatesFromText(latitudeInput.value + ", " + longitudeInput.value);
      if (!next) { locationStatus.textContent = "Enter latitude from -90 to 90 and longitude from -180 to 180."; return false; }
      mapState.latitude = next.latitude;
      mapState.longitude = next.longitude;
      renderMap();
      return true;
    }

    function locateOnMap() {
      currentButton.disabled = true;
      currentButton.textContent = "Finding your location…";
      locationStatus.textContent = "Allow location access when Android asks.";
      requestCurrentLocation(function (latitude, longitude) {
        if (!map.isConnected) return;
        mapState.latitude = latitude;
        mapState.longitude = longitude;
        mapState.zoom = 17;
        renderMap();
        currentButton.disabled = false;
        currentButton.textContent = "◎ Update current location";
        locationStatus.textContent = "Current location found. Drag the map if you need to adjust the pin.";
      }, function () {
        if (!map.isConnected) return;
        currentButton.disabled = false;
        currentButton.textContent = "◎ Try current location again";
        locationStatus.textContent = "GPS was unavailable. You can still tap or drag the map pin.";
      });
    }

    let pointerStart = null;
    map.addEventListener("pointerdown", function (event) {
      if (event.target.closest(".map-controls")) return;
      const centre = worldPoint(mapState.latitude, mapState.longitude, mapState.zoom);
      pointerStart = { x: event.clientX, y: event.clientY, worldX: centre.x, worldY: centre.y };
      map.setPointerCapture(event.pointerId);
    });
    map.addEventListener("pointerup", function (event) {
      if (event.target.closest(".map-controls")) { pointerStart = null; return; }
      if (!pointerStart) return;
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      let nextX;
      let nextY;
      if (moved < 6) {
        const bounds = map.getBoundingClientRect();
        nextX = pointerStart.worldX + event.clientX - (bounds.left + bounds.width / 2);
        nextY = pointerStart.worldY + event.clientY - (bounds.top + bounds.height / 2);
      } else {
        nextX = pointerStart.worldX + pointerStart.x - event.clientX;
        nextY = pointerStart.worldY + pointerStart.y - event.clientY;
      }
      const next = coordinatesFromWorld(nextX, nextY, mapState.zoom);
      mapState.latitude = next.latitude;
      mapState.longitude = next.longitude;
      pointerStart = null;
      renderMap();
    });
    map.addEventListener("pointercancel", function () { pointerStart = null; });
    latitudeInput.addEventListener("change", updateFromInputs);
    longitudeInput.addEventListener("change", updateFromInputs);
    currentButton.addEventListener("click", locateOnMap);
    modalRoot.querySelectorAll("[data-map-zoom]").forEach(function (button) {
      button.addEventListener("click", function () {
        mapState.zoom = Math.max(3, Math.min(18, mapState.zoom + Number(button.dataset.mapZoom)));
        renderMap();
      });
    });
    modalRoot.querySelector("[data-map-save]").addEventListener("click", function () {
      if (!updateFromInputs()) return;
      ui.draft.locationPin = mapState.latitude.toFixed(6) + ", " + mapState.longitude.toFixed(6);
      if (!ui.draft.location) ui.draft.location = "Pinned location: " + ui.draft.locationPin;
      closeModal();
      render();
      showToast("Map location saved.");
    });
    renderMap();
    if (useCurrentLocation) locateOnMap();
  }

  function captureLocation() {
    captureDetailsDraft();
    const locationField = document.getElementById("location");
    if (locationField) ui.draft.location = locationField.value.trim();
    requestCurrentLocation(function (latitude, longitude) {
      ui.draft.locationPin = latitude.toFixed(6) + ", " + longitude.toFixed(6);
      if (!ui.draft.location) ui.draft.location = "Pinned location: " + ui.draft.locationPin;
      showToast("Current location captured.");
      render();
    });
  }

  function openWalkIn() {
    openModal("Record walk-in", '<form id="walkin-form" novalidate><div class="field"><label for="walkin-name">Customer name</label><input id="walkin-name" name="name" value="Demo Walk-in" required></div><div class="field"><label for="walkin-vehicle">Vehicle</label><input id="walkin-vehicle" name="vehicle" value="Demo vehicle" required></div><div class="field"><label for="walkin-service">Service</label><select id="walkin-service" name="service">' + services.map(function (service) { return '<option value="' + Core.safeText(service.id) + '">' + Core.safeText(service.name) + ' · ' + Core.money(service.price) + '</option>'; }).join("") + '</select></div><div class="field"><label for="walkin-payment">Payment method</label><select id="walkin-payment" name="payment"><option value="Cash">Cash</option><option value="MMG">MMG</option></select></div><span id="walkin-error" class="field-error"></span><button class="btn btn-primary btn-block" type="submit">Save paid walk-in</button></form>');
    document.getElementById("walkin-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const name = String(data.get("name") || "").trim();
      const vehicle = String(data.get("vehicle") || "").trim();
      const service = serviceById(String(data.get("service") || ""));
      if (!name || !vehicle || !service) {
        document.getElementById("walkin-error").textContent = "Complete all walk-in fields.";
        return;
      }
      const booking = {
        reference: Core.nextReference(state.bookings), serviceId: service.id, serviceName: service.name,
        addOns: [], serviceMode: "bay", date: "", time: "", name: name, phone: "Not collected",
        vehicle: vehicle, plate: "Walk-in", location: "", waterConfirmed: false, notes: "Admin-recorded walk-in",
        total: service.price, status: "Completed", payment: { method: String(data.get("payment")), status: "Paid", reference: "", proofName: "" },
        createdAt: new Date().toISOString(), walkIn: true
      };
      if (isLive()) {
        try {
          const saved = await Backend.createWalkIn({ reference: booking.reference, service_id: booking.serviceId, service_name: booking.serviceName, add_ons: [], service_mode: "bay", customer_name: booking.name, customer_phone: booking.phone, vehicle: booking.vehicle, plate: booking.plate, total: booking.total, status: "Completed", payment_method: booking.payment.method, payment_status: "Paid", walk_in: true, notes: booking.notes });
          if (saved) Object.assign(booking, saved);
        } catch (error) { document.getElementById("walkin-error").textContent = error.message; return; }
      }
      state.bookings.push(booking);
      createReceiptIfEligible(booking);
      saveState();
      closeModal();
      render();
      showToast("Walk-in transaction and receipt saved.");
    });
  }

  document.addEventListener("change", async function (event) {
    const target = event.target;
    if (target.matches('[data-role="service-choice"]')) {
      ui.draft.serviceId = target.value;
      ui.draft.addOns = [];
      render();
    }
    if (target.matches('[data-role="addon-choice"]')) {
      if (target.checked && ui.draft.addOns.indexOf(target.value) < 0) ui.draft.addOns.push(target.value);
      if (!target.checked) ui.draft.addOns = ui.draft.addOns.filter(function (id) { return id !== target.value; });
      const selected = serviceById(ui.draft.serviceId);
      const totalNode = document.querySelector(".js-total");
      if (totalNode) totalNode.textContent = Core.money(Core.calculateTotal(selected, ui.draft.addOns));
    }
    if (target.matches('[data-role="mode-choice"]')) ui.draft.serviceMode = target.value;
    if (target.id === "booking-date") {
      ui.draft.date = target.value;
      ui.draft.time = "";
      if (isLive()) { try { await loadAvailability(ui.draft.date); render(); } catch (error) { showToast("Availability could not be refreshed: " + error.message); } }
      document.querySelectorAll(".slot").forEach(function (slot) { slot.classList.remove("selected"); });
    }
  });

  document.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (button.disabled) return;
    try {
    if (action === "refresh-live") { await refreshCurrentView(); }
    else if (action === "nav") navigate(button.dataset.screen);
    else if (action === "home") navigate("home");
    else if (action === "info") showAbout();
    else if (action === "start-booking") beginBooking("");
    else if (action === "book-service") { closeModal(); beginBooking(button.dataset.service); }
    else if (action === "service-details") showServiceDetails(button.dataset.service);
    else if (action === "booking-next") {
      if (ui.bookingStep === 1 && ui.draft.serviceId) {
        ui.bookingStep = 2;
        if (isLive()) { try { await loadAvailability(ui.draft.date); } catch (error) { showToast(error.message); } }
      }
      else if (ui.bookingStep === 2) {
        const error = document.getElementById("schedule-error");
        if (!ui.draft.serviceMode || !ui.draft.date || !ui.draft.time || isSlotUnavailable(ui.draft.date, ui.draft.time)) {
          if (error) error.textContent = "Choose a service location, date and available time.";
          return;
        }
        ui.bookingStep = 3;
      }
      render(); window.scrollTo(0, 0);
    }
    else if (action === "booking-back") { ui.bookingStep = Math.max(1, ui.bookingStep - 1); render(); window.scrollTo(0, 0); }
    else if (action === "select-slot") {
      ui.draft.time = button.dataset.time;
      document.querySelectorAll(".slot").forEach(function (slot) { slot.classList.toggle("selected", slot.dataset.time === ui.draft.time); });
      const error = document.getElementById("schedule-error"); if (error) error.textContent = "";
    }
    else if (action === "confirm-booking") {
      if (pendingActions.has("booking")) return;
      if (!currentAccount()) {
        routeToAccount("Your session ended. Sign in again before submitting this booking.", ui.draft.serviceId || "");
        return;
      }
      if (!document.getElementById("confirm-accuracy").checked) {
        document.getElementById("review-error").textContent = "Confirm that you checked the booking details.";
        return;
      }
      if (isSlotUnavailable(ui.draft.date, ui.draft.time)) {
        document.getElementById("review-error").textContent = "That time is no longer available. Go back and choose another slot.";
        return;
      }
      const service = serviceById(ui.draft.serviceId);
      if (!service || service.enabled === false) { fieldMessage("review-error", "Choose an available service."); return; }
      const errors = Core.validateBooking(ui.draft);
      if (Object.keys(errors).length) { fieldMessage("review-error", Object.values(errors).join(" ")); return; }
      const epoch = authEpoch;
      const account = currentAccount();
      let booking = Object.assign({}, ui.draft, {
        reference: Core.nextReference(state.bookings),
        serviceName: service.name,
        total: Core.calculateTotal(service, ui.draft.addOns),
        status: "Pending confirmation",
        payment: { method: "Not selected", status: "Not submitted", reference: "", proofName: "" },
        accountId: account ? account.id : "",
        createdAt: new Date().toISOString(),
        demo: false
      });
      if (isLive()) {
        try {
          pendingActions.add("booking"); button.disabled = true;
          const result = await Backend.createBooking(Object.assign({}, ui.draft, { email: account ? account.email : "" }));
          booking = result.booking;
          if (result.notification && result.notification.status === "sent") showToast("Booking saved and the administrator alert was sent.");
          else if (result.notification && result.notification.status === "failed") showToast("Booking saved; the administrator alert needs review.");
          else if (result.notification && result.notification.status === "queued") showToast("Booking saved; the administrator alert was queued.");
        } catch (error) {
          fieldMessage("review-error", error.message);
          return;
        } finally { pendingActions.delete("booking"); button.disabled = false; }
      }
      if (epoch !== authEpoch) return;
      state.bookings = state.bookings.filter(function (item) { return item.reference !== booking.reference; });
      state.bookings.push(booking); saveState(); ui.selectedBookingRef = booking.reference; ui.screen = "success";
      history.pushState({ screen: "success" }, "", "#success"); render(); window.scrollTo(0, 0);
    }
    else if (action === "view-proof") {
      try { const booking = bookingByRef(button.dataset.reference); const url = await Backend.signedPaymentProofUrl(booking.payment.proofPath); openModal("Payment proof", '<img class="payment-proof-image" src="' + Core.safeText(url) + '" alt="Submitted payment proof">'); }
      catch (error) { showToast(error.message); }
    }
    else if (action === "forgot-password") {
      const input = document.getElementById("customer-email"); const email = input ? input.value.trim() : "";
      if (!/^\S+@\S+\.\S+$/.test(email)) { fieldMessage("customer-login-error", "Enter your email above, then choose Reset password."); return; }
      if (pendingActions.has("recovery")) return; pendingActions.add("recovery"); button.disabled = true;
      try { await Backend.requestPasswordReset(email); fieldMessage("customer-login-error", "If the account exists, a recovery email has been requested. Check your inbox and spam folder."); }
      catch (error) { fieldMessage("customer-login-error", error.message); }
      finally { pendingActions.delete("recovery"); button.disabled = false; }
    }
    else if (action === "pay-booking") navigate("payment", { reference: button.dataset.reference });
    else if (action === "request-reschedule" || action === "request-cancel") {
      const booking = bookingByRef(button.dataset.reference);
      if (booking) {
        const changeRequest = action === "request-reschedule" ? "Reschedule requested - awaiting admin review" : "Cancellation requested - awaiting admin review";
        if (isLive()) { try { const updated = await Backend.updateMyBooking(booking.reference, action === "request-reschedule" ? "request_reschedule" : "request_cancel"); if (updated) Object.assign(booking, updated); } catch (error) { showToast("Request failed: " + error.message); return; } }
        if (!isLive()) booking.changeRequest = changeRequest;
        persistAndRender("Request sent to the admin dashboard.");
      }
    }
    else if (action === "account-mode") { ui.accountMode = button.dataset.mode; render(); }
    else if (action === "customer-logout") await logout();
    else if (action === "edit-profile") openEditProfile();
    else if (action === "remove-avatar") {
      const account = currentAccount(); if (!account || !account.avatarPath) return;
      try { await Backend.removeAvatar(account.avatarPath); await Backend.updateProfile(account.id, { avatar_path: "", updated_at: new Date().toISOString() }); account.avatarPath = ""; account.avatarUrl = ""; saveState(); closeModal(); render(); showToast("Profile photo removed."); }
      catch (error) { showToast("Photo removal failed: " + error.message); }
    }
    else if (action === "open-management") {
      const account = currentAccount();
      if (!account || account.role !== "admin") { routeToAccount("Sign in with an authorised administrator account."); return; }
      sessionStorage.setItem("cleanthings.admin.auth", "true"); navigate("admin");
    }
    else if (action === "admin-logout") await logout();
    else if (action === "admin-tab") { ui.adminTab = button.dataset.tab; if (ui.adminTab === "schedule" && isLive()) { try { await loadAvailability(ui.adminDate); } catch (error) { showToast(error.message); } } render(); window.scrollTo(0, 0); }
    else if (action === "admin-booking") await handleAdminAction(button.dataset.adminAction, button.dataset.reference);
    else if (action === "edit-booking") openEditBooking(button.dataset.reference);
    else if (action === "delete-booking") confirmDeleteBooking(button.dataset.reference);
    else if (action === "confirm-delete-booking") { if (isLive()) { try { await Backend.deleteBooking(button.dataset.reference); } catch (error) { showToast("Delete failed: " + error.message); return; } } state.bookings = state.bookings.filter(function (booking) { return booking.reference !== button.dataset.reference; }); state.receipts = state.receipts.filter(function (receipt) { return receipt.bookingReference !== button.dataset.reference; }); saveState(); closeModal(); render(); showToast("Booking deleted."); }
    else if (action === "toggle-day") { const index = state.schedule.closedDates.indexOf(ui.adminDate); const nextStatus = index >= 0 ? "open" : "blocked"; if (isLive()) { try { await Backend.setDayAvailability(ui.adminDate, nextStatus); } catch (error) { showToast("Schedule update failed: " + error.message); return; } } if (index >= 0) { state.schedule.closedDates.splice(index, 1); state.schedule.blockedSlots = state.schedule.blockedSlots.filter(function (key) { return !key.startsWith(ui.adminDate + "|"); }); } else { state.schedule.closedDates.push(ui.adminDate); availableSlots.forEach(function (slot) { const key = slotKey(ui.adminDate, slot.value); if (state.schedule.blockedSlots.indexOf(key) < 0) state.schedule.blockedSlots.push(key); }); } persistAndRender(index >= 0 ? "Day opened." : "Day closed."); }
    else if (action === "toggle-admin-slot") { const key = slotKey(ui.adminDate, button.dataset.time); const index = state.schedule.blockedSlots.indexOf(key); if (isLive()) { try { await Backend.setAvailability(ui.adminDate, button.dataset.time, index >= 0 ? "open" : "blocked"); } catch (error) { showToast("Schedule update failed: " + error.message); return; } } if (index >= 0) state.schedule.blockedSlots.splice(index, 1); else state.schedule.blockedSlots.push(key); state.schedule.closedDates = state.schedule.closedDates.filter(function (date) { return date !== ui.adminDate; }); persistAndRender(index >= 0 ? "Time slot opened." : "Time slot blocked."); }
    else if (action === "edit-customer") openEditCustomer(button.dataset.phone);
    else if (action === "add-service") openServiceEditor(null);
    else if (action === "edit-service") openServiceEditor(serviceById(button.dataset.service));
    else if (action === "toggle-service") { const service = serviceById(button.dataset.service); if (service) { service.enabled = service.enabled === false; if (isLive()) { try { await Backend.saveService(serviceToRow(service)); } catch (error) { service.enabled = !service.enabled; showToast("Service update failed: " + error.message); return; } } persistAndRender(service.enabled ? "Service is visible." : "Service hidden from customers."); } }
    else if (action === "toggle-theme") { state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark"; persistAndRender("Appearance updated."); }
    else if (action === "choose-location") openLocationPicker(false);
    else if (action === "choose-current-location") openLocationPicker(true);
    else if (action === "use-location") captureLocation();
    else if (action === "view-receipt") showReceipt(button.dataset.reference);
    else if (action === "share-receipt") {
      const text = receiptText(button.dataset.reference); const booking = bookingByRef(button.dataset.reference);
      const url = button.dataset.channel === "email" ? "mailto:" + encodeURIComponent((currentAccount() && currentAccount().email) || "") + "?subject=" + encodeURIComponent(state.settings.businessName + " receipt") + "&body=" + encodeURIComponent(text) : "https://wa.me/" + encodeURIComponent(String((booking && booking.phone) || "").replace(/\D/g, "")) + "?text=" + encodeURIComponent(text);
      window.location.href = url;
    }
    else if (action === "open-walkin") openWalkIn();
    else if (action === "copy-mmg") {
      const text = button.dataset.reference;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
      showToast("Payment note: " + text);
    }
    else if (action === "close-modal") closeModal();
    else if (action === "reset-demo") {
      localStorage.removeItem(STORE_KEY); state = defaultState(); services = state.services; availableSlots = state.schedule.slots; sessionStorage.removeItem("cleanthings.customer.id"); sessionStorage.removeItem("cleanthings.admin.auth"); saveState(); closeModal(); navigate("home"); showToast("Demo data reset.");
    }
    } catch (error) { showToast(error.message || "The action could not be completed."); }
  });

  window.addEventListener("popstate", function (event) {
    ui.screen = event.state && event.state.screen ? event.state.screen : "home";
    render();
  });

  window.addEventListener("cleanthings:session-ended", function () {
    clearIdentity(); closeModal(); ui.screen = "account"; ui.authNotice = "Your session ended. Sign in again."; render();
  });
  history.replaceState({ screen: "home" }, "", "#home");
  render();
  bootstrapBackend();
})();
