/**
 * Static → Dynamic QRIS converter.
 *
 * Ported from verssache/qris-dinamis (MIT License, (c) 2020) with modifications:
 * amount-only conversion (no tip/fee tags 55-57), integer IDR amounts, and
 * validation-first usage.
 */

import { calculateCRC16 } from "./crc16";
import type { TLV } from "./parser";
import { parseTLV } from "./parser";

function buildTLVString(elements: readonly TLV[]): string {
  return elements
    .map((el) => {
      const value = el.children ? buildTLVString(el.children) : el.value;
      const length = value.length.toString().padStart(2, "0");
      return `${el.tag}${length}${value}`;
    })
    .join("");
}

function makeTLV(tag: string, value: string, name: string): TLV {
  return { tag, name, length: value.length, value };
}

/**
 * Derive a dynamic QRIS from a validated static QRIS payload:
 * tag 01 "11"→"12", inject tag 54 (amount) before tag 58, recompute CRC16.
 * Amount is a whole number of IDR (no decimals).
 */
export function toDynamic(qrisString: string, amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `toDynamic: amount must be a positive integer, got ${amount}`
    );
  }

  const elements = parseTLV(qrisString);

  const result: TLV[] = [];
  let amountInserted = false;
  const managedTags = new Set(["54", "55", "56", "57", "63"]);

  for (const el of elements) {
    if (managedTags.has(el.tag)) {
      continue;
    }

    if (el.tag === "01") {
      result.push(makeTLV("01", "12", "Point of Initiation Method"));
      continue;
    }

    if (el.tag === "58" && !amountInserted) {
      result.push(makeTLV("54", amount.toString(), "Transaction Amount"));
      amountInserted = true;
    }

    result.push(el);
  }

  if (!amountInserted) {
    // No tag 58 in a malformed payload should never happen post-validation;
    // append the amount at the end (before CRC) as a safe fallback.
    result.push(makeTLV("54", amount.toString(), "Transaction Amount"));
  }

  const withoutCRC = buildTLVString(result);
  const crcInput = `${withoutCRC}6304`;
  const crc = calculateCRC16(crcInput);

  return `${crcInput}${crc}`;
}
