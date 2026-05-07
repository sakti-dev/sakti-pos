import { createSignal } from "solid-js";

const [currentShopId, setCurrentShopId] = createSignal<string | null>(null);

export { currentShopId, setCurrentShopId };

export const SHOP_STORAGE_KEY = "sakti-pos:current-shop-id";

export function loadShopId() {
	const stored = localStorage.getItem(SHOP_STORAGE_KEY);
	if (stored) setCurrentShopId(stored);
}

export function setShopId(id: string) {
	setCurrentShopId(id);
	localStorage.setItem(SHOP_STORAGE_KEY, id);
}
