/**
 * EMVCo QRIS TLV parser.
 *
 * Ported from verssache/qris-dinamis (MIT License, (c) 2020) with modifications:
 * stricter input validation and a reduced, QRIS-relevant surface.
 */

export interface TLV {
  readonly children?: readonly TLV[];
  readonly length: number;
  readonly name: string;
  readonly tag: string;
  readonly value: string;
}

const TAG_NAMES: Record<string, string> = {
  "00": "Payload Format Indicator",
  "01": "Point of Initiation Method",
  "26": "Merchant Account Information",
  "27": "Merchant Account Information",
  "28": "Merchant Account Information",
  "29": "Merchant Account Information",
  "30": "Merchant Account Information",
  "31": "Merchant Account Information",
  "32": "Merchant Account Information",
  "33": "Merchant Account Information",
  "34": "Merchant Account Information",
  "35": "Merchant Account Information",
  "36": "Merchant Account Information",
  "37": "Merchant Account Information",
  "38": "Merchant Account Information",
  "39": "Merchant Account Information",
  "40": "Merchant Account Information",
  "41": "Merchant Account Information",
  "42": "Merchant Account Information",
  "43": "Merchant Account Information",
  "44": "Merchant Account Information",
  "45": "Merchant Account Information",
  "46": "Merchant Account Information",
  "47": "Merchant Account Information",
  "48": "Merchant Account Information",
  "49": "Merchant Account Information",
  "50": "Merchant Account Information",
  "51": "Merchant Account Information",
  "52": "Merchant Category Code",
  "53": "Transaction Currency",
  "54": "Transaction Amount",
  "55": "Tip or Convenience Indicator",
  "56": "Value of Convenience Fee (Fixed)",
  "57": "Value of Convenience Fee (%)",
  "58": "Country Code",
  "59": "Merchant Name",
  "60": "Merchant City",
  "61": "Postal Code",
  "62": "Additional Data Field",
  "63": "CRC",
};

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

export function parseTLV(data: string): TLV[] {
  const elements: TLV[] = [];
  let pos = 0;

  while (pos < data.length) {
    if (pos + 4 > data.length) {
      break;
    }

    const tag = data.slice(pos, pos + 2);
    const length = Number.parseInt(data.slice(pos + 2, pos + 4), 10);

    if (Number.isNaN(length) || pos + 4 + length > data.length) {
      break;
    }

    const value = data.slice(pos + 4, pos + 4 + length);
    const name = TAG_NAMES[tag] ?? `Unknown (${tag})`;

    const element: TLV = NESTED_TAGS.has(tag)
      ? { tag, name, length, value, children: parseTLV(value) }
      : { tag, name, length, value };

    elements.push(element);
    pos += 4 + length;
  }

  return elements;
}

export interface MerchantAccountInfo {
  readonly globallyUniqueId: string;
  readonly merchantCriteria: string | undefined;
  readonly merchantId: string | undefined;
  readonly tag: string;
}

export interface QRISData {
  readonly amount: string | undefined;
  readonly countryCode: string;
  readonly crc: string;
  readonly currency: string;
  readonly elements: readonly TLV[];
  readonly formatIndicator: string;
  readonly merchantAccountInfo: readonly MerchantAccountInfo[];
  readonly merchantCategoryCode: string;
  readonly merchantCity: string;
  readonly merchantName: string;
  readonly method: "static" | "dynamic";
}

export function parseQRIS(qrisString: string): QRISData {
  const raw = parseTLV(qrisString);

  const findTag = (tag: string) => raw.find((t) => t.tag === tag);

  const merchantAccountInfo = raw
    .filter((t) => {
      const tagNum = Number.parseInt(t.tag, 10);
      return tagNum >= 26 && tagNum <= 51 && t.children;
    })
    .map((t) => {
      const children = t.children ?? [];
      const findChild = (childTag: string) =>
        children.find((c) => c.tag === childTag);

      return {
        tag: t.tag,
        globallyUniqueId: findChild("00")?.value ?? "",
        merchantId: findChild("01")?.value ?? findChild("02")?.value,
        merchantCriteria: findChild("03")?.value,
      };
    });

  return {
    formatIndicator: findTag("00")?.value ?? "01",
    method: findTag("01")?.value === "12" ? "dynamic" : "static",
    merchantAccountInfo,
    merchantCategoryCode: findTag("52")?.value ?? "",
    currency: findTag("53")?.value ?? "360",
    amount: findTag("54")?.value,
    countryCode: findTag("58")?.value ?? "ID",
    merchantName: findTag("59")?.value ?? "",
    merchantCity: findTag("60")?.value ?? "",
    crc: findTag("63")?.value ?? "",
    elements: raw,
  };
}
