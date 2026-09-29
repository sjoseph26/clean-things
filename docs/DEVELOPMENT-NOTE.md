# Technical design - v0.6.9

## v0.6.9 tester update

This build addresses Randy's payment-image setup error, weekday/weekend evening hours, newest-first admin bookings and the Customer/Admin view switch. It is based on the v0.6.2 tester baseline; biometric login and staged MFA remain on their separate feature branch. The targeted database repair was applied to Clean Things Live after owner approval on 29 September 2026. All seven configuration checks passed, and an authenticated read-only availability call returned the expected weekday/weekend hours. Real-phone receipt upload and acceptance remain pending. See [Randy feedback and acceptance](RANDY-FEEDBACK-v0.6.9.md).


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

## Refresh interaction (v0.6.1)

`pull-refresh.js` owns the touch gesture and a single-request loading state; `app.js` determines eligible screens and reuses the existing backend refresh path. Refresh does not reload the WebView. The indicator is outside the rerendered content. The keyboard action appears on focus; live-region messages announce progress and outcome. Reduced-motion settings disable spinner animation.

## Admin feedback repair (v0.6.2)

The authenticated profile remains separate from directory completeness. Refresh operations preserve that profile while merging other customer records. Auth refresh is serialized per login generation, and rejected resource requests receive at most one retry with a renewed token. Definitive refresh-token/session error codes clear identity; network and generic permission failures do not. Ordinary logout explicitly uses local scope. See [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout) and [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes).

Add-on fieldsets preserve database JSON structure and IDs, independent of names or description punctuation. Month filtering applies to appointment dates, with Guyana-local creation dates for walk-ins. The native Back handler first evaluates the page's synchronous dialog-dismissal hook; browser history handling has the same visible behaviour. Every HTML asset must pass the native asset allowlist test.
