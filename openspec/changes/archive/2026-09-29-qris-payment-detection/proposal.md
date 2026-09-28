# Proposal

## Why

QRIS payments today are display-only: the app shows a QR and the cashier confirms
"Sudah Dibayar" on pure faith, glancing at the bank app's notification shade to
verify. The settlement notification already lands on the POS device (the
merchant's bank/e-wallet app is installed there) — the app just has no eyes on
it. Closing that loop makes confirmation fast, evidence-based, and catches
underpayments the cashier cannot see today.

## What Changes

- Add an Android `NotificationListenerService` that watches incoming
  notifications only from merchant-selected packages (bank/e-wallet apps),
  parses Rupiah amounts, and emits parsed payment events to the webview.
- New QRIS bridge plugin commands: list launchable installed apps, read/write
  the monitored-package allowlist to native SharedPreferences (fast-path read
  for the service, no JS/Rust bridge needed).
- Settings UI: searchable list of installed apps with toggles for which apps to
  monitor (persisted locally; survives reboot/process death).
- Parse notifications into a three-state outcome per event: exact match,
  mismatch (visible but inert), or no-amount (dropped).
- New dedicated QRIS pay screen: big screen-width QR, total, waiting state,
  live "Notifikasi masuk" event list backed by a native ring buffer, and an
  L1 armed confirm (auto-arms only on exact-match events posted during the
  payment session; manual "Sudah Dibayar" always available).
- Payment flow becomes multi-step for QRIS: payment page (form + customer
  details) → Konfirmasi → QR pay screen → payment confirmed → order commit →
  receipt. Cash flow unchanged. For QRIS the order commits on the QR pay
  screen, not at Konfirmasi.
- Notification access grant UX: first-use step with deep link to system
  notification-access settings and granted-state detection.

## Capabilities

### New Capabilities

- `qris-detection`: notification listening, allowlist configuration,
  amount parsing, event ring buffer, and the armed-confirm interaction model.
- `qris-pay-screen`: the dedicated QR display/waiting screen, its
  state machine, and the multi-step payment flow integration.

### Modified Capabilities

- None. QRIS payload rendering (`QRisQR`) is reused as-is; the existing payment
  page keeps its role as the form hub (method + customer + notes + Konfirmasi).

## Impact

- **Affected apps/packages**: `apps/pos-app` (new Kotlin service + plugin in
  `src-tauri/gen/android`, Rust plugin registration, SolidJS payment pages,
  settings section), AndroidManifest (`<queries>` launcher intent, service
  declaration, listener permission).
- **No sync/contract changes**: allowlist and events are device-local and
  never synced (bank notification text may contain sender names; amounts alone
  are not merchant-wide data).
- **Risks**: parser correctness decides whether matching works at all (L1
  makes wrong parses safe-but-visible, not dangerous); notification access is
  a special permission users may not grant — manual confirm remains the
  always-available fallback.
