import { users } from "@repo/database";
import { count, eq } from "drizzle-orm";
import { db } from "./index";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export async function getUsers(): Promise<User[]> {
  return await db.select().from(users).orderBy(users.name, users.id);
}

export async function getUser(id: number): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

export async function createUser(data: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(data).returning();
  return row;
}

export async function updateUser(
  id: number,
  data: Partial<Omit<NewUser, "id">>
): Promise<User> {
  const [row] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function countActiveOwners(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, "owner"));
  return row?.count ?? 0;
}
