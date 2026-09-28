# QRIS Payment Detection — Device Test Checklist

Prerequisites: dev build installed, `bash logs/capture-adb-logcat.sh` running
in a terminal (captures all `[QRIS:...]` / `[QRIS_DETECT:...]` lines to
`logs/app.log`).

Replace `id.bmri.livinmerchant` with the package you selected, and `Rp10.000`
with the amount you want to simulate.

```bash
alias qrisnotif='adb shell cmd notification post -t "Livin'"'"' Merchant" -S bigtext --pkg id.bmri.livinmerchant tag1'
# usage: qrisnotif 'Dana masuk Rp10.000 dari BUDI'
```

## Setup (once per install)

- [ ] Pengaturan → Pembayaran → QRIS Statis enabled → row **Deteksi Pembayaran ›** appears
- [ ] Tap it → section opens instantly (cached) or with "Memuat daftar aplikari…" placeholder (first ever open)
- [ ] App list shows icons; search finds your bank app
- [ ] Toggle bank app on → **Simpan Pilihan** → log: `QRIS_DETECT:ALLOWLIST_SAVED count=1`
- [ ] **Akses Notifikasi** toggle → system settings → allow Sakti POS → return → shows "Notifikasi dipantau" (≤3s)
- [ ] Kill app → reopen → section remembers selection (allowlist persists)

## Happy path

- [ ] Build cart (note the total, e.g. Rp10.000) → QRIS Statis → fill Nama pelanggan → **Tampilkan QR**
- [ ] QR screen: big QR + total + "Menunggu pembayaran…" pulse
- [ ] `qrisnotif 'Dana masuk Rp10.000 dari BUDI'`
- [ ] ≤2s: green event row (Livin' Merchant · Rp10.000 · time) + button arms
      "Konfirmasi — terdeteksi Rp10.000"
- [ ] Tap → receipt; log shows `EVENT_CAPTURED` → `EVENT_DRAINED` → commit

## Edge cases

### 1. Wrong amount never arms
- [ ] Cart total Rp15.500 → QR screen → `qrisnotif 'Dana masuk Rp10.000'`
- [ ] Row appears with amber "tidak cocok" badge; button stays "Menunggu…"
- [ ] No commit possible from this event

### 2. Sticker payment (notification before QR screen)
- [ ] On payment page filling notes (do NOT tap Tampilkan QR yet) →
      `qrisnotif 'Dana masuk Rp<TOTAL>'`
- [ ] Now tap Tampilkan QR → event already listed and armed ("terdeteksi")
- [ ] Confirm → receipt

### 3. Backing out commits nothing
- [ ] Enter QR screen → hardware back → payment page intact
      (method, customer name, notes still filled)
- [ ] Complete as Tunai instead → receipt
- [ ] No duplicate/ghost QRIS order in Transactions list

### 4. Notification access revoked
- [ ] System settings → revoke notification access for Sakti POS
- [ ] Re-enter QR screen (≤3s) → shows "Notifikasi tidak dipantau" hint
- [ ] **Sudah Dibayar** still confirms manually

### 5. Reboot survival (bonus)
- [ ] Reboot phone → open QRIS sale → post notification → still captured
      (service rebinds automatically)

## Log evidence cheat sheet

| Line | Meaning |
| --- | --- |
| `QRIS_DETECT:ALLOWLIST_SAVED` | allowlist written to native prefs |
| `QRIS:SESSION_BEGUN` | payment page entered (match anchor) |
| `QRIS_DETECT:EVENT_CAPTURED amount=… elapsedMs=…` | notification parsed + buffered |
| `QRIS:EVENT_DRAINED count=…` | QR screen pulled events |
| `QRIS:APP_LIST_CACHE_HIT` / `DEFERRED_LOAD_STARTED` | section perf |
| `QRIS:ICONS_HYDRATED` | icon hydration summary |

Known limitations (by design, see design.md D-decisions + tasks section 8):
live plugin event listener is ACL-blocked; detection uses the 1.5s poll —
worst-case arm latency ~1.5s. Only allowlisted packages are read; raw text
stays on-device.
