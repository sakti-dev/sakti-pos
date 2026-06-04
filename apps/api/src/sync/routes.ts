import { merchants, outlets } from "@sync-contract/api-schema";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { repository } from "./service";

interface ScopeContext {
  userId: string;
}

interface ResolvedScope {
  merchantId: string;
  scopeId: string;
  scopeType: "merchant" | "outlet";
}

async function getMerchantById(id: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.id, id))
    .limit(1);
  return row ?? null;
}

async function getOutletMerchantId(outletId: string): Promise<string | null> {
  const [outlet] = await db
    .select({ merchantId: outlets.merchantId })
    .from(outlets)
    .where(eq(outlets.id, outletId))
    .limit(1);
  return outlet?.merchantId ?? null;
}

const resolveScope = async ({
  scopeId,
  context: _context,
}: {
  scopeId: string;
  context: ScopeContext;
}): Promise<
  | { ok: true; scope: ResolvedScope }
  | { ok: false; status: number; body: { error: string } }
> => {
  const merchant = await getMerchantById(scopeId);
  if (merchant) {
    return {
      ok: true,
      scope: { scopeId, merchantId: merchant.id, scopeType: "merchant" },
    };
  }

  const merchantId = await getOutletMerchantId(scopeId);
  if (merchantId) {
    return {
      ok: true,
      scope: { scopeId, merchantId, scopeType: "outlet" },
    };
  }

  return { ok: false, status: 404, body: { error: "Scope not found" } };
};

const push = createSyncPushHandler<ScopeContext, ResolvedScope>({
  resolveScope,
  upsertOrder: repository.tableNames,
  idempotency: { db },
  applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
    repository.applyPushChanges({
      changes,
      scopeId: scope.scopeId,
      syncUpdatedAt,
    }),
});

const pull = createSyncPullHandler<ScopeContext, ResolvedScope>({
  limit: 1000,
  resolveScope,
  loadPullChanges: async ({ cursor, scope, tables }) =>
    repository.loadPullChanges({
      cursor,
      scopeId: scope.scopeId,
      tables,
    }),
});

const status = createSyncStatusHandler<ScopeContext, ResolvedScope>({
  resolveScope,
  loadSyncStatus: async ({ cursor, scope }) =>
    repository.loadSyncStatus({
      cursor,
      scopeId: scope.scopeId,
    }),
});

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .use(authenticated)
  .post("/push", (c) => push(c.request, { userId: c.session.userId }))
  .post("/pull", (c) => pull(c.request, { userId: c.session.userId }))
  .post("/status", (c) => status(c.request, { userId: c.session.userId }));
