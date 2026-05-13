# Architecture Decision Records

ADRs are flat and chronological. Do not create domain folders under this directory.

Use frontmatter `domains` to group decisions by topic. Keep operational references in `docs/knowledge/` when they are not architecture decisions.

## Index

| ADR | Status | Domains | Title |
| --- | --- | --- | --- |
| [0001](0001-use-tauri-plugin-log-with-structured-prefixes.md) | accepted | `logging`, `android`, `tauri`, `support` | Use Tauri Plugin Log With Structured Prefixes |
| [0002](0002-use-hybrid-native-product-photo-picker.md) | accepted | `photo`, `android`, `tauri`, `assets` | Use Hybrid Native Product Photo Picker |
| [0003](0003-use-generic-asset-processing-for-product-photos.md) | accepted | `assets`, `photo`, `sync`, `sqlite`, `r2` | Use Generic Asset Processing For Product Photos |
| [0004](0004-use-smart-sync-with-local-outbox-and-server-events.md) | accepted | `sync`, `sqlite`, `api`, `protobuf` | Use Smart Sync With Local Outbox And Server Events |
| [0005](0005-use-cloud-staff-mapping-for-pos-login.md) | accepted | `auth`, `staff`, `sync`, `api` | Use Cloud Staff Mapping For POS Login |
| [0006](0006-use-schema-compatibility-and-version-gating.md) | accepted | `schema`, `sync`, `api`, `pos` | Use Schema Compatibility And Version Gating |
| [0007](0007-use-android-native-thermal-receipt-printing.md) | accepted | `printer`, `android`, `pos`, `hardware` | Use Android Native Thermal Receipt Printing |

## Status Values

- `proposed`: under discussion.
- `accepted`: current project direction.
- `deprecated`: no longer relevant, but not replaced by one specific ADR.
- `superseded`: replaced by a later ADR.

## Writing Rule

When adding an ADR:

1. Check this directory for the next available chronological number.
2. Use `000N-short-kebab-title.md`.
3. Include frontmatter: `id`, `title`, `date`, `status`, `domains`.
4. Use sections: `Context`, `Decision`, `Consequences`.
5. Do not delete old ADRs. Mark them `deprecated` or `superseded` instead.
