import { describe, expect, it } from "vitest";

import { toDynamic } from "../converter";
import { calculateCRC16 } from "../crc16";
import { parseQRIS } from "../parser";
import { validateStaticQRIS } from "../validator";

/**
 * Fixtures generated independently (Python CRC16-CCITT reference implementation,
 * check value "123456789" -> 29B1) so these tests do not self-validate.
 */
const STATIC_QRIS =
  "00020101021126440014ID.CO.QRIS.WWW01159360000140000010303UMI5204581253033605802ID5912SAKTI WARUNG6015JAKARTA SELATAN630420A8";

const DYNAMIC_37500 =
  "00020101021226440014ID.CO.QRIS.WWW01159360000140000010303UMI5204581253033605405375005802ID5912SAKTI WARUNG6015JAKARTA SELATAN630451EC";

describe("calculateCRC16", () => {
  it("matches the CRC-16/CCITT-FALSE check vector", () => {
    expect(calculateCRC16("123456789")).toBe("29B1");
  });

  it("matches the static fixture CRC", () => {
    const crcInput = STATIC_QRIS.slice(0, -4);
    expect(calculateCRC16(crcInput)).toBe(STATIC_QRIS.slice(-4));
  });
});

describe("parseQRIS", () => {
  it("parses merchant identity from a static payload", () => {
    const qris = parseQRIS(STATIC_QRIS);
    expect(qris.method).toBe("static");
    expect(qris.merchantName).toBe("SAKTI WARUNG");
    expect(qris.merchantCity).toBe("JAKARTA SELATAN");
    expect(qris.currency).toBe("360");
    expect(qris.amount).toBeUndefined();
  });

  it("parses merchant account info children", () => {
    const qris = parseQRIS(STATIC_QRIS);
    expect(qris.merchantAccountInfo).toHaveLength(1);
    expect(qris.merchantAccountInfo[0].globallyUniqueId).toBe("ID.CO.QRIS.WWW");
    expect(qris.merchantAccountInfo[0].merchantId).toBe("936000014000001");
    expect(qris.merchantAccountInfo[0].merchantCriteria).toBe("UMI");
  });
});

describe("validateStaticQRIS", () => {
  it("accepts a valid static QRIS", () => {
    const result = validateStaticQRIS(STATIC_QRIS);
    expect(result.ok).toBe(true);
  });

  it("rejects a dynamic QRIS with the already-dynamic reason", () => {
    const result = validateStaticQRIS(DYNAMIC_37500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("already-dynamic");
    }
  });

  it("rejects a tampered payload with the invalid-crc reason", () => {
    const tampered = STATIC_QRIS.replace("SAKTI WARUNG", "SAKTI WARUNH");
    const result = validateStaticQRIS(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-crc");
    }
  });

  it("rejects arbitrary text with the not-a-qris reason", () => {
    const result = validateStaticQRIS("https://sakti-pos.example/pay");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not-a-qris");
    }
  });

  it("rejects a payload without the format indicator with bad-format", () => {
    const noFormat = "0102115802ID6304ABCD";
    const result = validateStaticQRIS(noFormat);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("bad-format");
    }
  });
});

describe("toDynamic", () => {
  it("derives the exact reference dynamic payload for 37500", () => {
    expect(toDynamic(STATIC_QRIS, 37_500)).toBe(DYNAMIC_37500);
  });

  it("produces a payload that parses back as dynamic with the amount", () => {
    const dynamic = toDynamic(STATIC_QRIS, 500);
    const parsed = parseQRIS(dynamic);
    expect(parsed.method).toBe("dynamic");
    expect(parsed.amount).toBe("500");
  });

  it("recomputes a verifiable CRC", () => {
    const dynamic = toDynamic(STATIC_QRIS, 12_345);
    expect(calculateCRC16(dynamic.slice(0, -4))).toBe(dynamic.slice(-4));
  });

  it("throws on non-integer or non-positive amounts", () => {
    expect(() => toDynamic(STATIC_QRIS, 3.5)).toThrow();
    expect(() => toDynamic(STATIC_QRIS, 0)).toThrow();
    expect(() => toDynamic(STATIC_QRIS, -100)).toThrow();
  });
});
