import { createSignal } from "solid-js";
import { DEFAULT_BUSINESS_TIMEZONE } from "~/lib/date-time";

const [currentOutletId, setCurrentOutletId] = createSignal<string | null>(null);
const [currentOutletTimezone, setCurrentOutletTimezone] = createSignal<string>(
  DEFAULT_BUSINESS_TIMEZONE
);
const [currentMerchantId, setCurrentMerchantId] = createSignal<string | null>(
  null
);
const [currentRegisterId, setCurrentRegisterId] = createSignal<string | null>(
  null
);

export {
  currentMerchantId,
  currentOutletId,
  currentOutletTimezone,
  currentRegisterId,
  setCurrentOutletId,
  setCurrentOutletTimezone,
};

export const OUTLET_STORAGE_KEY = "sakti-pos:current-outlet-id";
export const OUTLET_TIMEZONE_STORAGE_KEY = "sakti-pos:current-outlet-timezone";
export const MERCHANT_STORAGE_KEY = "sakti-pos:current-merchant-id";
export const REGISTER_STORAGE_KEY = "sakti-pos:current-register-id";

export function loadOutletContext() {
  const outletId = localStorage.getItem(OUTLET_STORAGE_KEY);
  const outletTimezone = localStorage.getItem(OUTLET_TIMEZONE_STORAGE_KEY);
  const merchantId = localStorage.getItem(MERCHANT_STORAGE_KEY);
  const registerId = localStorage.getItem(REGISTER_STORAGE_KEY);
  if (outletId) {
    setCurrentOutletId(outletId);
  }
  if (outletTimezone) {
    setCurrentOutletTimezone(outletTimezone);
  }
  if (merchantId) {
    setCurrentMerchantId(merchantId);
  }
  if (registerId) {
    setCurrentRegisterId(registerId);
  }
}

export function setOutletContext(
  outletId: string,
  merchantId: string,
  registerId?: string,
  timezone = DEFAULT_BUSINESS_TIMEZONE
) {
  setCurrentOutletId(outletId);
  setOutletTimezone(timezone);
  setCurrentMerchantId(merchantId);
  localStorage.setItem(OUTLET_STORAGE_KEY, outletId);
  localStorage.setItem(MERCHANT_STORAGE_KEY, merchantId);
  if (registerId) {
    setCurrentRegisterId(registerId);
    localStorage.setItem(REGISTER_STORAGE_KEY, registerId);
  }
}

export const isDevicePaired = (): boolean => currentOutletId() !== null;

export function setOutletTimezone(timezone: string) {
  setCurrentOutletTimezone(timezone);
  localStorage.setItem(OUTLET_TIMEZONE_STORAGE_KEY, timezone);
}

export function clearOutletContext() {
  setCurrentOutletId(null);
  setCurrentOutletTimezone(DEFAULT_BUSINESS_TIMEZONE);
  setCurrentMerchantId(null);
  setCurrentRegisterId(null);
  localStorage.removeItem(OUTLET_STORAGE_KEY);
  localStorage.removeItem(OUTLET_TIMEZONE_STORAGE_KEY);
  localStorage.removeItem(MERCHANT_STORAGE_KEY);
  localStorage.removeItem(REGISTER_STORAGE_KEY);
}
