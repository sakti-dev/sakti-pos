/**
 * QRIS payload validation for accepting a merchant's static QRIS.
 *
 * Validation rules derived from the EMVCo QR Code Specification subset used
 * by QRIS, cross-checked against verssache/qris-dinamis (MIT, (c) 2020).
 */

import { calculateCRC16 } from "./crc16";
import { parseTLV } from "./parser";

export type QRISValidationRejection =
  | "not-a-qris"
  | "bad-format"
  | "invalid-crc"
  | "already-dynamic";

export type QRISValidationResult =
  | { readonly ok: true; readonly payload: string }
  | {
      readonly ok: false;
      readonly reason: QRISValidationRejection;
      readonly payload: string;
    };

/**
 * Validate that a decoded string is a structurally sound STATIC QRIS payload
 * that we can derive dynamic QRIS from.
 *
 * Gates: TLV parses fully (every byte consumed), tag 00 = "01", tag 01 = "11"
 * (static), and the CRC16 (tag 63) verifies.
 */
export function validateStaticQRIS(payload: string): QRISValidationResult {
  const trimmed = payload.trim();

  if (trimmed.length < 20) {
    return { ok: false, reason: "not-a-qris", payload: trimmed };
  }

  const elements = parseTLV(trimmed);
  const consumed = elements.reduce((sum, el) => sum + 4 + el.length, 0);
  if (elements.length === 0 || consumed !== trimmed.length) {
    return { ok: false, reason: "not-a-qris", payload: trimmed };
  }

  const find = (tag: string) => elements.find((el) => el.tag === tag);

  const format = find("00");
  if (!format || format.value !== "01") {
    return { ok: false, reason: "bad-format", payload: trimmed };
  }

  const initiation = find("01");
  if (!initiation || (initiation.value !== "11" && initiation.value !== "12")) {
    return { ok: false, reason: "bad-format", payload: trimmed };
  }
  if (initiation.value === "12") {
    return { ok: false, reason: "already-dynamic", payload: trimmed };
  }

  const crc = find("63");
  const crcInput = trimmed.slice(0, trimmed.length - 4);
  if (!crc || crc.value !== calculateCRC16(crcInput)) {
    return { ok: false, reason: "invalid-crc", payload: trimmed };
  }

  return { ok: true, payload: trimmed };
}

export function isStaticQRIS(payload: string): boolean {
  return validateStaticQRIS(payload).ok;
}
