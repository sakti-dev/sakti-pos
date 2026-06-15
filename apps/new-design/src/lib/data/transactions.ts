import type { Product } from "~/pages/transactions/cash-register/components/types";
import type { OrderItem } from "~/pages/transactions/payment/components/order-summary";

/* ── Types ──────────────────────────────────────────────────────── */

export type TxStatus = "new" | "processing" | "waiting" | "done" | "cancelled";
export type FilterKey = "all" | TxStatus;

export interface TxEntry {
  readonly customer: string;
  readonly id: string;
  readonly items: readonly string[];
  readonly status: TxStatus;
  readonly time: string;
  readonly total: number;
}

/* ── Cash register products ─────────────────────────────────────── */

export const cashRegisterProducts: readonly Product[] = [
  { id: 1, name: "Es Kopi Susu", price: 18_000, cat: "minuman", img: 225 },
  { id: 2, name: "Kopi Hitam", price: 12_000, cat: "minuman", img: 302 },
  { id: 3, name: "Matcha Latte", price: 22_000, cat: "minuman", img: 425 },
  { id: 4, name: "Cappuccino", price: 25_000, cat: "minuman", img: 431 },
  { id: 5, name: "Teh Manis", price: 8000, cat: "minuman", img: 591 },
  { id: 6, name: "Americano", price: 20_000, cat: "minuman", img: 312 },
  { id: 7, name: "Es Teh Tarik", price: 15_000, cat: "minuman", img: 383 },
  {
    id: 8,
    name: "Chocolate Milkshake",
    price: 28_000,
    cat: "minuman",
    img: 404,
  },
  {
    id: 9,
    name: "Nasi Goreng Spesial",
    price: 32_000,
    cat: "makanan",
    img: 292,
  },
  { id: 10, name: "Mie Goreng", price: 28_000, cat: "makanan", img: 505 },
  { id: 11, name: "Ayam Geprek", price: 25_000, cat: "makanan", img: 416 },
  { id: 12, name: "Sandwich Club", price: 30_000, cat: "makanan", img: 326 },
  { id: 13, name: "Burger Classic", price: 35_000, cat: "makanan", img: 461 },
  {
    id: 14,
    name: "Roti Bakar Coklat",
    price: 18_000,
    cat: "makanan",
    img: 488,
  },
  { id: 15, name: "Indomie Goreng", price: 15_000, cat: "makanan", img: 366 },
  { id: 16, name: "Kentang Goreng", price: 20_000, cat: "snack", img: 429 },
  { id: 17, name: "Pisang Goreng Keju", price: 18_000, cat: "snack", img: 317 },
  { id: 18, name: "Dimsum Ayam", price: 22_000, cat: "snack", img: 257 },
  { id: 19, name: "Cireng Isi", price: 15_000, cat: "snack", img: 139 },
  { id: 20, name: "Tahu Crispy", price: 12_000, cat: "snack", img: 493 },
  { id: 21, name: "Es Krim Vanilla", price: 15_000, cat: "dessert", img: 357 },
  { id: 22, name: "Pancake Madu", price: 25_000, cat: "dessert", img: 490 },
  { id: 23, name: "Waffle Coklat", price: 28_000, cat: "dessert", img: 225 },
  { id: 24, name: "Brownies", price: 20_000, cat: "dessert", img: 411 },
  { id: 25, name: "Paket Hemat A", price: 38_000, cat: "paket", img: 460 },
  { id: 26, name: "Paket Hemat B", price: 45_000, cat: "paket", img: 402 },
  { id: 27, name: "Paket Couple", price: 65_000, cat: "paket", img: 318 },
  { id: 28, name: "Paket Keluarga", price: 95_000, cat: "paket", img: 359 },
];

/* ── Payment sample cart ────────────────────────────────────────── */

