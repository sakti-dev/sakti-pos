import { merchants, userMerchants } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { getSessionFromRequest } from "../lib/session";

export const merchantsRoutes = new Elysia({ prefix: "/api/merchants" })
	.post(
		"/",
		async ({ body, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const now = new Date().toISOString();
			const [merchant] = await db
				.insert(merchants)
				.values({
					name: body.name,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			await db.insert(userMerchants).values({
				userId: session.userId,
				merchantId: merchant.id,
				role: "owner",
				joinedAt: now,
			});

			return merchant;
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 100 }),
			}),
		},
	)
	.get("/", async ({ set, request }) => {
		const session = await getSessionFromRequest(request);
		if (!session) {
			set.status = 401;
			return { error: "Unauthorized" };
		}

		return db
			.select({
				merchantId: userMerchants.merchantId,
				name: merchants.name,
				role: userMerchants.role,
			})
			.from(userMerchants)
			.innerJoin(merchants, eq(userMerchants.merchantId, merchants.id))
			.where(eq(userMerchants.userId, session.userId));
	});
