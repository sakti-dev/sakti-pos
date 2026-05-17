type S3PresignMethod = "GET" | "PUT";

export interface S3PresignInput {
  accessKeyId: string;
  bucket: string;
  contentType?: string;
  endpoint: string;
  expiresInSeconds?: number;
  method: S3PresignMethod;
  objectKey: string;
  payloadHash?: string;
  region: string;
  secretAccessKey: string;
}

const textEncoder = new TextEncoder();

function awsEncode(value: string): string {
  return encodeURIComponent(value)
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const buffer =
    typeof input === "string"
      ? textEncoder.encode(input)
      : toBufferSource(input);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return toHex(new Uint8Array(hash));
}

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toBufferSource(key),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    textEncoder.encode(data)
  );
  return new Uint8Array(signature);
}

async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string
): Promise<Uint8Array> {
  const kDate = await hmacSha256(
    textEncoder.encode(`AWS4${secretAccessKey}`),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  return await hmacSha256(kService, "aws4_request");
}

function getIsoTimestamps(now = new Date()): {
  amzDate: string;
  dateStamp: string;
} {
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  const second = String(now.getUTCSeconds()).padStart(2, "0");
  return {
    amzDate: `${year}${month}${day}T${hour}${minute}${second}Z`,
    dateStamp: `${year}${month}${day}`,
  };
}

function getHost(endpoint: string): string {
  return new URL(endpoint).host;
}

function getCanonicalUri(bucket: string, objectKey: string): string {
  const encodedObjectKey = objectKey
    .split("/")
    .map((segment) => awsEncode(segment))
    .join("/");
  return `/${awsEncode(bucket)}/${encodedObjectKey}`;
}

function buildCanonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
}

export async function presignS3Url(input: S3PresignInput): Promise<string> {
  const expiresInSeconds = input.expiresInSeconds ?? 900;
  const { amzDate, dateStamp } = getIsoTimestamps();
  const host = getHost(input.endpoint);
  const canonicalUri = getCanonicalUri(input.bucket, input.objectKey);
  const signedHeaders = [
    ...(input.contentType ? ["content-type"] : []),
    "host",
  ].join(";");
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  if (input.payloadHash) {
    queryParams["X-Amz-Content-Sha256"] = input.payloadHash;
  }
  const canonicalQueryString = buildCanonicalQuery(queryParams);
  const canonicalHeaders = [
    ...(input.contentType ? [`content-type:${input.contentType}`] : []),
    `host:${host}`,
  ].join("\n");
  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQueryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = await deriveSigningKey(
    input.secretAccessKey,
    dateStamp,
    input.region
  );
  const signature = await hmacSha256(signingKey, stringToSign);
  const url = new URL(input.endpoint);
  url.pathname = canonicalUri;
  url.search = `${canonicalQueryString}&X-Amz-Signature=${toHex(signature)}`;
  return url.toString();
}

export async function presignS3DownloadUrl(
  input: Omit<S3PresignInput, "method">
): Promise<string> {
  return await presignS3Url({ ...input, method: "GET" });
}
