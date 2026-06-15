/* ── Katalog data types + sample data + helpers ─────────────────── */

export type StockStatus = "available" | "low" | "out";

export interface Product {
  readonly category: string;
  readonly id: number;
  readonly name: string;
  readonly price: number;
  readonly sku: string;
  readonly stock: number;
  readonly unit: string;
}

export interface VariantOption {
  readonly label: string;
  readonly price: number;
}

export interface Variant {
  readonly id: number;
  readonly name: string;
  readonly options: readonly VariantOption[];
  readonly productIds: readonly number[];
}

export interface Category {
  readonly color: string;
  readonly id: string;
  readonly name: string;
}

export const categories: readonly Category[] = [
  { id: "kopi", name: "Kopi", color: "#1c3a13" },
  { id: "non-kopi", name: "Non-Kopi", color: "#0284c7" },
  { id: "makanan", name: "Makanan", color: "#e6a817" },
  { id: "snack", name: "Snack", color: "#22c55e" },
  { id: "dessert", name: "Dessert", color: "#c62828" },
] as const;

export const products: readonly Product[] = [
  {
    id: 1,
    name: "Es Kopi Susu",
    sku: "KPI-001",
    category: "kopi",
    price: 22_000,
    stock: 80,
    unit: "cup",
  },
  {
    id: 2,
    name: "Kopi Hitam",
    sku: "KPI-002",
    category: "kopi",
    price: 15_000,
    stock: 60,
    unit: "cup",
  },
  {
    id: 3,
    name: "Cappuccino",
    sku: "KPI-003",
    category: "kopi",
    price: 28_000,
    stock: 45,
    unit: "cup",
  },
  {
    id: 4,
    name: "Affogato",
    sku: "KPI-004",
    category: "kopi",
    price: 32_000,
    stock: 20,
    unit: "glass",
  },
  {
    id: 5,
    name: "Vietnam Drip",
    sku: "KPI-005",
    category: "kopi",
    price: 25_000,
    stock: 35,
    unit: "glass",
  },
  {
    id: 6,
    name: "Matcha Latte",
    sku: "NKP-001",
    category: "non-kopi",
    price: 25_000,
    stock: 50,
    unit: "cup",
  },
  {
    id: 7,
    name: "Teh Tarik",
    sku: "NKP-002",
    category: "non-kopi",
    price: 18_000,
    stock: 70,
    unit: "glass",
  },
  {
    id: 8,
    name: "Chocolate Milk",
    sku: "NKP-003",
    category: "non-kopi",
    price: 22_000,
    stock: 40,
    unit: "glass",
  },
  {
    id: 9,
    name: "Lemon Tea",
    sku: "NKP-004",
    category: "non-kopi",
    price: 16_000,
    stock: 55,
    unit: "glass",
  },
  {
    id: 10,
    name: "Red Velvet Latte",
    sku: "NKP-005",
    category: "non-kopi",
    price: 28_000,
    stock: 25,
    unit: "cup",
  },
  {
    id: 11,
    name: "Nasi Goreng Spesial",
    sku: "MKN-001",
    category: "makanan",
    price: 35_000,
    stock: 30,
    unit: "plate",
  },
  {
    id: 12,
    name: "Mie Goreng",
    sku: "MKN-002",
    category: "makanan",
    price: 30_000,
    stock: 25,
    unit: "plate",
  },
  {
    id: 13,
    name: "Roti Bakar",
    sku: "MKN-003",
    category: "makanan",
    price: 22_000,
    stock: 40,
    unit: "plate",
  },
  {
    id: 14,
    name: "Indomie Rebus",
    sku: "MKN-004",
    category: "makanan",
    price: 18_000,
    stock: 50,
    unit: "bowl",
  },
  {
    id: 15,
    name: "Kentang Goreng",
    sku: "SNK-001",
    category: "snack",
    price: 20_000,
    stock: 35,
    unit: "plate",
  },
  {
    id: 16,
    name: "Pisang Goreng",
    sku: "SNK-002",
    category: "snack",
    price: 15_000,
    stock: 45,
    unit: "pcs",
  },
  {
    id: 17,
    name: "Tahu Crispy",
    sku: "SNK-003",
    category: "snack",
    price: 12_000,
    stock: 60,
    unit: "pcs",
  },
  {
    id: 18,
    name: "Dimsum Ayam",
    sku: "SNK-004",
    category: "snack",
    price: 25_000,
    stock: 30,
    unit: "pcs",
  },
  {
    id: 19,
    name: "Brownies",
    sku: "DSR-001",
    category: "dessert",
    price: 28_000,
    stock: 15,
    unit: "pcs",
  },
  {
    id: 20,
    name: "Pancake",
    sku: "DSR-002",
    category: "dessert",
    price: 30_000,
    stock: 20,
    unit: "plate",
  },
  {
    id: 21,
    name: "Es Krim Sundae",
    sku: "DSR-003",
    category: "dessert",
    price: 20_000,
    stock: 0,
    unit: "cup",
  },
  {
    id: 22,
    name: "Cheesecake",
    sku: "DSR-004",
    category: "dessert",
    price: 35_000,
    stock: 10,
    unit: "pcs",
  },
  {
    id: 23,
    name: "American Pie",
    sku: "DSR-005",
    category: "dessert",
    price: 28_000,
    stock: 0,
    unit: "pcs",
  },
  {
    id: 24,
    name: "Latte Art Special",
    sku: "KPI-006",
    category: "kopi",
    price: 35_000,
    stock: 5,
    unit: "cup",
  },
] as const;

