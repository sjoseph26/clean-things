const assert = require("assert");
const core = require("../app/src/main/assets/core.js");

const service = {
  price: 3000,
  addOns: [
    { id: "tyres", price: 800 },
    { id: "vacuum", price: 1500 }
  ]
};

assert.strictEqual(core.calculateTotal(service, []), 3000, "base price should be retained");
assert.strictEqual(core.calculateTotal(service, ["tyres", "vacuum"]), 5300, "add-ons should be included once");
assert.strictEqual(core.calculateTotal(null, ["tyres"]), 0, "missing service should total zero");

const valid = {
  serviceId: "essential",
  serviceMode: "bay",
  date: "2026-08-27",
  time: "09:00",
  name: "Demo Customer",
  phone: "592-600-0000",
  vehicle: "Toyota Allion",
  plate: "DEMO-001"
};
assert.deepStrictEqual(core.validateBooking(valid), {}, "complete wash-bay booking should validate");

const mobile = Object.assign({}, valid, { serviceMode: "mobile", location: "", waterConfirmed: false });
const mobileErrors = core.validateBooking(mobile);
assert.ok(mobileErrors.location, "mobile booking should require a location");
assert.ok(mobileErrors.waterConfirmed, "mobile booking should require water confirmation");

assert.strictEqual(core.safeText("<script>\"x\"</script>"), "&lt;script&gt;&quot;x&quot;&lt;/script&gt;", "displayed user text should be escaped");
assert.ok(/^CT-\d{6}-01$/.test(core.nextReference([])), "reference should use the expected format");

const insideAction = {};
const outsideBackdrop = {};
const sheet = { contains: (node) => node === insideAction };
assert.strictEqual(core.shouldStopModalClick(sheet, { closest: () => insideAction }), false, "buttons inside a modal should reach the shared action handler");
assert.strictEqual(core.shouldStopModalClick(sheet, { closest: () => outsideBackdrop }), true, "ordinary modal taps must not trigger the backdrop action");
assert.strictEqual(core.shouldStopModalClick(sheet, { closest: () => null }), true, "non-action modal content must not bubble to the backdrop");

assert.deepStrictEqual(core.serviceIncludesFromText("Exterior wash\n Wheel rinse \n\nHand dry"), ["Exterior wash", "Wheel rinse", "Hand dry"], "included service items should parse one per line");
assert.deepStrictEqual(core.serviceAddOnsFromText("Tyre shine | 800 | Finished tyres\nVacuum | 1500"), [
  { id: "tyre-shine-1", name: "Tyre shine", price: 800, description: "Finished tyres" },
  { id: "vacuum-2", name: "Vacuum", price: 1500, description: "" }
], "admin add-ons should parse from the documented format");

console.log("All Clean Things core tests passed.");
