import type { RegionTimezone } from "~/lib/data/regions";

export type BusinessType = "f&b" | "retail";

/**
 * Onboarding wizard form state.
 *
 * Step 1 → merchant_name, business_type
 * Step 2 → outlet_name, outlet_phone, subdistrict_id, raw_street_address, timezone
 * Step 3 → use_tax, tax_percentage, initial_cash
 *
 * Mirrors the single backend onboarding payload (see
 * `apps/pos-app/src/pages/onboarding/index.tsx` → submit). When the sync
 * backend lands, this is the contract the controller wraps in one
 * transaction: merchants → outlets → session context.
 */
export interface OnboardingForm {
  business_type: BusinessType;
  initial_cash: number;
  // Step 1 — Merchant
  merchant_name: string;
  // Step 2 — First outlet (SaaS-optimized: one outlet seeds the merchant)
  outlet_name: string;
  outlet_phone: string;
  raw_street_address: string;
  subdistrict_id: string;
  tax_percentage: number;
  timezone: RegionTimezone;
  // Step 3 — Quick preferences
  use_tax: boolean;
}

export const INITIAL_ONBOARDING_FORM: OnboardingForm = {
  merchant_name: "",
  business_type: "f&b",
  outlet_name: "Pusat",
  outlet_phone: "",
  subdistrict_id: "",
  raw_street_address: "",
  timezone: "Asia/Jakarta",
  use_tax: false,
  tax_percentage: 11,
  initial_cash: 0,
};

export const ONBOARDING_STEPS = ["merchant", "outlet", "preferences"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
