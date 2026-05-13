---
id: 7
title: Use Android Native Thermal Receipt Printing
date: 2026-05-14
status: accepted
domains: [printer, android, pos, hardware]
---

# 7. Use Android Native Thermal Receipt Printing

## Context

Receipt printing is a hardware workflow. The cashier flow must complete even if the printer is offline, out of range, or missing Bluetooth permission.

The first supported target is Android Bluetooth Classic ESC/POS printing.

## Decision

Use an Android-native printer bridge:

```text
SolidJS POS UI
-> Tauri invoke commands
-> Rust printer bridge
-> Tauri Android Kotlin plugin
-> DantSu ESCPOS-ThermalPrinter-Android
-> Bluetooth Classic ESC/POS printer
```

The Android plugin uses DantSu `ESCPOS-ThermalPrinter-Android`. The app requests Android 12+ Bluetooth permissions and lists bonded devices from Android.

Connection timeout is owned by the app through a custom timed connection so an offline printer returns a cashier-friendly error in about 2.5 seconds instead of waiting for Android's default socket timeout.

## Consequences

Checkout must not fail because printing failed. Test print and checkout print errors show user-visible messages, while the sale flow remains complete.

V1 does not support Web Bluetooth, BLE scanning, iOS printing, cloud printer management, or automatic discovery of unpaired printers.
