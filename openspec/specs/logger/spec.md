# Logger

## Purpose

Sakti POS is an offline-first Android hardware app where production logs are support evidence. The logger provides structured, prefixed log lines that route through `tauri-plugin-log` so JS and Rust logs appear together in `adb logcat`. Each log line carries a domain tag, an action derived from the message, and key-value context — enabling grep-based filtering during device support investigations.

## Requirements

### R1: Structured Log Line Format

The system SHALL emit log lines in the format `[ORIGIN] [DOMAIN:ACTION] message key=value`.

- `ORIGIN` is `JS` for TypeScript logs (Rust logs use `RUST` via the Rust log crate).
- `DOMAIN` is one of: `ASSET`, `AUTH`, `DB`, `PHOTO`, `POS`, `PRINTER`, `SETTINGS`, `SYNC`, `UI`.
- `ACTION` is the message converted to `UPPER_SNAKE_CASE`.
- Context keys are converted to `snake_case`.

**WHEN** `logger.info("load_printers:timeout")` is called with context `{ domain: "PRINTER" }`
**THEN** the emitted line is `[JS] [PRINTER:LOAD_PRINTERS:TIMEOUT] load_printers:timeout`.

**WHEN** `logger.error("snapshot_export_failed", error, { snapshotPath: "/data/..." })` is called
**THEN** the emitted line includes `[JS] [DB:SNAPSHOT_EXPORT_FAILED] snapshot_export_failed snapshot_path="/data/..." error="..."`.

### R2: Log Levels

The system SHALL support four log levels: `debug`, `info`, `warn`, `error`.

- Each level routes to the corresponding `tauri-plugin-log` function: `pluginDebug`, `pluginInfo`, `pluginWarn`, `pluginError`.
- The log level determines the Android logcat priority.

**WHEN** `logger.debug(msg)` is called
**THEN** the system emits via `pluginDebug`.

**WHEN** `logger.info(msg)` is called
**THEN** the system emits via `pluginInfo`.

**WHEN** `logger.warn(msg)` is called
**THEN** the system emits via `pluginWarn`.

**WHEN** `logger.error(msg, err)` is called
**THEN** the system emits via `pluginError`.

### R3: Logger Factory — `createLogger`

The system SHALL provide `createLogger(context?)` to create a logger with a default context.

- The returned `Logger` object exposes `debug`, `info`, `warn`, `error` methods and a `child` method.
- Default context is merged into every log call.

**WHEN** `createLogger({ domain: "DB", module: "settings" })` is called
**THEN** the returned logger emits all messages with `DB` as the domain unless overridden.

### R4: Logger Factory — `createDomainLogger`

The system SHALL provide `createDomainLogger(domain, context?)` to create a logger with a fixed domain.

**WHEN** `createDomainLogger("PRINTER")` is called
**THEN** the returned logger always emits with domain `PRINTER`.

### R5: Domain Auto-Detection

The system SHALL infer the log domain from the `module` and `scope` context fields when `domain` is not explicitly provided.

- If `module` or `scope` contains "auth" or "login" → `AUTH`
- If contains "db" → `DB`
- If contains "sync" → `SYNC`
- If contains "photo" or "image" → `PHOTO`
- If contains "asset" → `ASSET`
- If contains "printer" → `PRINTER`
- If contains "pos" → `POS`
- If contains "settings" → `SETTINGS`
- Default → `UI`

**WHEN** `createLogger({ module: "auth" }).info("login_success")` is called
**THEN** the domain is inferred as `AUTH`.

**WHEN** `createLogger({ module: "unknown" }).info("action")` is called
**THEN** the domain defaults to `UI`.

### R6: Child Logger Inheritance

The system SHALL support `logger.child(context)` to create a new logger that inherits and merges the parent's default context.

**WHEN** `parent.child({ module: "orders" }).info("created")` is called
**THEN** the emitted line uses the parent's domain merged with the child's `module`.

### R7: Context Formatting

The system SHALL format context key-value pairs as `key=value` in the log line.

- Internal keys (`domain`, `module`, `prefix`, `scope`) are excluded from the output.
- String values containing whitespace, quotes, or `=` are JSON-quoted.
- `error` context is produced by calling `describeError(error)`.
- Non-string, non-number, non-boolean values are JSON-serialized.

**WHEN** `logger.info("done", { orderId: "123", total: 5000 })` is called
**THEN** the context portion is ` order_id="123" total=5000`.

**WHEN** `logger.error("failed", new Error("boom"), { path: "/a b" })` is called
**THEN** the context includes ` path="/a b" error="boom"`.

### R8: Tauri IPC Resilience

The system SHALL emit logs non-fatal when `tauri-plugin-log` is unavailable (e.g., browser tests, early startup).

- `emit` wraps the plugin call in `.catch(() => {})` so logging never throws.

**WHEN** `tauri-plugin-log` is not available (browser test environment)
**THEN** log calls silently no-op without throwing or rejecting.

### R9: Default Exported Logger

The system SHALL export a default `logger` instance created with `createLogger()` (no default context).

**WHEN** `import { logger } from "~/lib/logger"` is used
**THEN** the logger is available immediately with no pre-configured domain (defaults to `UI`).

### R10: Log Prefix Documentation

The system SHALL document all active log domain prefixes in a dedicated knowledge file.

- When a new domain or prefix is added, the corresponding documentation file MUST be updated in the same change.
- Log prefixes are referenced by support procedures and `adb logcat` grep patterns.

**WHEN** a new log domain is added to `LogDomain`
**THEN** the documentation file is updated to include the new prefix in the grep pattern.
