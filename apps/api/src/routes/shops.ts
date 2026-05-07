import { shops, users } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { getSessionFromRequest } from "../lib/session";

export const shopsRoutes = new Elysia({ prefix: "/api/shops" })
	.post(
		"/",
		async ({ body, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const now = new Date().toISOString();
			const id = crypto.randomUUID();
			const [shop] = await db
				.insert(shops)
				.values({
					id,
					name: body.name,
					ownerId: session.userId,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			await db
				.update(users)
				.set({ shopId: id })
				.where(eq(users.id, session.userId));

			return shop;
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

		return db.select().from(shops).where(eq(shops.ownerId, session.userId));
	})
	.get("/:id", async ({ params: { id }, set, request }) => {
		const session = await getSessionFromRequest(request);
		if (!session) {
			set.status = 401;
			return { error: "Unauthorized" };
		}

		const [shop] = await db.select().from(shops).where(eq(shops.id, id));
		return shop ?? null;
	});
