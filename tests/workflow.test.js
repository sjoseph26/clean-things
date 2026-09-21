// Static source contracts; see regression.test.cjs for executable UI behaviour.
const assert = require("assert");
const fs = require("fs");

const app = fs.readFileSync("app/src/main/assets/app.js", "utf8");
const config = fs.readFileSync("app/src/main/assets/config.js", "utf8");
const initialRpc = fs.readFileSync("supabase/migrations/202608300002_secure_rpc_whatsapp.sql", "utf8");
const restriction = fs.readFileSync("supabase/migrations/202608310003_require_authenticated_booking.sql", "utf8");

assert.ok(app.includes('routeToAccount("Sign in or create an account before booking a service."'), "booking actions should route guests to account access");
assert.ok(app.includes('account.role === "admin"'), "the regular login flow should elevate administrator accounts by role");
assert.ok(app.includes('data-action="open-management"'), "management access should appear only after role-aware sign-in");
assert.ok(!app.includes("Admin sign-in"), "the app should not advertise a separate administrator login");
assert.ok(!app.includes("admin-login-form"), "the separate administrator form should be removed");
assert.ok(!config.includes("adminEmail"), "the packaged configuration should not expose an administrator email");
assert.ok(!/grant execute on function public\.create_booking\(jsonb\) to anon/.test(initialRpc), "fresh installs should not grant guest booking execution");
assert.ok(restriction.includes("revoke execute on function public.create_booking(jsonb) from anon"), "the live migration should revoke guest booking execution");
assert.ok(restriction.includes("grant execute on function public.create_booking(jsonb) to authenticated"), "signed-in users should retain booking access");
assert.ok(app.includes('name="confirmPassword"'), "account creation should require password confirmation");
assert.ok(app.includes("At least one letter") && app.includes("At least one number"), "password requirements should be visible before submission");
assert.ok(app.includes("friendlySignUpError"), "sign-up failures should be translated into actionable messages");
assert.ok(app.includes("One confirmation email can be requested per address each minute"), "the email interval should be shown before account creation");
assert.ok(app.includes('submitButton.disabled = true'), "repeated sign-up taps should be prevented while the request is running");

console.log("Authentication and booking workflow tests passed.");
