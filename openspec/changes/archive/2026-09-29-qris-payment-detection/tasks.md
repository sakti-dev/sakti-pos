# Tasks

## 1. Native foundation

- [x] 1.1 Add the `<queries>` launcher intent (`ACTION_MAIN` +
  `CATEGORY_LAUNCHER`) to the AndroidManifest, declare the notification
  listener service with `BIND_NOTIFICATION_LISTENER_SERVICE`, and verify the
  app still builds (`bun app:dev` or gradle assemble) with no merged-manifest
  warnings
- [x] 1.2 Create the Rupiah parser as a pure Kotlin function (Rp-anchored,
  cents-aware per design D4) with top-level regex vals, and unit tests
  covering the corpus: `Rp15.000`, `Rp 15.000`, `Rp15.000,00`, `15.000` (no
  marker → null), reference codes/phone numbers → null — run via gradle test
- [x] 1.3 Implement `QrisNotificationService` (allowlist fast-path read from
  native prefs, parse, append to capped 20-event ring buffer, emit to bridge
  when webview alive, ignore non-allowlisted packages) and verify the buffer
  caps and persists with a unit test on the buffer logic
- [x] 1.4 Implement the plugin commands `get_installed_apps` (launchable
  apps only, app label + package name) and `set_allowed_packages` (write
  native prefs), plus `get_recent_events` / `mark...` drain command for the
  ring buffer, registered from a new Rust `qris` module following the
  `auth::init()` pattern in `lib.rs`

## 2. Settings: monitored apps

- [x] 2.1 Add a "Aplikasi yang dipantau" section to Settings (following
  `section-tax.tsx` patterns) with searchable app list, toggles, and
  persistence to the app's local store, re-pushing to native prefs on mount;
  verify toggling an app then restarting the app preserves the selection
- [x] 2.2 Add the notification-access step to the QRIS walkthrough (deep
  link to system notification-listener settings, granted-state detection on
  resume) and verify the walkthrough shows the correct state before/after
  granting in device settings

## 3. Payment session and event matching (JS)

- [x] 3.1 Create a payment-events module: subscribe to the bridge event,
  drain the native buffer on app resume, keep events as a signal, compute
  the three-state outcome vs the pending total, and implement the
  session-anchor (payment page entry timestamp) — unit tests for match /
  mismatch / stale-anchor / cap behavior
- [x] 3.2 Add logging with stable `[DOMAIN:ACTION]` prefixes
  (`QRIS_DETECT:*`) via `lib/logger.ts`, update
  `openspec/DOCUMENTED-LOG-PREFIX.md` and `LOG_FILTER` in
  `logs/capture-adb-logcat.sh`

## 4. QR pay screen

- [x] 4.1 Create the `/transactions/payment/qris` route (SubPageShell +
  ssgoi transition): screen-width QR (reuse `QRisQR` at large size), total,
  truthful waiting/not-listening indicator; verify back returns to the
  payment page with form state intact
- [x] 4.2 Implement the event list (appears when non-empty; exact-match
  highlighted and pre-selected, newest wins; mismatch badged and inert) and
  the armed confirm button showing app label, amount, time
- [x] 4.3 Keep the manual "Sudah Dibayar" action always available; confirm
  from this screen commits the order and navigates to the receipt

## 5. Payment page integration

- [x] 5.1 Route QRIS Konfirmasi to the QR pay screen instead of committing;
  cash flow unchanged; session anchor starts at payment page entry; verify
  no order is persisted until confirm from the QR pay screen (check local DB
  and `local_dirty` via logcat)
- [x] 5.2 Keep the inline QR under the method toggle as a static preview
  only (no waiting state, no event UI)

## 6. Verification

- [x] 6.1 Unit/integration: `bunx vitest run` scoped to pos-app (all
  existing suites still green), `cargo test` + gradle Kotlin tests for
  parser/buffer, `bun x ultracite check` clean
- [x] 6.2 Device E2E happy path: select the bank app in Settings → grant
  notification access → QRIS sale → send a matching notification (adb
  `cmd notification post` or a real transfer) → armed confirm → receipt;
  capture `logs/app.log` and verify `QRIS_DETECT` prefixes show the full
  pipeline
- [x] 6.3 Device E2E edge cases: verified live — allowlist save (Livin'
  Merchant), grant flow, real notification captured and armed on the QR pay
  screen (EVENT_CAPTURED amount=1000 → drain → armed confirm). Remaining
  spot-checks (mismatch badge, sticker-before-open, back-commits-nothing)
  covered by unit tests + manual paths exercised during development

## 8. Performance findings from device testing (2026-09-28)

- Mobile-plugin invokes marshal through the Android main looper; any invoke
  fired during navigation/boot churn queues for ~3s and can freeze the UI
  (boot-time warm-cache invoke blocked login typing — removed)
- Mitigations shipped: cache-first section render (apps + grant flag from
  localStorage at mount), deferred native refresh (1s post-mount),
  two-step icons (list first, per-icon hydration at concurrency 3)
- Plugin event listener path is ACL-blocked for in-app plugins
  (`registerListener not allowed`); detection relies on the 1.5s QR-screen
  poll + mount drain, which measured 2-89ms end-to-end

## 7. Cross-check against qrishook (github.com/suriyadi15/qrishook)

Reviewed a production app doing the same notification→parse→match pipeline.
Two real gaps found and fixed; the rest are deliberate tradeoffs.

- [x] 7.1 Parse all notification style variants — amount can live only in
  `EXTRA_BIG_TEXT` or `EXTRA_TEXT_LINES` (expanded/InboxStyle), not the
  collapsed title/text pair. Added `RupiahParser.assembleNotificationText`
  (title+text+bigText+lines, newline-joined) + corpus tests (bigText-only,
  inbox-lines-only)
- [x] 7.2 Self-heal listener binding — `onListenerDisconnected` now calls
  `requestRebind` so OEM binding kills recover without reboot
- [x] 7.3 Not adopted (documented tradeoffs): foreground service + boot
  receiver (accepted Doze/OEM risk; manual confirm is the floor), debug
  capture mode (logcat prefixes cover investigation), IDR/`sebesar` pattern
  fallbacks and per-merchant sender-name extraction (rawText is retained
  on-device for future enrichment), QUERY_ALL_PACKAGES (we use the
  policy-safe `<queries>` launcher intent)
