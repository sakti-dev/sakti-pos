## 1. Port the backend cluster into lib/assets/

- [x] 1.1 Create `apps/pos-app/src/lib/assets/upload.ts` from `apps/pos-app/src-old/lib/assets/upload.ts` (verbatim), applying import rewrites: `~/lib/logger` → `~/lib/utils`, `~/lib/sync` → `~/lib/api/sync`. (`~/db/index`, `~/lib/api/eden` already correct.)
- [x] 1.2 Create `apps/pos-app/src/lib/assets/lifecycle.ts` from `src-old/lib/assets/lifecycle.ts` (verbatim), applying the same two import rewrites. (`~/lib/auth/storage`, `./upload` already correct after 1.1.)
- [x] 1.3 Create `apps/pos-app/src/lib/assets/recovery.ts` from `src-old/lib/assets/recovery.ts` (verbatim), applying import rewrites: `~/lib/logger` → `~/lib/utils`, `~/lib/sync` → `~/lib/api/sync`, `~/store/outlet` → `~/lib/auth/session`. (`~/lib/auth/storage`, `./upload` already correct after 1.1.)
- [x] 1.4 Do NOT port `cache.ts`, `plugin-bridge.ts`, or `image-upload.ts` (deferred UI trio). Confirm none of upload/lifecycle/recovery import from them.

## 2. Wire the ported code into sync orchestration

- [x] 2.1 In `apps/pos-app/src/lib/api/sync.ts`, remove the inline `uploadPendingAssets` stub and replace its call sites with an import from `~/lib/assets/upload`. Remove the inline `recoverAssets` stub and import from `~/lib/assets/recovery`. Keep the `hydrateMissingAssets` inline stub (design decision D4).
- [x] 2.2 Verify `syncNow()` still calls `uploadPendingProductImages` and `hydrateProductImagesInBackground` in the same order, and `runStartupSync()` still calls `recoverAssets()` after `syncNow()` — matching the spec's Sync Pipeline Order requirement.

## 3. Mount the lifecycle listener

- [x] 3.1 In `apps/pos-app/src/lib/api/sync-client-provider.tsx`, import `startAssetLifecycleListener` from `~/lib/assets/lifecycle` and invoke it inside the existing `createEffect` (the one keyed on `scopeId()`), alongside the two `baresync://` listeners.
- [x] 3.2 Fold the listener's cleanup into the provider's existing `onCleanup` so the subscription is torn down when the client is recreated.

## 4. Verify

- [x] 4.1 Run `tsc --noEmit` in `apps/pos-app` — expect zero errors (baseline is zero after this session's prior fixes).
- [x] 4.2 Run the existing vitest suite (`pnpm test`) — expect no regressions.
- [x] 4.3 Confirm no remaining `TODO: port lib/assets/*` marker in `lib/api/sync.ts` for the two replaced stubs.
- [x] 4.4 Confirm the three ported files contain no references to `~/store/`, `~/lib/logger`, or `~/lib/sync` (all should point at the new paths).
