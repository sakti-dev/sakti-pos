import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Category, Product } from "~/db/menu";

const mockCategories: Category[] = [
	{
		id: 1,
		name: "Minuman",
		sortOrder: 0,
		isActive: true,
		createdAt: "",
		updatedAt: "",
	},
	{
		id: 2,
		name: "Makanan",
		sortOrder: 1,
		isActive: true,
		createdAt: "",
		updatedAt: "",
	},
];

const mockProducts: Product[] = [
	{
		id: 1,
		name: "Kopi Susu",
		price: 15_000,
		categoryId: 1,
		imageUrl: null,
		isActive: true,
		createdAt: "",
		updatedAt: "",
		sortOrder: 0,
	},
	{
		id: 2,
		name: "Teh Manis",
		price: 8000,
		categoryId: 1,
		imageUrl: null,
		isActive: true,
		createdAt: "",
		updatedAt: "",
		sortOrder: 0,
	},
	{
		id: 3,
		name: "Nasi Goreng",
		price: 20_000,
		categoryId: 2,
		imageUrl: null,
		isActive: false,
		createdAt: "",
		updatedAt: "",
		sortOrder: 0,
	},
];

const mockNavigate = vi.fn();
const mockDeleteProduct = vi.fn();
const mockUpdateProduct = vi.fn();

vi.mock("@solidjs/router", () => ({
	A: (props: { children: JSX.Element; href: string }) => (
		<a data-testid="link" href={props.href}>
			{props.children}
		</a>
	),
	useNavigate: () => mockNavigate,
}));

vi.mock("~/db/menu", () => ({
	getCategories: vi.fn(() => Promise.resolve(mockCategories)),
	getProducts: vi.fn(() => Promise.resolve(mockProducts)),
	deleteProduct: (...args: unknown[]) => mockDeleteProduct(...args),
	updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

vi.mock("~/components/ui/page-header", () => ({
	PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
		<div data-testid="page-header">
			<h1>{props.children}</h1>
		</div>
	),
}));

vi.mock("~/components/ui/button", () => ({
	Button: (props: { children: JSX.Element; size?: string }) => (
		<button data-testid="btn-add" type="button">
			{props.children}
		</button>
	),
}));

vi.mock("~/components/ui/select", () => ({
	Select: (props: {
		children?: unknown;
		class?: string;
		label?: string;
		onChange: (v: unknown) => void;
		options: { label: string; value: string | number }[];
		placeholder?: string;
		value?: unknown;
	}) => (
		<select
			data-testid="category-filter"
			onChange={(e) => props.onChange(e.currentTarget.value)}
			value={String(props.value ?? "")}
		>
			<option value="">Semua Kategori</option>
			<option value="1">Minuman</option>
			<option value="2">Makanan</option>
		</select>
	),
}));

vi.mock("~/components/ui/skeleton", () => ({
	Skeleton: (props: { class?: string }) => (
		<div class={props.class} data-testid="skeleton" />
	),
}));

vi.mock("~/components/confirm-drawer", () => ({
	ConfirmDrawer: (props: {
		open: boolean;
		message: string;
		title: string;
		confirmLabel: string;
		onConfirm: () => void;
	}) => (
		<Show when={props.open}>
			<div data-testid="confirm-drawer">
				<h3>{props.title}</h3>
				<p>{props.message}</p>
				<button
					data-testid="confirm-btn"
					onClick={props.onConfirm}
					type="button"
				>
					{props.confirmLabel}
				</button>
			</div>
		</Show>
	),
}));

vi.mock("solid-sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

import ProductList from "../product-list";

describe("ProductList", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("renders products grouped by category", async () => {
		render(() => <ProductList />);
		await screen.findByText("Produk");
		expect(screen.getAllByText("Minuman").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Makanan").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText("Kopi Susu")).toBeInTheDocument();
		expect(screen.getByText("Teh Manis")).toBeInTheDocument();
		expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
	});

	test("shows active/inactive status for products", async () => {
		render(() => <ProductList />);
		await screen.findByText("Produk");
		const activeButtons = screen.getAllByText("Aktif");
		expect(activeButtons.length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText("Nonaktif")).toBeInTheDocument();
	});

	test("shows empty state when no products", async () => {
		const { getProducts } = await import("~/db/menu");
		vi.mocked(getProducts).mockResolvedValueOnce([]);
		render(() => <ProductList />);
		await screen.findByText("Belum ada produk");
		expect(screen.getByText("Belum ada produk")).toBeInTheDocument();
	});

	test("shows category filter and add button", async () => {
		render(() => <ProductList />);
		await screen.findByText("Produk");
		expect(screen.getByTestId("category-filter")).toBeInTheDocument();
		expect(screen.getByText("+ Tambah")).toBeInTheDocument();
	});

	test("shows product count grouped correctly", async () => {
		render(() => <ProductList />);
		await screen.findByText("Produk");
		const minumanCount = screen
			.getAllByText("Kopi Susu")
			.concat(screen.getAllByText("Teh Manis"));
		expect(minumanCount.length).toBe(2);
	});
});
