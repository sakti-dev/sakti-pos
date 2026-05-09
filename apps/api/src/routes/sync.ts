import { outlets } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { getSessionFromRequest } from "../lib/session";
import {
	handlePull,
	handlePush,
	handleSyncStatus,
	verifyOutletAccess,
} from "../lib/sync";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
	.post(
		"/push",
		async ({ body, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const authorized = await verifyOutletAccess(
				session.userId,
				body.outletId,
			);
			if (!authorized) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const [outlet] = await db
				.select({ merchantId: outlets.merchantId })
				.from(outlets)
				.where(eq(outlets.id, body.outletId))
				.limit(1);

			if (!outlet) {
				set.status = 404;
				return { error: "Outlet not found" };
			}

			return handlePush(body.outletId, outlet.merchantId, body.tables);
		},
		{
			body: t.Object({
				outletId: t.String(),
				tables: t.Record(t.String(), t.Array(t.Any())),
			}),
		},
	)
	.get(
		"/status",
		async ({ query, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const authorized = await verifyOutletAccess(
				session.userId,
				query.outletId,
			);
			if (!authorized) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const [outlet] = await db
				.select({ merchantId: outlets.merchantId })
				.from(outlets)
				.where(eq(outlets.id, query.outletId))
				.limit(1);

			if (!outlet) {
				set.status = 404;
				return { error: "Outlet not found" };
			}

			return handleSyncStatus({
				lastServerEventId: query.lastServerEventId,
				merchantId: outlet.merchantId,
				outletId: query.outletId,
			});
		},
		{
			query: t.Object({
				outletId: t.String(),
				lastServerEventId: t.Number(),
			}),
		},
	)
	.get(
		"/pull",
		async ({ query, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const authorized = await verifyOutletAccess(
				session.userId,
				query.outletId,
			);
			if (!authorized) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const [outlet] = await db
				.select({ merchantId: outlets.merchantId })
				.from(outlets)
				.where(eq(outlets.id, query.outletId))
				.limit(1);

			if (!outlet) {
				set.status = 404;
				return { error: "Outlet not found" };
			}

			const tables = query.tables.split(",");
			return handlePull(query.outletId, outlet.merchantId, tables, query.since);
		},
		{
			query: t.Object({
				outletId: t.String(),
				tables: t.String(),
				since: t.String(),
			}),
		},
	);
