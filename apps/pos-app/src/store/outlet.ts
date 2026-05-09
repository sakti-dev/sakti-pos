import { createSignal } from "solid-js";

const [currentOutletId, setCurrentOutletId] = createSignal<string | null>(null);
const [currentMerchantId, setCurrentMerchantId] = createSignal<string | null>(
	null,
);
const [currentRegisterId, setCurrentRegisterId] = createSignal<string | null>(
	null,
);

export {
	currentMerchantId,
	currentOutletId,
	currentRegisterId,
	setCurrentOutletId,
};

export const OUTLET_STORAGE_KEY = "sakti-pos:current-outlet-id";
export const MERCHANT_STORAGE_KEY = "sakti-pos:current-merchant-id";
export const REGISTER_STORAGE_KEY = "sakti-pos:current-register-id";

export function loadOutletContext() {
	const outletId = localStorage.getItem(OUTLET_STORAGE_KEY);
	const merchantId = localStorage.getItem(MERCHANT_STORAGE_KEY);
	const registerId = localStorage.getItem(REGISTER_STORAGE_KEY);
	console.log("[SYNC-DEBUG] loadOutletContext", {
		outletId,
		merchantId,
		registerId,
	});
	if (outletId) setCurrentOutletId(outletId);
	if (merchantId) setCurrentMerchantId(merchantId);
	if (registerId) setCurrentRegisterId(registerId);
}

export function setOutletContext(
	outletId: string,
	merchantId: string,
	registerId?: string,
) {
	setCurrentOutletId(outletId);
	setCurrentMerchantId(merchantId);
	localStorage.setItem(OUTLET_STORAGE_KEY, outletId);
	localStorage.setItem(MERCHANT_STORAGE_KEY, merchantId);
	if (registerId) {
		setCurrentRegisterId(registerId);
		localStorage.setItem(REGISTER_STORAGE_KEY, registerId);
	}
}

export const isDevicePaired = (): boolean => currentOutletId() !== null;

export function clearOutletContext() {
	setCurrentOutletId(null);
	setCurrentMerchantId(null);
	setCurrentRegisterId(null);
	localStorage.removeItem(OUTLET_STORAGE_KEY);
	localStorage.removeItem(MERCHANT_STORAGE_KEY);
	localStorage.removeItem(REGISTER_STORAGE_KEY);
}
