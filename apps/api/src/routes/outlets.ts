import { outlets, userMerchants } from "@repo/database/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { getSessionFromRequest } from "../lib/session";

async function verifyMerchantAccess(
	userId: string,
	merchantId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: userMerchants.id })
		.from(userMerchants)
		.where(
			and(
				eq(userMerchants.userId, userId),
				eq(userMerchants.merchantId, merchantId),
			),
		)
		.limit(1);
	return !!row;
}

export const outletsRoutes = new Elysia({ prefix: "/api" })
	.post(
		"/merchants/:merchantId/outlets",
		async ({ body, params: { merchantId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const hasAccess = await verifyMerchantAccess(session.userId, merchantId);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const now = new Date().toISOString();
			const [outlet] = await db
				.insert(outlets)
				.values({
					merchantId,
					name: body.name,
					address: body.address ?? null,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			return outlet;
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 100 }),
				address: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/merchants/:merchantId/outlets",
		async ({ params: { merchantId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const hasAccess = await verifyMerchantAccess(session.userId, merchantId);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			return db
				.select()
				.from(outlets)
				.where(eq(outlets.merchantId, merchantId));
		},
	)
	.patch(
		"/outlets/:id",
		async ({ body, params: { id }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const [outlet] = await db
				.select()
				.from(outlets)
				.where(eq(outlets.id, id))
				.limit(1);

			if (!outlet) {
				set.status = 404;
				return { error: "Outlet not found" };
			}

			const hasAccess = await verifyMerchantAccess(
				session.userId,
				outlet.merchantId,
			);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const [updated] = await db
				.update(outlets)
				.set({ ...body, updatedAt: new Date().toISOString() })
				.where(eq(outlets.id, id))
				.returning();

			return updated;
		},
		{
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
				address: t.Optional(t.String()),
				isActive: t.Optional(t.Boolean()),
			}),
		},
	);
