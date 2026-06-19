2. API Development — Build out the Cloudflare Worker backend (auth sync, product management, reporting endpoints)
3. Cloud Sync (v2) — Offline-first sync layer between local SQLite and remote API
4. Production Hardening — Error boundaries, crash recovery, data integrity checks, proper logging
5. Receipt Printing — Bluetooth/thermal printer integration for Indonesian market
6. Reporting Dashboard — Daily/weekly sales summaries, product performance
7. Multi-outlet Support — If you plan to scale beyond one location

Critical

2. CI/CD pipeline — No GitHub Actions or automated test runs
3. Error boundary — No global error handling for unhandled runtime errors
4. Version management — Hardcoded 0.1.0 everywhere, no release automation
5. First-login forced PIN change — PRD says "must be changed on first login" but it's not implemented
6. Product image upload — imageUrl field exists but is text-only, no actual image handling
   Low Priority / V2
7. API app — Scaffolded only, cloud sync is v2 scope
8. E2E tests — No mobile integration testing (Maestro/Detox)
9. Advanced reporting — Sales by product, category, hourly trends, export
10. ESC/POS printer integration
11. Product variants/modifiers
12. Inventory/recipe costing
    What would you like to work on?
