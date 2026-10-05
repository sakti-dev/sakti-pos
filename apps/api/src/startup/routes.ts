import { userMerchants } from "@sync-contract/api-schema";
import {
  outlets,
  paymentSettings,
  wallets,
} from "@sync-contract/generated/2026-10-05/api-synced-schema";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import { StartupRequest } from "./startup.model";

const DEFAULT_CASH_WALLET_NAME = "Tunai";
const DEFAULT_QRIS_WALLET_NAME = "QRIS";

function logStartup(entry: {
  applied: string[];
  lvl?: "info" | "warn";
  msg: string;
  outletId: string;
  userId: string;
}): void {
  console.log(
    JSON.stringify({
      applied: entry.applied,
      lvl: entry.lvl ?? "info",
      msg: entry.msg,
      origin: "API",
      outlet_id: entry.outletId,
      user_id: entry.userId,
    })
  );
}

export const startupRoutes = new Elysia({ prefix: "/api/startup" })
  .use(authenticated)
  .post(
    "/",
    {
      body: StartupRequest,
    },
    async ({ body, session, set }) => {
      let outletId: string;
      try {
        outletId = requireNonEmptyString(body.outletId, "outletId");
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      const [outlet] = await db
        .select({ id: outlets.id, merchantId: outlets.merchantId })
        .from(outlets)
        .where(eq(outlets.id, outletId))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      const [access] = await db
        .select({ id: userMerchants.id })
        .from(userMerchants)
        .where(
          and(
            eq(userMerchants.userId, session.userId),
            eq(userMerchants.merchantId, outlet.merchantId)
          )
        )
        .limit(1);

      throwIfFalse(!!access, new ForbiddenRequestError());

      const now = new Date().toISOString();
      const applied: string[] = [];

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            id: wallets.id,
            type: wallets.type,
          })
          .from(wallets)
          .where(eq(wallets.outletId, outletId));
        const existingTypes = new Set(existing.map((row) => row.type));

        /* Step: ensure_default_wallets — the outlet's cash drawer. */
        if (!existingTypes.has("cash")) {
          await tx.insert(wallets).values({
            id: crypto.randomUUID(),
            outletId,
            name: DEFAULT_CASH_WALLET_NAME,
            type: "cash",
            isDefault: true,
            currentBalanceMinorUnits: 0,
            syncUpdatedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
          });
          applied.push("ensure_default_wallets");
        }

        /* Step: ensure_qris_wallet — only when the merchant has QRIS on. */
        const [settings] = await tx
          .select({
            qrisDinamisEnabled: paymentSettings.qrisDinamisEnabled,
            qrisStatisEnabled: paymentSettings.qrisStatisEnabled,
          })
          .from(paymentSettings)
          .where(eq(paymentSettings.merchantId, outlet.merchantId))
          .limit(1);
        const qrisEnabled = Boolean(
          settings?.qrisStatisEnabled || settings?.qrisDinamisEnabled
        );
        if (qrisEnabled && !existingTypes.has("qris")) {
          await tx.insert(wallets).values({
            id: crypto.randomUUID(),
            outletId,
            name: DEFAULT_QRIS_WALLET_NAME,
            type: "qris",
            isDefault: true,
            currentBalanceMinorUnits: 0,
            syncUpdatedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
          });
          applied.push("ensure_qris_wallet");
        }
      });

      logStartup({
        applied,
        msg: applied.length > 0 ? "startup applied" : "startup noop",
        outletId,
        userId: session.userId,
      });

      return { applied, ok: true };
    }
  );
