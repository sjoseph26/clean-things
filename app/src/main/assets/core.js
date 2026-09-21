(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CleanThingsCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function money(value) {
    return "GYD " + Number(value || 0).toLocaleString("en-US");
  }

  function calculateTotal(service, selectedAddOns) {
    if (!service) return 0;
    const ids = selectedAddOns || [];
    return service.price + service.addOns
      .filter(function (item) { return ids.indexOf(item.id) >= 0; })
      .reduce(function (sum, item) { return sum + item.price; }, 0);
  }

  function validateBooking(draft) {
    const errors = {};
    if (!draft.serviceId) errors.serviceId = "Choose a service package.";
    if (!draft.serviceMode) errors.serviceMode = "Choose where the service will take place.";
    if (!draft.date) errors.date = "Choose an appointment date.";
    if (!draft.time) errors.time = "Choose an available time.";
    if (!String(draft.name || "").trim()) errors.name = "Enter the customer name.";
    if (!validPhone(draft.phone)) {
      errors.phone = "Enter a valid telephone number.";
    }
    if (!String(draft.vehicle || "").trim()) errors.vehicle = "Enter the vehicle make or model.";
    if (!String(draft.plate || "").trim()) errors.plate = "Enter the vehicle registration number.";
    if (draft.serviceMode === "mobile") {
      if (!String(draft.location || "").trim()) errors.location = "Enter the service location.";
      if (!draft.waterConfirmed) errors.waterConfirmed = "Confirm that a suitable water source is available.";
    }
    return errors;
  }

  function nextReference(bookings) {
    const next = (bookings || []).length + 1;
    return "CT-" + String(Date.now()).slice(-6) + "-" + String(next).padStart(2, "0");
  }

  function safeText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function shouldStopModalClick(sheet, target) {
    const action = target && target.closest ? target.closest("[data-action]") : null;
    return !action || !sheet.contains(action);
  }

  function serviceIncludesFromText(value) {
    return String(value || "").split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function slug(value) {
    return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "add-on";
  }

  function validPhone(value) {
    const text = String(value || "").trim();
    const digits = text.replace(/\D/g, "");
    return /^\+?[0-9 ()-]+$/.test(text) && digits.length >= 7 && digits.length <= 15;
  }

  function serviceAddOnsFromText(value, existing) {
    const used = new Set();
    return String(value || "").split(/\r?\n/).map(function (line, index) {
      const parts = line.split("|").map(function (part) { return part.trim(); });
      if (!parts[0]) return null;
      const price = Number(parts[1] || 0);
      if (!Number.isFinite(price) || price < 0) throw new Error("Add-on prices must be valid non-negative numbers.");
      const previous = (existing || []).find(function (item) { return item.name === parts[0] && !used.has(item.id); });
      let id = previous ? previous.id : slug(parts[0]) + "-" + (index + 1);
      while (used.has(id) || (!previous && (existing || []).some(function (item) { return item.id === id; }))) id += "-new";
      used.add(id);
      return { id: id, name: parts[0], price: price, description: parts[2] || "" };
    }).filter(Boolean);
  }

  return {
    money: money,
    calculateTotal: calculateTotal,
    validateBooking: validateBooking,
    nextReference: nextReference,
    safeText: safeText,
    validPhone: validPhone,
    shouldStopModalClick: shouldStopModalClick,
    serviceIncludesFromText: serviceIncludesFromText,
    serviceAddOnsFromText: serviceAddOnsFromText
  };
});
