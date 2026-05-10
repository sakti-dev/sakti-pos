import { afterEach, describe, expect, test, vi } from "bun:test";
import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";

const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("../../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

const mockValidateSession = vi.fn();
vi.mock("../../lib/auth", () => ({
  narvik: {
    createSession: vi.fn().mockResolvedValue({ token: "session-token-123" }),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
    cookieName: "narvik_session",
    validateSession: (...args: unknown[]) => mockValidateSession(...args),
    createCookie: vi.fn(() => ({ serialize: () => "narvik_session=test" })),
    createBlankCookie: vi.fn(() => ({
      serialize: () => "narvik_session=; Max-Age=0",
    })),
  },
}));

vi.mock("../../lib/oauth", () => ({
  google: {
    createAuthorizationURL: vi.fn(
      () => new URL("https://accounts.google.com/o/oauth2/v2/auth")
    ),
    validateAuthorizationCode: vi.fn(),
  },
  generateState: vi.fn(() => "test-state"),
  generateCodeVerifier: vi.fn(() => "test-verifier"),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    TURSO_DATABASE_URL: "http://127.0.0.1:8080",
    TURSO_AUTH_TOKEN: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    API_URL: "http://localhost:3001",
    NODE_ENV: "development",
  },
}));

const { authRoutes } = await import("../routes");

async function makePasswordHash(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const keyMaterial = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256
  );
  const saltHex = Array.from(salt)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(new Uint8Array(keyMaterial))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

function makeProtoRequest(
  path: string,
  body: Uint8Array,
  options: { cookie?: string; method?: string } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-protobuf",
    Accept: "application/x-protobuf",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  const request = new Request(`http://localhost${path}`, {
    body,
    headers,
    method: options.method ?? "POST",
  });
  const app = authRoutes.compile();
  return app.handle(request);
}

describe("protobuf auth routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("POST /api/auth/login accepts protobuf and returns AuthResponse", async () => {
    const passwordHash = await makePasswordHash("secret");

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              email: "owner@example.com",
              id: "user-1",
              name: "Owner",
              passwordHash,
            },
          ]),
        }),
      }),
    });

    const response = await makeProtoRequest(
      "/api/auth/login",
      AuthLoginRequest.encode({
        email: "owner@example.com",
        password: "secret",
      }).finish()
    );

    expect(response.status).toBe(200);
    const decoded = AuthResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );
    expect(decoded.sessionToken).toBe("session-token-123");
  });
});
