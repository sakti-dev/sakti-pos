// Cross-package type reference.
//
// pos-app pulls in `@repo/api`'s types via the Eden treaty client, and its
// tsconfig maps `@repo/api` straight at raw source (`apps/api/src/app.ts`,
// no build step). That backend source imports `cloudflare:workers` — a
// Cloudflare Workers runtime module. The backend regenerates its full type
// surface (including the `cloudflare:workers` module declaration) into
// `apps/api/worker-configuration.d.ts` via the `cf-typegen` script
// (`wrangler types`). Referencing it here lets those backend files typecheck
// inside pos-app's compilation graph without pos-app installing Cloudflare
// types or hand-rolling a shim. pos-app never uses `cloudflare:workers`
// directly.
/// <reference path="../../../api/worker-configuration.d.ts" />
