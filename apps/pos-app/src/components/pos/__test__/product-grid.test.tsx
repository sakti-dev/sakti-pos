import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { ProductWithCategory } from "~/db/orders";
import { addToCart } from "~/lib/cart";
import { ProductGrid } from "../product-grid";

vi.mock("~/lib/cart", () => ({
	addToCart: vi.fn(),
}));

const user = userEvent.setup();

const mockProducts: ProductWithCategory[] = [
	{
		id: 1,
		name: "Nasi Goreng",
		price: 15_000,
		categoryId: 1,
		categoryName: "Makanan",
		imageUrl: null,
		isActive: true,
		sortOrder: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		shopId: null,
		cloudId: null,
		deletedAt: null,
		isSynced: false,
	},
	{
		id: 2,
		name: "Es Teh",
		price: 5000,
		categoryId: 2,
		categoryName: "Minuman",
		imageUrl: null,
		isActive: true,
		sortOrder: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		shopId: null,
		cloudId: null,
		deletedAt: null,
		isSynced: false,
	},
];

describe("ProductGrid", () => {
	test("renders product names and prices", () => {
		render(() => <ProductGrid products={mockProducts} />);
		expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
		expect(screen.getByText("Es Teh")).toBeInTheDocument();
	});

	test("shows empty state when products array is empty", () => {
		render(() => <ProductGrid products={[]} />);
		expect(screen.getByText("Tidak ada produk")).toBeInTheDocument();
		expect(
			screen.getByText("Tambahkan produk di halaman Menu"),
		).toBeInTheDocument();
	});

	test("calls addToCart when a product is clicked", async () => {
		render(() => <ProductGrid products={mockProducts} />);
		await user.click(screen.getByText("Nasi Goreng"));
		expect(addToCart).toHaveBeenCalledWith(mockProducts[0]);
	});
});
