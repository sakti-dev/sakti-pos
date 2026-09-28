# Design

## Context

The POS is a Tauri v2 Android app (`com.sakti_dev.sakti_pos`). Custom Kotlin
plugins already live in `apps/pos-app/src-tauri/gen/android/.../sakti_pos/`
(`AuthTokenPlugin`, `ThermalPrinterPlugin`, `ThermalPrinter`-style dirs) and are
registered from Rust in `src-tauri/src/lib.rs`. The manifest already has a
`<queries>` block (image intents). Payment today is a single page: method grid
(Tunai / QRIS Statis / QRIS Dinamis), cash numpad, inline 200px QR under the
toggle, customer details, notes, one Konfirmasi that commits the order. QRIS
payloads come from synced `payment_settings` (`qrisStaticPayload`,
`toDynamic()` embeds the total).

The merchant's bank/e-wallet app runs on the same device and posts settlement
notifications. There is currently no notification access, no listener service,
no allowlist, no parser, and no notion of a "pending payment session".

## Goals / Non-Goals

**Goals:**

- Detect incoming QRIS settlement money from merchant-chosen apps, parse the
  Rupiah amount correctly (thousands separators, trailing cents), and surface
  every parsed event to the cashier.
- L1 armed confirm: auto-arm Konfirmasi only for exact-match events posted
  during the payment session; a human always taps the final button.
- Dedicated QR pay screen: big QR, total, waiting state, event list — the
  single operational home for the state machine.
- Payment page remains the form hub (method + customer + notes + Konfirmasi);
  cash flow is untouched.
- Allowlist readable by the service in sub-millisecond time with zero bridge
  involvement; survives reboot and process death.

**Non-Goals:**

- No auto-confirm (L2), no direction/keyword filtering per bank, no pushing
  events to the server or syncing the allowlist (device-local by nature).
- No accepting mismatched amounts in v1 (inert display only; underpayment
  acceptance is an order-model question for a later change).
- No dynamic QR generation beyond the existing `toDynamic()`; no settlement
  API integrations with banks.

## Decisions

### D1 — Package visibility via `<queries>`, not `QUERY_ALL_PACKAGES`

Add `<intent>` with `ACTION_MAIN` + `CATEGORY_LAUNCHER` to the existing
`<queries>` block. This makes every launchable app visible to
`PackageManager.queryIntentActivities` — exactly and only what the app-picker
needs — without the Play-policy-restricted `QUERY_ALL_PACKAGES` permission.
The app is sideloaded today, so the permission would "work", but `<queries>`
is free and future-proof. Alternative rejected: `QUERY_ALL_PACKAGES` (policy
risk, overbroad).

### D2 — Allowlist storage: SharedPreferences as native fast-path, app DB
mirror as source of truth

The service reads `SharedPreferences("qris_config").getStringSet(
"allowed_packages")` on every notification — no Rust/JS bridge, works when the
webview is suspended. The plugin's `set_allowed_packages` command writes it;
the JS settings UI also persists the list into the app's local store (not the
synced schema) so the picker can restore selections. On settings-page mount,
JS re-pushes the stored list to native (SQLite/app-store is source of truth,
SharedPreferences is a cache; a one-way sync kills drift).
Alternative rejected: storing the allowlist in synced `payment_settings` —
it is per-device by nature (each register watches its own installed apps);
a contract regen buys nothing here.

### D3 — Three-state outcome per notification

```
no amount found      → dropped silently (marketing pushes, OTPs)
amount ≠ pending     → event list, badged "tidak cocok", inert
amount == pending    → event list, auto-arms Konfirmasi
```

The mismatch state is a feature: it exposes underpayment (customer paid
Rp15.000 for a Rp15.500 bill) which the cashier cannot see today.

### D4 — Parser contract: Indonesian Rupiah, cents-aware

