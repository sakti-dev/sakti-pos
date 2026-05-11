import type { SessionMerchant } from "@repo/protobuf/auth";
import type {
  ApiUser,
  Merchant,
  Outlet,
  Register,
  Staff,
} from "@repo/protobuf/common";

export function optionalString(value: string | null | undefined): {
  hasValue: boolean;
  value: string;
} {
  return {
    hasValue: value != null,
    value: value ?? "",
  };
}

export function encodeApiUser(row: {
  email: string;
  id: string;
  name: string;
}): ApiUser {
  return {
    email: row.email,
    id: row.id,
    name: row.name,
  };
}

export function encodeMerchant(row: {
  createdAt?: string;
  id: string;
  name: string;
  updatedAt?: string;
}): Merchant {
  return {
    createdAt: row.createdAt ?? "",
    id: row.id,
    name: row.name,
    updatedAt: row.updatedAt ?? "",
  };
}

export function encodeSessionMerchant(row: {
  merchantId: string;
  name: string;
  role: string;
}): SessionMerchant {
  return {
    merchantId: row.merchantId,
    name: row.name,
    role: row.role,
  };
}

export function encodeOutlet(row: {
  address: string | null;
  createdAt?: string;
  id: string;
  isActive: boolean;
  merchantId: string;
  name: string;
  receiptAddress: string | null;
  receiptName: string | null;
  timezone?: string | null;
  updatedAt?: string;
}): Outlet {
  const address = optionalString(row.address);
  const receiptAddress = optionalString(row.receiptAddress);
  const receiptName = optionalString(row.receiptName);
  return {
    address: address.value,
    createdAt: row.createdAt ?? "",
    hasAddress: address.hasValue,
    hasReceiptAddress: receiptAddress.hasValue,
    hasReceiptName: receiptName.hasValue,
    id: row.id,
    isActive: row.isActive,
    merchantId: row.merchantId,
    name: row.name,
    receiptAddress: receiptAddress.value,
    receiptName: receiptName.value,
    timezone: row.timezone ?? "Asia/Jakarta",
    updatedAt: row.updatedAt ?? "",
  };
}

export function encodeRegister(row: {
  createdAt?: string;
  id: string;
  isActive: boolean;
  name: string;
  outletId: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  shortId: string;
  updatedAt?: string;
}): Register {
  const pairingCode = optionalString(row.pairingCode);
  const pairingExpiresAt = optionalString(row.pairingExpiresAt);
  return {
    createdAt: row.createdAt ?? "",
    hasPairingCode: pairingCode.hasValue,
    hasPairingExpiresAt: pairingExpiresAt.hasValue,
    id: row.id,
    isActive: row.isActive,
    name: row.name,
    outletId: row.outletId,
    pairingCode: pairingCode.value,
    pairingExpiresAt: pairingExpiresAt.value,
    shortId: row.shortId,
    updatedAt: row.updatedAt ?? "",
  };
}

export function encodeStaff(row: {
  createdAt?: string;
  id: string;
  isActive: boolean;
  merchantId: string;
  name: string;
  outletId: string | null;
  pin?: string | null;
  role: "cashier" | "manager" | "owner";
  updatedAt?: string;
}): Staff {
  const outletId = optionalString(row.outletId);
  return {
    createdAt: row.createdAt ?? "",
    hasOutletId: outletId.hasValue,
    hasPin: !!row.pin,
    id: row.id,
    isActive: row.isActive,
    merchantId: row.merchantId,
    name: row.name,
    outletId: outletId.value,
    role: row.role,
    updatedAt: row.updatedAt ?? "",
  };
}
