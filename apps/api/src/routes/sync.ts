import { Elysia, t } from "elysia";
import { getSessionFromRequest } from "../lib/session";
import { handlePull, handlePush, verifyShopAccess } from "../lib/sync";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
	.post(
		"/push",
		async ({ body, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const authorized = await verifyShopAccess(session.userId, body.shopId);
			if (!authorized) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			return handlePush(body.shopId, body.tables);
		},
		{
			body: t.Object({
				shopId: t.String(),
				tables: t.Record(t.String(), t.Array(t.Any())),
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

			const authorized = await verifyShopAccess(session.userId, query.shopId);
			if (!authorized) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const tables = query.tables.split(",");
			return handlePull(query.shopId, tables, query.since);
		},
		{
			query: t.Object({
				shopId: t.String(),
				tables: t.String(),
				since: t.String(),
			}),
		},
	);