Match amounts anchored on an explicit `Rp` prefix (case-insensitive, optional
space). Handle `15.000`, `15.000,00`, `15000`, `Rp 15rb` is out of scope.
Rule: if the final separator group is exactly 2 digits (`,dd` or `.dd`),
treat it as cents and drop it; otherwise all digit groups are thousands.
`"Rp15.000,00" → 15000`, never `1500000`. Regexes live as top-level Kotlin
vals (mirrors the JS `useTopLevelRegex` convention). The parser is a pure
function with a unit-test corpus of real notification formats (BCA, Livin'
by BRI, GoBiz, ShopeePay, Dana, generic BPR).
Alternative rejected: the paste's `\b`-anchored regex — it matches bare
numbers (reference codes, phone numbers) and mis-multiplies cents 100×.

### D5 — L1 armed confirm with session-anchored auto-arm

The button auto-arms only for exact-match events with `postTime >= payment
page entry` (the moment a pending total exists). This anchor deliberately
precedes the QR pay screen: customers often scan the merchant's laminated
static QR sticker while the cashier is still filling notes. Wider window =
tiny false-positive surface, already covered by the human veto.
All events (matching or not) remain visible in the list regardless of
timestamp within the retention window — visibility is the wide net,
auto-arm is the narrow one.

### D6 — Native ring buffer as the backing store of the event list

The `NotificationListenerService` outlives the webview. Events are appended to
a capped native buffer (last 20: package, parsed amount, raw text, postTime,
consumed flag) persisted in SharedPreferences/JSON; the plugin emits to JS
when alive and JS drains the buffer on resume/process-death relaunch. This
makes the buffer load-bearing UI, not just crash resilience.
Raw text stays on-device (bank notifications may contain sender names).

### D7 — Flow: Konfirmasi means "form done → proceed"; QRIS commits later

Payment page keeps its shape for every method. Cash: Konfirmasi commits →
receipt (unchanged). QRIS: Konfirmasi opens the QR pay screen; the commit
happens there on armed confirm or manual "Sudah Dibayar" → receipt. Backing
out of the QR screen returns to the payment page with cart, method, customer
details intact — nothing persisted, no orphan orders. This is more honest
than today (order saved as paid on faith); the commit moment equals the
payment-confirmed moment.

### D8 — QR pay screen is a route, not an overlay

`/transactions/payment/qris` via `SubPageShell` + ssgoi transitions. Android
hardware back returns to the payment page correctly for free; the existing
transition language stays consistent. The inline QR on the payment page stays
as a dumb static preview (no waiting state, no banner) — one state machine,
one preview, nothing maintained twice.

### D9 — Grant UX in the existing QRIS walkthrough

Notification access is a special-access setting, not a runtime permission.
The existing first-enable QRIS walkthrough gains a step: deep link
`ACTION_NOTIFICATION_LISTENER_SETTINGS`, detect granted state via
enabled-listener packages polling on resume. Detection without grant is a
normal state: the feature degrades to manual confirm, and the QR pay screen
shows a hint ("notifikasi tidak dipantau") instead of pretending to listen.

## Risks / Trade-offs

- **Parser correctness decides usefulness, not safety.** A wrong parse under
  L1 shows a wrong amount → mismatch badge → cashier doesn't tap. Safe. But a
  systematically wrong parse (the cents bug) makes matching never fire for
  that bank — feature silently dead for those users. Mitigated by the test
  corpus and by the event list making every parse visible (wrong values are
  observable, not hidden).
- **False-positive arm** (unrelated same-amount notification inside the
  session window): human veto + labeled banner (app name, amount, time) keep
  L1 honest. No auto-confirm in v1.
- **Notification access revoked mid-session**: service dies quietly; QR pay
  screen shows the not-listening hint; manual confirm unaffected.
- **Doze/OEM battery managers** may delay notifications on some devices
  (aggressive Chinese ROMs). Out of scope to fix; manual confirm is the
  floor, and the hint communicates "menunggu" truthfully.

## Open Questions

- Exact retention window for the event list (time-based vs. fixed 20 events)
  — safe to decide during implementation; the buffer cap is already fixed.
- Whether the payment page shows a small badge when events arrive while
  filling the form — nice-to-have, deferrable without changing the approach.
