## ADDED Requirements

### Requirement: Subtree-vendored tauri-plugin-dialog

The plugin SHALL include `tauri-plugin-dialog` as a git subtree at `vendor/tauri-plugin-dialog/` inside the plugin crate. The `Cargo.toml` SHALL reference it as a local path dependency: `tauri-plugin-dialog = { path = "vendor/tauri-plugin-dialog" }`.

#### Scenario: Plugin builds with vendored dialog
- **WHEN** the plugin crate is built
- **THEN** Cargo resolves `tauri-plugin-dialog` from the local `vendor/tauri-plugin-dialog/` path
- **AND THEN** no crates.io or external git reference to `tauri-plugin-dialog` is needed

#### Scenario: Plugin is self-contained as a Cargo dependency
- **WHEN** a consumer adds `tauri-plugin-image-pipeline` to their `Cargo.toml`
- **THEN** `tauri-plugin-dialog` source is resolved from the plugin's subtree automatically
- **AND THEN** the consumer does not need to add `tauri-plugin-dialog` as a separate Cargo dependency
- **AND THEN** the consumer still needs to call `tauri_plugin_dialog::init()` in their app setup (Tauri requires explicit plugin registration regardless of dependency source)

### Requirement: Vendored dialog is unmodified upstream

The subtree-vendored `tauri-plugin-dialog` SHALL be an unmodified copy of the upstream crate. No custom patches or forks.

#### Scenario: Vendored dialog matches upstream
- **WHEN** comparing `vendor/tauri-plugin-dialog/` to the upstream `tauri-apps/tauri-plugin-dialog` at the pinned version
- **THEN** the source files are byte-identical

### Requirement: Vendored dialog is updateable via git subtree

The subtree SHALL be updateable via `git subtree pull` to bring in upstream changes.

#### Scenario: Update vendored dialog
- **WHEN** a new version of `tauri-plugin-dialog` is needed
- **THEN** `git subtree pull` from the upstream repository updates the vendored copy