export const variants: readonly Variant[] = [
  {
    id: 1,
    name: "Size",
    productIds: [1, 2, 3, 5, 6, 8, 10],
    options: [
      { label: "Small", price: 0 },
      { label: "Medium", price: 3000 },
      { label: "Large", price: 5000 },
    ],
  },
  {
    id: 2,
    name: "Gula",
    productIds: [1, 3, 5, 6, 8, 10],
    options: [
      { label: "0%", price: 0 },
      { label: "25%", price: 0 },
      { label: "50%", price: 0 },
      { label: "100%", price: 0 },
    ],
  },
  {
    id: 3,
    name: "Es",
    productIds: [1, 2, 5, 6, 7, 8, 9, 10],
    options: [
      { label: "Normal", price: 0 },
      { label: "Less", price: 0 },
      { label: "No Ice", price: 0 },
    ],
  },
  {
    id: 4,
    name: "Topping",
    productIds: [6, 8, 10, 19, 20],
    options: [
      { label: "Boba", price: 8000 },
      { label: "Jelly", price: 6000 },
      { label: "Cream Cheese", price: 10_000 },
    ],
  },
  {
    id: 5,
    name: "Level Pedas",
    productIds: [11, 12, 14, 15, 18],
    options: [
      { label: "1", price: 0 },
      { label: "2", price: 0 },
      { label: "3", price: 0 },
      { label: "4", price: 2000 },
      { label: "5", price: 4000 },
    ],
  },
  {
    id: 6,
    name: "Telur",
    productIds: [11, 12, 14],
    options: [
      { label: "Ceplok", price: 5000 },
      { label: "Mata Sapi", price: 5000 },
      { label: "Dadar", price: 5000 },
      { label: "Orak-arik", price: 5000 },
    ],
  },
  {
    id: 7,
    name: "Saus",
    productIds: [15, 16, 17, 18],
    options: [
      { label: "BBQ", price: 5000 },
      { label: "Cheese", price: 7000 },
      { label: "Truffle", price: 10_000 },
      { label: "Sambal", price: 3000 },
    ],
  },
] as const;

/* ── Helpers ── */

export function stockStatus(stock: number): {
  status: StockStatus;
  label: string;
  badge: "success" | "warning" | "danger";
} {
  if (stock === 0) {
    return { status: "out", label: "Habis", badge: "danger" };
  }
  if (stock <= 10) {
    return { status: "low", label: "Stok Rendah", badge: "warning" };
  }
  return { status: "available", label: "Tersedia", badge: "success" };
}

export function formatVariantOptions(
  options: readonly VariantOption[]
): string {
  return options
    .map((o) =>
      o.price > 0 ? `${o.label} (+${o.price.toLocaleString("id-ID")})` : o.label
    )
    .join(", ");
}

export function getVariantProductNames(
  productIds: readonly number[],
  allProducts: readonly Product[]
): string {
  const names = productIds
    .map((pid) => allProducts.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) {
    return "Belum ada produk";
  }
  const cap = 3;
  const shown = names.slice(0, cap).join(", ");
  const rest = names.length - cap;
  return rest > 0 ? `${shown} dan ${rest} lainnya` : shown;
}
