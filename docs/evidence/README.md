# Verification evidence - v0.6.0

Collected 21 September 2026 against the source files in [source-hashes.json](source-hashes.json). Tool versions and explicit scope flags are in [verification-summary.json](verification-summary.json).

| Executed check | Result | Raw evidence |
| --- | --- | --- |
| `npm test` | 40 reported tests pass; 0 fail/skip | [Unit output](unit-tests.txt) |
| `npm run test:browser` | 90 UI-state checks + 6 timing samples; 0 runtime errors, overflow failures or selected-rule axe violations | [Browser output](browser-run.txt), [JSON](browser-results.json) |
| Native compilation | QA and connected builds compile from Java; signature v2/v3 verification succeeds | [QA log](native-qa.txt), [connected log](native-live.txt) |
| APK inspection | Code 12; three unique permissions; live certificate matches v0.5.5 | [APK metadata and hashes](apk-verification.json) |
| Dependency audit | 0 reported vulnerabilities at execution time | [Audit JSON](dependency-audit.json) |
| Dependency metadata | Pinned test packages and declared licences inspected | [Licence metadata](dependency-licenses.json) |

The Node total includes legacy files containing multiple assertions and a parent SQL test; it is not a count of 40 independent real-world workflows. APK asset bytes were compared with the current source and its compiled DEX was checked for the HTTPS origin/geolocation callback. Source links, versions, JavaScript/shell syntax and clean ZIP exclusions were checked during packaging.

## Representative actual browser screenshots

[Light home](393-light-home.png) · [Dark home](393-dark-home.png) · [Light map](393-light-map.png) · [Dark map](393-dark-map.png) · [Light payment](393-light-payment.png) · [Dark payment](393-dark-payment.png)

These are screenshots of the running app with fictional records. Blank map tiles are intentional remote-network fixtures and GPS is simulated. The full browser evidence bundle contains all 30 screenshots. The latest screenshot pass uses the viewport so fixed-position elements are represented correctly.

## Practical limits

Remote Auth/REST/Storage responses were mocked in browser tests. SQL tests execute the application policies and migrations in PGlite with service-schema fixtures. The local snapshot restore covers database records and Storage metadata, not actual hosted object bytes. Timings of roughly 82-130 ms for mocked loads and 107-125 ms for mocked submissions are measurements of this fixture, not normal mobile-network acceptance.

No live migration, real phone, actual Storage API, normal-network performance test, hosted recovery, new human usability session or GitHub-hosted workflow run is claimed. The corrected browser timing waits for the async admin schedule render before measuring settled colours. Earlier failing intermediate runs prompted fixes; only this final passing run is the current evidence. See [test scope](../TEST-PLAN.md) and [release gates](../RELEASE-STATUS.md).
