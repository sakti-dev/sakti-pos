import { categories, products } from "@repo/database";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { db } from "./index";

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export async function getCategories(): Promise<Category[]> {
	return await db
		.select()
		.from(categories)
		.orderBy(categories.name, categories.id);
}

export async function getCategory(id: number): Promise<Category | undefined> {
	const [row] = await db.select().from(categories).where(eq(categories.id, id));
	return row;
}

export async function createCategory(data: NewCategory): Promise<Category> {
	const [row] = await db.insert(categories).values(data).returning();
	return row;
}

export async function updateCategory(
	id: number,
	data: Partial<Omit<NewCategory, "id">>,
): Promise<Category> {
	const [row] = await db
		.update(categories)
		.set({ ...data, updatedAt: dayjs().toISOString() })
		.where(eq(categories.id, id))
		.returning();
	return row;
}

export async function deleteCategory(id: number): Promise<void> {
	await db.delete(categories).where(eq(categories.id, id));
}

export async function getProductCountByCategory(
	categoryId: number,
): Promise<number> {
	const rows = await db
		.select({ id: products.id })
		.from(products)
		.where(eq(products.categoryId, categoryId))
		.limit(1);
	return rows.length;
}

export async function getProducts(
	filterCategoryId?: number,
): Promise<Product[]> {
	if (filterCategoryId !== undefined) {
		return await db
			.select()
			.from(products)
			.where(eq(products.categoryId, filterCategoryId))
			.orderBy(products.name, products.id);
	}
	return await db.select().from(products).orderBy(products.name, products.id);
}

export async function getProduct(id: number): Promise<Product | undefined> {
	const [row] = await db.select().from(products).where(eq(products.id, id));
	return row;
}

export async function createProduct(data: NewProduct): Promise<Product> {
	const [row] = await db.insert(products).values(data).returning();
	return row;
}

export async function updateProduct(
	id: number,
	data: Partial<Omit<NewProduct, "id">>,
): Promise<Product> {
	const [row] = await db
		.update(products)
		.set({ ...data, updatedAt: dayjs().toISOString() })
		.where(eq(products.id, id))
		.returning();
	return row;
}

export async function deleteProduct(id: number): Promise<void> {
	await db.delete(products).where(eq(products.id, id));
}
