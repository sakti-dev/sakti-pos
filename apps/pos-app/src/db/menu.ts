import { categories, products } from "@repo/database";
import dayjs from "dayjs";
import { and, eq, isNull } from "drizzle-orm";
import { currentShopId } from "~/lib/shop";
import { db } from "./index";

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export async function getCategories(): Promise<Category[]> {
	const shopId = currentShopId();
	const conditions = [isNull(categories.deletedAt)];
	if (shopId) conditions.push(eq(categories.shopId, shopId));

	return await db
		.select()
		.from(categories)
		.where(and(...conditions))
		.orderBy(categories.name, categories.id);
}

export async function getCategory(id: number): Promise<Category | undefined> {
	const shopId = currentShopId();
	const conditions = [eq(categories.id, id), isNull(categories.deletedAt)];
	if (shopId) conditions.push(eq(categories.shopId, shopId));

	const [row] = await db
		.select()
		.from(categories)
		.where(and(...conditions));
	return row;
}

export async function createCategory(data: NewCategory): Promise<Category> {
	const [row] = await db
		.insert(categories)
		.values({ ...data, shopId: currentShopId() ?? undefined })
		.returning();
	return row;
}

export async function updateCategory(
	id: number,
	data: Partial<Omit<NewCategory, "id">>,
): Promise<Category> {
	const [row] = await db
		.update(categories)
		.set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
		.where(eq(categories.id, id))
		.returning();
	return row;
}

export async function deleteCategory(id: number): Promise<void> {
	const now = dayjs().toISOString();
	await db
		.update(categories)
		.set({ deletedAt: now, updatedAt: now, isSynced: false })
		.where(eq(categories.id, id));
}

export async function getProductCountByCategory(
	categoryId: number,
): Promise<number> {
	const shopId = currentShopId();
	const conditions = [
		eq(products.categoryId, categoryId),
		isNull(products.deletedAt),
	];
	if (shopId) conditions.push(eq(products.shopId, shopId));

	const rows = await db
		.select({ id: products.id })
		.from(products)
		.where(and(...conditions))
		.limit(1);
	return rows.length;
}

export async function getProducts(
	filterCategoryId?: number,
): Promise<Product[]> {
	const shopId = currentShopId();
	const conditions = [isNull(products.deletedAt)];
	if (shopId) conditions.push(eq(products.shopId, shopId));

	if (filterCategoryId !== undefined) {
		conditions.push(eq(products.categoryId, filterCategoryId));
	}
	return await db
		.select()
		.from(products)
		.where(and(...conditions))
		.orderBy(products.name, products.id);
}

export async function getProduct(id: number): Promise<Product | undefined> {
	const shopId = currentShopId();
	const conditions = [eq(products.id, id), isNull(products.deletedAt)];
	if (shopId) conditions.push(eq(products.shopId, shopId));

	const [row] = await db
		.select()
		.from(products)
		.where(and(...conditions));
	return row;
}

export async function createProduct(data: NewProduct): Promise<Product> {
	const [row] = await db
		.insert(products)
		.values({ ...data, shopId: currentShopId() ?? undefined })
		.returning();
	return row;
}

export async function updateProduct(
	id: number,
	data: Partial<Omit<NewProduct, "id">>,
): Promise<Product> {
	const [row] = await db
		.update(products)
		.set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
		.where(eq(products.id, id))
		.returning();
	return row;
}

export async function deleteProduct(id: number): Promise<void> {
	const now = dayjs().toISOString();
	await db
		.update(products)
		.set({ deletedAt: now, updatedAt: now, isSynced: false })
		.where(eq(products.id, id));
}
