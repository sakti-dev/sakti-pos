# Rust Module Layout

This crate is organized by backend domain, not by command type.

- `app/`: app state and startup wiring.
- `db/`: SQLite setup, migrations, and Drizzle SQL proxy.
- `sync/`: offline-first push, pull, outbox, and event sync.
- `assets/`: generic image asset pipeline, cache, upload, hydration, and attachment targets.
- `android/`: Android filesystem bridge and native photo picker.
- `hardware/`: device integrations such as thermal printers.
- `logging.rs`, `time_utils.rs`: small cross-cutting utilities.

Keep Tauri commands thin. Put business logic in the owning domain module and keep target-specific linkers explicit.
