import { describe, expect, test } from "vitest";
import { base64ToUint8Array } from "~/lib/assets/utils";

describe("asset utils", () => {
  test("base64ToUint8Array decodes base64 payloads", () => {
    const bytes = base64ToUint8Array("SGVsbG8=");
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });
});
