---
id: 1
title: Use Tauri Plugin Log With Structured Prefixes
date: 2026-05-14
status: accepted
domains: [logging, android, tauri, support]
---

# 1. Use Tauri Plugin Log With Structured Prefixes

## Context

Sakti POS is an offline-first Android hardware app. Production logs are support evidence when a merchant reports a broken printer, sync failure, photo issue, or login problem from a remote device.

Raw `console.log` output is not enough because JS and Rust logs need to be investigated together. Deleting operational logs also makes support blind on real devices.

## Decision

Use `tauri-plugin-log` as the shared logging route for SolidJS and Rust.

Application logs use a stable plaintext prefix:

```text
[ORIGIN] [DOMAIN:ACTION] message key=value
```

Current origins are `JS` and `RUST`. Current domains are documented in `docs/knowledge/APP-LOGGING-DOCS.md`.

Normal Android investigation should use the app process id first, then grep structured prefixes:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):'
```

## Consequences

The app keeps useful `info`, `warn`, and `error` logs in production. Debug filtering should happen through levels and adb filters, not by removing operational logs.

New log prefixes must be added to `docs/knowledge/APP-LOGGING-DOCS.md` in the same change that introduces them.
