# Technical design - v0.6.0

## Components and boundaries

The Android activity hosts bundled HTML/CSS/JavaScript under a local HTTPS origin. Only the explicit asset allowlist can be served there. External HTTP(S)/email links open through Android. File/content access and mixed content are disabled. The geolocation callback checks the app origin before requesting coarse/fine Android permission. Manual map coordinates remain available after denial or timeout.

`app.js` manages rendering and workflows; `core.js` contains validation, totals and escaping; `backend.js` handles Supabase Auth, REST/RPC and Storage. The adapter enforces a request timeout and serialises token refresh. Client checks help users; database policies and RPCs enforce authority.

```mermaid
flowchart TD
  U["Customer or administrator"] --> A["Android app or browser"]
  A -->|"HTTPS, public key and user JWT"| S["Supabase Auth and API"]
  S -->|"RLS and ownership checks"| D["PostgreSQL"]
  S -->|"Private object policies"| P["Payment images"]
  A -->|"Public tile requests"| M["OpenStreetMap"]
  D -->|"Server Vault credentials"| W["Meta WhatsApp API"]
```

The device is outside the trusted database boundary. No role flag or posted price is trusted. The database calculates service/add-on totals, locks the appointment date, uses a unique active-slot index and deduplicates a customer's retry UUID. Shared availability exposes only slot time/status, including occupancy by other customers. It refreshes on schedule entry/date change or explicit Refresh; the final database write rejects races. It is not a continuous realtime subscription.

## Data model

| Entity | Link and responsibility |
| --- | --- |
| Auth user / profile | Profile UUID references Auth identity; protected customer/admin role |
| Services | Published catalogue, prices and stable add-on identifiers |
| Availability overrides | Unique date/time, admin-managed open/blocked state |
| Bookings | Owner, service snapshot, slot, location, request UUID, workflow and payment state |
| Payment proof object | Private path scoped to owner and booking; path referenced by booking |
| Receipts | One receipt per completed paid booking; amount/method/date linked to that booking |
| Settings | Public business/MMG details, atomically updated by administrator |
| Notification log | Server integration attempts; provider delivery needs separate verification |

Connected personal records stay in memory and are cleared at logout. Only theme preferences are written to the app-state cache; Auth tokens remain in local storage for session continuity. Demo records are local, fictional and use public passwords. Browser/Android secure-origin checks do not replace a device-security or penetration review.

## Design decisions and debt

The map is OpenStreetMap with browser geolocation. Google Maps was not integrated. No external JavaScript map library or API key is loaded. User-controlled service fields are escaped and the page CSP excludes external scripts. Dark/light colour tokens and accessible labels share one UI. Forms preserve details while a location modal is open and commit changes only after a successful backend response.

A receipt makes core financial/service fields immutable through the booking trigger; real refunds/adjustments require a separately designed reviewed workflow. Administrator deletion remains available for prototype cleanup and cascades to linked receipts; the UI must accurately warn about shared deletion. A production retention/audit strategy is still required. Historical uploads need reconciliation and object-byte backups. The private proof bucket restricts claimed MIME type and size, but does not implement antivirus scanning or independent file-signature inspection.

There is no verified background/offline write queue, push-notification delivery guarantee, password-recovery hosting or automatic orphan-file cleanup in this repository. CI is prepared but awaits its first actual GitHub run. These are documented deployment limits, not reported as completed tests.

Reference: [Android WebView guidance](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview), [PGlite snapshot API](https://pglite.dev/docs/api).
