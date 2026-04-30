import { invoke } from "@tauri-apps/api/core";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "./index";
import type { Product } from "./menu";
import { categories, orders, products } from "./schema";

interface SqlStatement {
  params: unknown[];
  sql: string;
}

interface BatchResult {
  last_insert_id: number;
  rows_affected: number;
}

export async function createOrder(data: {
  amountPaid: number | null;
  changeAmount: number | null;
  items: {
    price: number;
    product_id: number;
    product_name: string;
    qty: number;
  }[];
  paymentMethod: "cash" | "qris";
  total: number;
  userId: number;
}): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const orderNumber = await getNextOrderNumber(today);

  const now = new Date().toISOString();

  const insertOrder: SqlStatement = {
    sql: `INSERT INTO orders (order_number, user_id, total, payment_method, amount_paid, change_amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
    params: [
      orderNumber,
      data.userId,
      data.total,
      data.paymentMethod,
      data.amountPaid,
      data.changeAmount,
      now,
      now,
    ],
  };

  const itemStatements: SqlStatement[] = data.items.map((item) => ({
    sql: "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, created_at) VALUES (LAST_INSERT_ROWID(), ?, ?, ?, ?, ?, ?)",
    params: [
      item.product_id,
      item.product_name,
      item.qty,
      item.price,
      item.qty * item.price,
      now,
    ],
  }));

  await invoke<BatchResult>("run_sql_batch", {
    statements: [insertOrder, ...itemStatements],
  });

  return orderNumber;
}

async function getNextOrderNumber(date: string): Promise<string> {
  const prefix = `${date}-`;
  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`))
    .orderBy(sql`LENGTH(${orders.orderNumber})`, orders.orderNumber);

  const maxNum = rows.reduce((max, row) => {
    const suffix = row.orderNumber.slice(prefix.length);
    const n = Number.parseInt(suffix, 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);

  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export type ProductWithCategory = Product & { categoryName: string };

export async function getActiveProductsByCategory(): Promise<
  { categoryName: string; products: ProductWithCategory[] }[]
> {
  const rows = await db
    .select({
      categoryId: products.categoryId,
      categoryIsActive: categories.isActive,
      categoryName: categories.name,
      createdAt: products.createdAt,
      id: products.id,
      imageUrl: products.imageUrl,
      isActive: products.isActive,
      name: products.name,
      price: products.price,
      sortOrder: products.sortOrder,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.isActive, true), eq(categories.isActive, true)))
    .orderBy(categories.name, products.name, products.id);

  const grouped = new Map<string, ProductWithCategory[]>();
  for (const row of rows) {
    const list = grouped.get(row.categoryName) ?? [];
    list.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      createdAt: row.createdAt,
      id: row.id,
      imageUrl: row.imageUrl,
      isActive: row.isActive,
      name: row.name,
      price: row.price,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt,
    });
    grouped.set(row.categoryName, list);
  }

  return Array.from(grouped.entries()).map(([categoryName, prods]) => ({
    categoryName,
    products: prods,
  }));
}
