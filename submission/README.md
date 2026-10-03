# Clean Things submission handover — 3 October 2026

This folder is reserved for the frozen assessment build and its handover record.

## Approved application artifact

- File: `CleanThings-Live-v0.6.10.apk`
- Android package: `gy.cleanthings.app`
- Version name: `0.6.10-live`
- Version code: `22`
- Minimum Android API: `24` (Android 7.0)
- Target API: `35`
- SHA-256: `aa20d0b9c4deb8d6f2771bb647f5c3955c159395c04ac4ef7620ecee6cade702`

The v0.6.10-live APK is frozen for submission. Do not rebuild the repository's older v0.6.2 source and distribute that build as v0.6.10.

## Source / binary distinction

The `main` branch currently contains the reproducible v0.6.2 source baseline. The complete matching native source/signing history for the later v0.6.10-live APK has not been recovered into this repository. The submission APK is therefore a preserved assessment artifact, not evidence that `main` can reproduce v0.6.10.

## Submission documentation

The final guides belong in `docs/guides/`:

- `Clean_Things_User_Guide.docx`
- `Clean_Things_Deployment_Guide.docx`
- `Clean_Things_Administrative_Guide.docx`

The guides describe the frozen v0.6.10-live interface while clearly separating current behavior from deferred work.

## Deferred work

The submitted build does **not** provide automated MMG API checkout/refunds. MMG transfers and evidence verification remain manual.

The agreed late-cancellation enhancement is also future work: a cancellation request submitted less than 24 hours before the appointment would incur a proposed fee of 15% of the booking total. The frozen submission does not calculate or enforce that rule.
