// Static source contracts only; this does not execute Android permissions.
const assert = require("assert");
const fs = require("fs");

const manifest = fs.readFileSync("app/src/main/AndroidManifest.xml", "utf8");
const activity = fs.readFileSync("app/src/main/java/gy/cleanthings/app/MainActivity.java", "utf8");
const app = fs.readFileSync("app/src/main/assets/app.js", "utf8");
const build = fs.readFileSync("build-apk.sh", "utf8");

assert.ok(manifest.includes("android.permission.ACCESS_COARSE_LOCATION"), "APK must declare approximate location access");
assert.ok(manifest.includes("android.permission.ACCESS_FINE_LOCATION"), "APK must declare precise location access");
assert.ok(manifest.includes('android.hardware.location" android:required="false"'), "GPS must remain optional for devices without a provider");
assert.ok(activity.includes("settings.setGeolocationEnabled(true)"), "WebView geolocation must be enabled");
assert.ok(activity.includes("onGeolocationPermissionsShowPrompt"), "WebView must bridge geolocation permission prompts to Android");
assert.ok(activity.includes("requestPermissions("), "Android runtime location permission must be requested");
assert.ok(activity.includes("pendingGeolocationCallback.invoke"), "WebView must receive the permission result");
assert.ok(app.includes('data-action="choose-location"'), "booking details must offer a manual map picker");
assert.ok(app.includes('data-action="choose-current-location"'), "booking details must offer a GPS-centred pin");
assert.ok(app.includes('data-map-current'), "the map picker must include a current-location control");
assert.ok(app.includes("if (useCurrentLocation) locateOnMap()"), "the GPS action must centre the map automatically");
assert.ok(app.includes("mapState.zoom = 17"), "the GPS pin must zoom to a useful street-level view");
assert.ok(app.includes("function openLocationPicker(useCurrentLocation)"), "manual and GPS-centred map picker logic must be packaged");
assert.ok(app.includes("https://tile.openstreetmap.org/"), "the map picker must load secure map tiles");
assert.ok(app.includes("choose a point on the map"), "GPS failures must offer the manual fallback");
assert.ok(build.includes('--version-code 22'), "the current repair must install as a newer Android build");
assert.ok(build.includes('VERSION="0.6.10"'), 'build version must match the current release');
assert.ok(activity.includes('https://') && activity.includes('isAppOrigin'), 'geolocation must be restricted to the app HTTPS origin');

console.log("Native, GPS-centred pin and manual location tests passed.");
