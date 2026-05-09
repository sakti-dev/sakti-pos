import { describe, expect, test } from "vitest";
import {
	addToCart,
	cartCount,
	cartItems,
	cartTotal,
	clearCart,
	removeFromCart,
	updateQuantity,
} from "../cart";

const makeProduct = (id: string, price = 10_000) => ({
	categoryId: "category-1",
	createdAt: "2026-01-01",
	id,
	imageUrl: null,
	isActive: true,
	merchantId: "merchant-1",
	name: `Product ${id}`,
	price,
	sortOrder: 0,
	updatedAt: "2026-01-01",
	deletedAt: null,
	isSynced: false,
});

describe("cart", () => {
	test("starts empty", () => {
		clearCart();
		expect(cartItems()).toHaveLength(0);
		expect(cartTotal()).toBe(0);
		expect(cartCount()).toBe(0);
	});

	test("addToCart adds a new item", () => {
		clearCart();
		addToCart(makeProduct("product-1"));
		expect(cartItems()).toHaveLength(1);
		expect(cartCount()).toBe(1);
		expect(cartTotal()).toBe(10_000);
		clearCart();
	});

	test("addToCart increments quantity for existing product", () => {
		clearCart();
		addToCart(makeProduct("product-1"));
		addToCart(makeProduct("product-1"));
		expect(cartItems()).toHaveLength(1);
		expect(cartItems()[0].quantity).toBe(2);
		expect(cartTotal()).toBe(20_000);
		clearCart();
	});

	test("updateQuantity changes quantity", () => {
		clearCart();
		addToCart(makeProduct("product-1"));
		updateQuantity("product-1", 5);
		expect(cartItems()[0].quantity).toBe(5);
		expect(cartTotal()).toBe(50_000);
		clearCart();
	});

	test("updateQuantity with 0 or negative removes item", () => {
		clearCart();
		addToCart(makeProduct("product-1"));
		updateQuantity("product-1", 0);
		expect(cartItems()).toHaveLength(0);
		clearCart();
	});

	test("removeFromCart removes the item", () => {
		clearCart();
		addToCart(makeProduct("product-1"));
		addToCart(makeProduct("product-2"));
		removeFromCart("product-1");
		expect(cartItems()).toHaveLength(1);
		expect(cartItems()[0].product.id).toBe("product-2");
		clearCart();
	});

	test("clearCart empties the cart", () => {
		clearCart();
		addToCart(makeProduct("product-1"));
		addToCart(makeProduct("product-2"));
		clearCart();
		expect(cartItems()).toHaveLength(0);
	});

	test("cartTotal calculates correctly with multiple items", () => {
		clearCart();
		addToCart(makeProduct("product-1", 15_000));
		addToCart(makeProduct("product-1", 15_000));
		addToCart(makeProduct("product-2", 25_000));
		expect(cartTotal()).toBe(55_000);
		expect(cartCount()).toBe(3);
		clearCart();
	});
});
