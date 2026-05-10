import { useParams } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateProduct = vi.fn();
const mockUpdateProduct = vi.fn();

const URL_GAMBAR = /URL Gambar/;

const mockCategories = [
	{
		id: "category-1",
		name: "Minuman",
		sortOrder: 0,
		isActive: true,
		createdAt: "",
		updatedAt: "",
	},
	{
		id: "category-2",
		name: "Makanan",
		sortOrder: 1,
		isActive: true,
		createdAt: "",
		updatedAt: "",
	},
];

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: vi.fn(() => ({})),
}));

vi.mock("~/db/menu", () => ({
	getCategories: vi.fn(() => Promise.resolve(mockCategories)),
	getProduct: vi.fn(() =>
		Promise.resolve({
			id: "product-1",
			name: "Kopi Susu",
			price: 15_000,
			categoryId: "category-1",
			imageUrl: null,
			isActive: true,
			createdAt: "",
			updatedAt: "",
		}),
	),
	createProduct: (...args: unknown[]) => mockCreateProduct(...args),
	updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

vi.mock("~/components/ui/page-header", () => ({
	PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
		<div data-testid="page-header">
			<span data-testid="back-href">{props.backHref ?? ""}</span>
			<h1>{props.children}</h1>
		</div>
	),
}));

vi.mock("~/components/ui/button", () => ({
	Button: (props: {
		children: JSX.Element;
		class?: string;
		disabled?: boolean;
		onClick?: () => void;
		size?: string;
		type?: "button" | "submit";
	}) => (
		<button
			class={props.class}
			data-testid="save-btn"
			disabled={props.disabled}
			onClick={props.onClick}
			type={props.type ?? "button"}
		>
			{props.children}
		</button>
	),
}));

vi.mock("~/components/ui/select", () => ({
	Select: (props: {
		label?: string;
		name?: string;
		onChange: (v: unknown) => void;
		options: { label: string; value: string }[];
		placeholder?: string;
		value?: unknown;
	}) => (
		<select
			data-testid="category-select"
			name={props.name}
			onChange={(e) => props.onChange(e.currentTarget.value)}
			value={String(props.value ?? "")}
		>
			<option value="">{props.placeholder}</option>
			<option value="category-1">Minuman</option>
			<option value="category-2">Makanan</option>
		</select>
	),
}));

import ProductForm from "../product-form";

const user = userEvent.setup();

describe("ProductForm (create mode)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows 'Tambah Produk' title", () => {
		render(() => <ProductForm />);
		expect(screen.getByText("Tambah Produk")).toBeInTheDocument();
	});

	test("shows name, category, price, and image URL inputs", () => {
		render(() => <ProductForm />);
		expect(screen.getByPlaceholderText("Contoh: Kopi Susu")).toBeInTheDocument();
		expect(screen.getByTestId("category-select")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
		expect(screen.getByText(URL_GAMBAR)).toBeInTheDocument();
	});

	test("submit is disabled when required fields are empty", () => {
		render(() => <ProductForm />);
		expect(screen.getByTestId("save-btn")).toBeDisabled();
	});

	test("submit is enabled when all required fields are filled", async () => {
		render(() => <ProductForm />);
		await user.type(screen.getByPlaceholderText("Contoh: Kopi Susu"), "Es Teh");
		await user.selectOptions(screen.getByTestId("category-select"), "category-1");
		await user.type(screen.getByPlaceholderText("0"), "10000");
		expect(screen.getByTestId("save-btn")).not.toBeDisabled();
	});

	test("category select is populated with options", () => {
		render(() => <ProductForm />);
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(3);
		expect(options[1]).toHaveTextContent("Minuman");
		expect(options[2]).toHaveTextContent("Makanan");
	});

	test("submit calls createProduct with imageUrl: null when no image is set", async () => {
		render(() => <ProductForm />);
		await user.type(screen.getByPlaceholderText("Contoh: Kopi Susu"), "Es Teh");
		await user.selectOptions(screen.getByTestId("category-select"), "category-1");
		await user.type(screen.getByPlaceholderText("0"), "10000");
		await user.click(screen.getByTestId("save-btn"));
		expect(mockCreateProduct).toHaveBeenCalledWith(
			expect.objectContaining({ imageUrl: null }),
		);
	});

	test("shows required asterisk on required fields", () => {
		render(() => <ProductForm />);
		expect(screen.getByText("*")).toBeInTheDocument();
	});
});

describe("ProductForm (edit mode)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows 'Edit Produk' title", async () => {
		vi.mocked(useParams).mockReturnValue({ id: "1" });
		render(() => <ProductForm />);
		await screen.findByText("Edit Produk");
		expect(screen.getByText("Edit Produk")).toBeInTheDocument();
		expect(await screen.findByDisplayValue("Kopi Susu")).toBeInTheDocument();
		expect(screen.getByTestId("category-select")).toHaveValue("category-1");
		expect(screen.getByDisplayValue("15000")).toBeInTheDocument();
	});
});
