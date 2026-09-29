# Pull-to-refresh verification — 29 September 2026

Version 0.6.1, Android version code 13.

- 55 automated tests passed, including seven pull-to-refresh cases.
- 98 browser state/timing results, including pull-to-refresh in light and dark themes. No selected-rule accessibility violations.
- The connected APK compiles and its v2/v3 signatures verify with the earlier Live signing certificate. Bundled assets match source.
- Browser checks use fictional backend responses. Physical Android gestures, upgrades and live account workflows still require device testing.

See [unit results](unit-tests.txt), [browser results](browser-results.json) and the [test plan](../../TEST-PLAN.md).
