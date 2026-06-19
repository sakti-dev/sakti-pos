<!-- This change is implementation-only: it ports existing, on-device-verified code
     from apps/pos-app/src-old/lib/assets/ into apps/pos-app/src/lib/assets/ and
     wires it into lib/api/sync.ts and SyncClientProvider. It conforms to the
     existing `assets` spec requirements (notably Upload Queue, Sync Pipeline
     Order, and Asset Events) without modifying any requirement.

     The spec itself is corrected by the separate change
     `correct-asset-spec-to-client-owned-architecture`. This change implements
     what that corrected spec describes.

     No ADDED / MODIFIED / REMOVED requirement deltas. -->
