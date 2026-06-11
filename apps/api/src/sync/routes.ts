import { merchants, outlets } from "@sync-contract/api-schema";
import { createSyncServer } from "baresync/server";
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

const syncServer = createSyncServer<ScopeContext, ResolvedScope>({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  },
  pull: {
    limit: 1000,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  },
  status: {
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  },
});

export const syncRoutes = new Elysia({ prefix: "/api/sync/v1" })
  .use(authenticated)
  .post(
    "/push",
    (c) => syncServer.push(c.request, { userId: c.session.userId }),
    { parse: "none" }
  )
  .post(
    "/pull",
    (c) => syncServer.pull(c.request, { userId: c.session.userId }),
    { parse: "none" }
  )
  .post(
    "/status",
    (c) => syncServer.status(c.request, { userId: c.session.userId }),
    { parse: "none" }
  );
