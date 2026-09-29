const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const storage = new Map();
const calls = [];
// These values are assembled test fixtures, not deployable credentials.
const FIXTURE_PUBLISHABLE_KEY = ["sb", "publishable", "fixture", "adapter"].join("_");
const FIXTURE_PASSWORD = ["Example", String(100 + 23)].join("");
const context = {
  window: {
    CLEAN_THINGS_CONFIG: {
      supabaseUrl: "https://clean-things.supabase.co",
      supabasePublishableKey: FIXTURE_PUBLISHABLE_KEY
    }
  },
  localStorage: {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  },
  fetch: async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/auth/v1/token?grant_type=password")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "user-1" } });
    }
    if (url.includes("/auth/v1/signup")) {
      return response({ id: "user-2", email: "new@example.com", identities: [{ id: "identity-2" }] });
    }
    if (url.includes("/rest/v1/rpc/update_my_booking")) {
      return response(bookingRow());
    }
    if (url.includes("/storage/v1/object/sign/avatars/")) {
      return response({ signedURL: "/object/sign/avatars/user-1/profile?token=test" });
    }
    return response([]);
  },
  console,
  AbortController,
  setTimeout,
  clearTimeout,
  crypto: require('node:crypto').webcrypto,
  Date,
  JSON,
  Object,
  String,
  Number,
  RegExp,
  Error,
  encodeURIComponent
};
context.window.window = context.window;

function response(payload, ok = true) {
  return { ok, text: async () => JSON.stringify(payload) };
}

function bookingRow() {
  return {
    id: "booking-1", reference: "CT-TEST", user_id: "user-1", service_id: "essential",
    service_name: "Essential Wash", add_ons: [], service_mode: "bay", service_date: "2026-09-01",
    service_time: "08:30:00", customer_name: "Test Customer", customer_phone: "5926000000",
    vehicle: "Test car", plate: "TEST", total: 3000, status: "Confirmed",
    payment_method: "Not selected", payment_status: "Not submitted", created_at: new Date().toISOString()
  };
}

vm.createContext(context);
vm.runInContext(fs.readFileSync("app/src/main/assets/backend.js", "utf8"), context);
const Backend = context.window.CleanThingsBackend;

(async () => {
  assert.strictEqual(Backend.enabled(), true, "valid Supabase config should enable live mode");
  await Backend.signIn("customer@example.com", FIXTURE_PASSWORD);
  assert.strictEqual(Backend.session().user.id, "user-1", "sign-in session should persist");

  const signUpResult = await Backend.signUp({ name: "New Customer", phone: "+592 600 0000", email: "new@example.com" }, FIXTURE_PASSWORD);
  assert.strictEqual(signUpResult.user.id, "user-2", "a direct pending-user response should be normalised");
  assert.strictEqual(signUpResult.session, null, "an email-confirmation signup should not create a session prematurely");
  const signUpCall = calls.find((call) => call.url.includes("/auth/v1/signup"));
  assert.deepStrictEqual(JSON.parse(signUpCall.options.body).data, { name: "New Customer", phone: "+592 600 0000" }, "sign-up should send profile metadata for the database trigger");

  const mapped = Backend.bookingFromRow(bookingRow());
  assert.strictEqual(mapped.time, "08:30", "database time should map to UI time");
  assert.strictEqual(mapped.payment.status, "Not submitted", "payment fields should map safely");

  const updated = await Backend.updateMyBooking("CT-TEST", "request_cancel");
  assert.strictEqual(updated.reference, "CT-TEST", "restricted customer update should return mapped booking");
  const actionCall = calls.find((call) => call.url.includes("update_my_booking"));
  assert.ok(actionCall, "customer updates should use the restricted database RPC");
  assert.strictEqual(JSON.parse(actionCall.options.body).input.action, "request_cancel");

  const signedUrl = await Backend.signedAvatarUrl("user-1/profile");
  assert.ok(signedUrl.includes("/storage/v1/object/sign/avatars/user-1/profile"), "private avatar URLs should be signed");

  await Backend.uploadAvatar({ type: "image/jpeg", size: 1024 });
  const uploadCall = calls.find((call) => call.url.endsWith("/storage/v1/object/avatars/user-1/profile") && call.options.method === "POST");
  assert.ok(uploadCall, "profile photo should upload to the signed-in user's folder");
  assert.strictEqual(uploadCall.options.headers["x-upsert"], "true", "a new profile photo should replace the old one");

  const file = { type: "image/png", size: 1024, name: "proof.png" };
  const proof = await Backend.uploadPaymentProof(file, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const proofCall = calls.find(call => call.url.includes('/object/payment-proofs/'));
  assert.strictEqual(proofCall.options.body, file, "proof upload must send file bytes/body, not only its name");
  assert.strictEqual(proofCall.options.headers['x-upsert'], 'false');
  assert.ok(proof.path.startsWith('user-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'));
  await assert.rejects(() => Backend.uploadPaymentProof({type:'image/svg+xml',size:100}, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), /JPEG/);
  await assert.rejects(() => Backend.uploadPaymentProof({type:'image/png',size:4000000}, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), /3 MB/);

  const originalFetch = context.fetch;
  context.window.CLEAN_THINGS_CONFIG.requestTimeoutMs = 15;
  context.fetch = (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  await assert.rejects(() => Backend.listServices(), /timed out/, 'F12 stalled requests should abort with a usable message');
  context.fetch = originalFetch;

  await Backend.signOut();
  await assert.rejects(() => Backend.createBooking({ serviceId: "essential" }), /Sign in or create an account/, "guest booking should be rejected in the client adapter");

  console.log("Backend adapter tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
