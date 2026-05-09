import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Category } from "~/db/menu";

const mockCategories: Category[] = [
	{
		id: "category-1",
		merchantId: "merchant-1",
		name: "Minuman",
		sortOrder: 0,
		isActive: true,
		createdAt: "",
		updatedAt: "",
		deletedAt: null,
		isSynced: false,
	},
	{
		id: "category-2",
		merchantId: "merchant-1",
		name: "Makanan",
		sortOrder: 1,
		isActive: false,
		createdAt: "",
		updatedAt: "",
		deletedAt: null,
		isSynced: false,
	},
];

const mockNavigate = vi.fn();
const mockDeleteCategory = vi.fn();
const mockUpdateCategory = vi.fn();
const mockGetProductCountByCategory = vi.fn((_id?: string) =>
	Promise.resolve(0),
);

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
	deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
	updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
	getProductCountByCategory: (id: string) => mockGetProductCountByCategory(id),
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

import CategoryList from "../category-list";

describe("CategoryList", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("shows skeleton during loading via Suspense", async () => {
		const { getCategories } = await import("~/db/menu");
		let resolve!: (value: Category[]) => void;
		vi.mocked(getCategories).mockImplementationOnce(
			() =>
				new Promise((r) => {
					resolve = r;
				}),
		);
		render(() => <CategoryList />);
		expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
		resolve(mockCategories);
		await screen.findByText("Minuman");
	});

	test("renders categories with active/inactive status", async () => {
		render(() => <CategoryList />);
		await screen.findByText("Minuman");
		expect(screen.getByText("Minuman")).toBeInTheDocument();
		expect(screen.getByText("Makanan")).toBeInTheDocument();
		expect(screen.getAllByText("Aktif").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Nonaktif").length).toBeGreaterThanOrEqual(1);
	});

	test("shows category count", async () => {
		render(() => <CategoryList />);
		await screen.findByText("Minuman");
		expect(screen.getByText("2 kategori")).toBeInTheDocument();
	});

	test("shows empty state when no categories", async () => {
		const { getCategories } = await import("~/db/menu");
		vi.mocked(getCategories).mockResolvedValueOnce([]);
		render(() => <CategoryList />);
		await screen.findByText("Belum ada kategori");
		expect(screen.getByText("Belum ada kategori")).toBeInTheDocument();
		expect(
			screen.getByText(/Tap "\+ Tambah" untuk membuat kategori baru/),
		).toBeInTheDocument();
	});

	test("shows '+ Tambah' link", async () => {
		render(() => <CategoryList />);
		await screen.findByText("Minuman");
		expect(screen.getByText("+ Tambah")).toBeInTheDocument();
		expect(screen.getByTestId("link")).toHaveAttribute(
			"href",
			"/menu/categories/add",
		);
	});
});
