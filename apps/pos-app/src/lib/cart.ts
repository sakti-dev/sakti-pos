import { createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { Product } from "~/db/menu";

export interface CartItem {
	product: Product;
	quantity: number;
}

const [items, setItems] = createStore<CartItem[]>([]);

export const cartItems = () => items;

export const cartTotal = createMemo(() =>
	items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
);

export const cartCount = createMemo(() =>
	items.reduce((sum, item) => sum + item.quantity, 0),
);

export function addToCart(product: Product) {
	const index = items.findIndex((i) => i.product.id === product.id);
	if (index === -1) {
		setItems(items.length, { product, quantity: 1 });
	} else {
		setItems(index, "quantity", (q) => q + 1);
	}
}

export function updateQuantity(productId: string, quantity: number) {
	if (quantity <= 0) {
		removeFromCart(productId);
		return;
	}
	const index = items.findIndex((i) => i.product.id === productId);
	if (index !== -1) {
		setItems(index, { quantity });
	}
}

export function removeFromCart(productId: string) {
	setItems(
		produce((current) => {
			const index = current.findIndex((i) => i.product.id === productId);
			if (index !== -1) {
				current.splice(index, 1);
			}
		}),
	);
}

export function clearCart() {
	setItems([]);
}
