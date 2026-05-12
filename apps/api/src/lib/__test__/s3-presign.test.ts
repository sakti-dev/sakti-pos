import { expect, test } from "bun:test";
import { presignS3Url } from "../s3-presign";

const HEX_SIGNATURE_REGEX = /^[0-9a-f]{64}$/;

test("presignS3Url returns a signed S3-compatible upload URL", async () => {
  const url = await presignS3Url({
    accessKeyId: "key",
    bucket: "assets",
    contentType: "image/webp",
    endpoint: "https://example.r2.cloudflarestorage.com",
    method: "PUT",
    objectKey: "merchant-1/assets/asset-1",
    payloadHash: "UNSIGNED-PAYLOAD",
    region: "auto",
    secretAccessKey: "secret",
  });

  const parsed = new URL(url);
  expect(parsed.origin).toBe("https://example.r2.cloudflarestorage.com");
  expect(parsed.pathname).toBe("/assets/merchant-1/assets/asset-1");
  expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe(
    "content-type;host"
  );
  expect(parsed.searchParams.get("X-Amz-Content-Sha256")).toBe(
    "UNSIGNED-PAYLOAD"
  );
  expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(
    HEX_SIGNATURE_REGEX
  );
});
