# POS Thermal Receipt Printing

Date: 2026-05-10

This note documents the implemented Android thermal receipt printing flow for the POS app and the device-testing lessons from the DantSu integration.

## Architecture

Receipt printing is Android-only in v1:

```text
SolidJS POS UI
-> Tauri invoke commands
-> Rust printer bridge
-> Tauri Android Kotlin plugin
-> DantSu ESCPOS-ThermalPrinter-Android
-> Bluetooth Classic ESC/POS printer
```

The app uses DantSu `com.github.DantSu:ESCPOS-ThermalPrinter-Android:3.3.0` for ESC/POS formatting and printer command execution. The project does not modify the copied reference repo in `docs/external/ESCPOS-ThermalPrinter-Android`; that directory is only for reading upstream behavior.

## Files To Know

- `apps/pos-app/src-tauri/src/printer.rs`: Rust Tauri command bridge.
- `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/printer/ThermalPrinterPlugin.kt`: Android Kotlin printer plugin.
- `apps/pos-app/src/lib/printer.ts`: frontend printer service.
- `apps/pos-app/src/lib/printer-log.ts`: frontend printer logging helpers.
- `apps/pos-app/src/lib/receipt/types.ts`: receipt data contract.
- `apps/pos-app/src/lib/receipt/format-receipt.ts`: DantSu formatted text receipt renderer.
- `apps/pos-app/src/components/settings/printer-settings.tsx`: printer settings, permission, refresh, and test print UI.
- `apps/pos-app/src/pages/pos.tsx`: checkout receipt capture, automatic print, and reprint.
- `apps/pos-app/scripts/test-printer`: focused printer verification script.

## Android Permissions

The manifest declares both legacy and Android 12+ Bluetooth permissions:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
```

Runtime permission must request both:

```text
bluetoothConnect
bluetoothScan
```

`BLUETOOTH_SCAN` is required even when we are not scanning because DantSu/Android calls `BluetoothAdapter.cancelDiscovery()` before opening the socket.

## Printer Discovery

The settings UI lists Android bonded devices:

```text
BluetoothManager.adapter.bondedDevices
```

Important: bonded devices are not online devices. This list only means Android remembers the paired MAC address. It does not prove the printer is powered on or in range.

There is no reliable Android Classic Bluetooth `isPoweredOn()` or `isOnline()` method. The only meaningful online check is opening the RFCOMM socket.

## Connection Timeout

DantSu's default Bluetooth connection calls blocking `BluetoothSocket.connect()`. When a printer is off, Android can wait around 7-8 seconds before failing.

The app uses a custom `TimedBluetoothConnection` implementing DantSu `DeviceConnection`. It still lets DantSu format and print, but it owns the socket connection and closes the socket from another thread after a shorter timeout.

Current timeout:

```text
2.5 seconds
```

Expected offline behavior:

```text
testPrint start
~2.5s later
Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan.
```

If real printer models sometimes need longer to wake up, raise this timeout conservatively to 3-4 seconds. Do not return to Android's default 7-8 second UX without a clear reason.

## Failure Handling

Checkout must complete even if printing fails.

Expected behavior:

- Test print failure shows a toast.
- Checkout print failure shows a toast but keeps the success flow.
- Bluetooth connection is disconnected in `finally`.
- DantSu `EscPosConnectionException` is normalized to a cashier-friendly Indonesian message.
- The success overlay offers `Cetak Ulang` when a default printer exists.

Friendly offline message:

```text
Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan.
```

## Settings UX

Printer settings supports:

- Bluetooth permission request.
- Automatic reload after permission grant.
- Fallback reload when the Tauri permission invoke resolves late.
- `Segarkan` button for manual reload.
- Refresh progress state: `Menyegarkan...`.
- Refresh result toast.
- Selected default printer stored in local storage key:

```text
sakti.defaultPrinterAddress
```

The printer list has a 3 second UI timeout so the screen does not stay stuck on `Memuat...` if the JS side of a Tauri invoke hangs after native success.

## Logging

Printer logs use:

```text
[PRINTER]
SaktiPrinter
```

Preferred logcat command:

```bash
adb logcat -c
adb logcat -v time | rg 'SaktiPrinter|\[PRINTER\]|AndroidRuntime|RustStdout|RustStderr'
```

Healthy test print sequence:

```text
settings:test_print:start
service:request_bluetooth_permission:success
service:test_print:start
SaktiPrinter: testPrint start
SaktiPrinter: testPrint success
service:test_print:success
settings:test_print:success
```

Offline printer sequence:

```text
SaktiPrinter: testPrint start
~2.5s later
SaktiPrinter: testPrint connection failed
bridge:test_printer:failed Printer tidak tersambung...
settings:test_print:failed
```

## Verification

Fast focused verification:

```bash
apps/pos-app/scripts/test-printer
```

This runs:

- focused frontend printer/receipt/POS tests
- focused Ultracite checks
- Rust printer tests
- Android universal debug Kotlin compile

Release artifact verification:

```bash
apps/pos-app/scripts/test-printer --full
```

Normal on-device development loop:

```bash
apps/pos-app/scripts/dev
```

## Hardware Acceptance Checklist

1. Pair printer in Android OS Bluetooth settings.
2. Open POS app.
3. Open Settings.
4. Grant Bluetooth/Nearby devices permission.
5. Confirm paired printers load automatically.
6. Tap `Segarkan` and confirm visible refresh feedback.
7. Select the printer.
8. Tap `Cetak Test` and confirm paper output.
9. Complete cashier checkout and confirm receipt output.
10. Turn printer off and tap `Cetak Test`.
11. Confirm offline toast appears in about 2.5 seconds.
12. Complete checkout with printer off and confirm checkout still succeeds.

## Non-Goals For V1

- No Web Bluetooth.
- No BLE scanning.
- No iOS printing.
- No cloud printer management.
- No automatic discovery of unpaired printers.
- No logo/image printing until text receipts are stable on hardware.