export const samplePaymentCart: OrderItem[] = [
  {
    id: 1,
    name: "Es Kopi Susu",
    desc: "Minuman",
    price: 18_000,
    qty: 2,
    img: 237,
  },
  {
    id: 4,
    name: "Cappuccino",
    desc: "Minuman",
    price: 25_000,
    qty: 1,
    img: 225,
  },
  {
    id: 9,
    name: "Nasi Goreng Spesial",
    desc: "Makanan",
    price: 32_000,
    qty: 1,
    img: 292,
  },
  {
    id: 16,
    name: "Kentang Goreng",
    desc: "Snack",
    price: 20_000,
    qty: 2,
    img: 312,
  },
  {
    id: 21,
    name: "Es Krim Vanilla",
    desc: "Dessert",
    price: 15_000,
    qty: 1,
    img: 291,
  },
];

/* ── Transaction history ────────────────────────────────────────── */

export const sampleTransactions: readonly TxEntry[] = [
  {
    id: "TX-20260611-001",
    customer: "Meja 3",
    items: ["Es Kopi Susu", "Nasi Goreng Spesial"],
    total: 68_000,
    status: "new",
    time: "08:42",
  },
  {
    id: "TX-20260611-002",
    customer: "Budi Santoso",
    items: ["Matcha Latte", "Roti Bakar"],
    total: 52_000,
    status: "processing",
    time: "08:35",
  },
  {
    id: "TX-20260611-003",
    customer: "Meja 7",
    items: ["Americano", "Cappuccino", "Cheesecake"],
    total: 115_000,
    status: "waiting",
    time: "08:28",
  },
  {
    id: "TX-20260611-004",
    customer: "Sari Dewi",
    items: ["Teh Tarik"],
    total: 22_000,
    status: "done",
    time: "08:15",
  },
  {
    id: "TX-20260611-005",
    customer: "Walk-in",
    items: ["Kopi Tubruk", "Pisang Goreng"],
    total: 35_000,
    status: "done",
    time: "08:02",
  },
  {
    id: "TX-20260611-006",
    customer: "Meja 1",
    items: ["Latte", "Sandwich Club"],
    total: 78_000,
    status: "processing",
    time: "07:55",
  },
  {
    id: "TX-20260611-007",
    customer: "Andi Pratama",
    items: ["Es Teh Manis"],
    total: 12_000,
    status: "cancelled",
    time: "07:48",
  },
  {
    id: "TX-20260611-008",
    customer: "Meja 5",
    items: ["Mocha Frappe", "Brownies", "Es Jeruk"],
    total: 95_000,
    status: "new",
    time: "07:30",
  },
  {
    id: "TX-20260611-009",
    customer: "Rina Kartika",
    items: ["Caramel Macchiato", "Croissant"],
    total: 62_000,
    status: "done",
    time: "07:15",
  },
  {
    id: "TX-20260611-010",
    customer: "Meja 2",
    items: ["Ayam Geprek", "Es Jeruk Segar"],
    total: 48_000,
    status: "waiting",
    time: "07:05",
  },
  {
    id: "TX-20260611-011",
    customer: "Dian Lestari",
    items: ["Flat White"],
    total: 32_000,
    status: "done",
    time: "06:50",
  },
  {
    id: "TX-20260611-012",
    customer: "Meja 9",
    items: ["Nasi Goreng Spesial", "Es Kopi Susu", "Es Teh Tarik"],
    total: 92_000,
    status: "processing",
    time: "06:35",
  },
];

/* ── Transaction filter counts (dynamic — from backend) ─────────── */

export const transactionFilterCounts: Record<FilterKey, number> = {
  all: 100,
  new: 20,
  processing: 30,
  waiting: 5,
  done: 92,
  cancelled: 0,
};

/* ── Receipt sample items ───────────────────────────────────────── */

export const sampleReceiptItems = [
  { name: "Es Kopi Susu", desc: "Minuman", price: 18_000, qty: 2 },
  { name: "Cappuccino", desc: "Minuman", price: 25_000, qty: 1 },
  { name: "Nasi Goreng Spesial", desc: "Makanan", price: 32_000, qty: 1 },
  { name: "Kentang Goreng", desc: "Snack", price: 20_000, qty: 2 },
  { name: "Es Krim Vanilla", desc: "Dessert", price: 15_000, qty: 1 },
] as const;
