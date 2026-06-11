import { afterEach, describe, expect, test, vi } from "bun:test";

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

function makeJsonRequest(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    method?: string;
  } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  const request = new Request(`http://localhost${path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method ?? "POST",
  });
  const app = authRoutes.compile();
  return app.handle(request);
}

describe("POST /api/auth/register", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("registers a new user without role or shopId", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const now = new Date().toISOString();
    const insertedValues: Record<string, unknown>[] = [];
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        insertedValues.push(vals);
        return {
          returning: vi.fn().mockResolvedValue([
            {
              id: vals.id,
              email: vals.email,
              name: vals.name,
              createdAt: now,
              updatedAt: now,
            },
          ]),
        };
      }),
    });

    const response = await makeJsonRequest("/api/auth/register", {
      body: {
        email: "test@example.com",
        name: "Test User",
        password: "password123",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.sessionToken).toBe("session-token-123");
    expect((decoded.user as Record<string, unknown>).email).toBe(
      "test@example.com"
    );
    expect(insertedValues[0]).not.toHaveProperty("role");
    expect(insertedValues[0]).not.toHaveProperty("shopId");
  });

  test("returns 409 when email already registered", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "user-1" }]),
        }),
      }),
    });

    const response = await makeJsonRequest("/api/auth/register", {
      body: {
        email: "test@example.com",
        name: "Test User",
        password: "password123",
      },
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Email already registered"
    );
  });

  test("validates password minimum length", async () => {
    const response = await makeJsonRequest("/api/auth/register", {
      body: {
        email: "test@example.com",
        name: "Test User",
        password: "short",
      },
      method: "POST",
    });

    expect(response.status).toBe(422);
  });
});

describe("POST /api/auth/login", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 for non-existent user", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([undefined]),
        }),
      }),
    });

    const response = await makeJsonRequest("/api/auth/login", {
      body: {
        email: "nonexistent@example.com",
        password: "password123",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>).error).toBe(
      "Invalid email or password"
    );
  });
});

describe("POST /api/auth/session", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns empty session when no session cookie", async () => {
    const response = await makeJsonRequest("/api/auth/session", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.hasUser).toBe(false);
    expect(decoded.user).toBeUndefined();
    expect(decoded.merchants).toEqual([]);
  });

  test("returns user with merchants when session is valid", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    let selectCallCount = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue([
            {
              merchantId: "merchant-1",
              name: "Warung",
              role: "owner",
            },
          ]),
        }),
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return [
                {
                  id: "user-1",
                  email: "test@test.com",
                  name: "Test",
                },
              ];
            }
            return [];
          }),
        }),
      }),
    }));

    const response = await makeJsonRequest("/api/auth/session", {
      cookie: "narvik_session=valid-token",
      method: "POST",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.hasUser).toBe(true);
    expect((decoded.user as Record<string, unknown>).email).toBe(
      "test@test.com"
    );
    expect(decoded.merchants).toBeDefined();
  });
});

describe("POST /api/auth/logout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns success even without session", async () => {
    const response = await makeJsonRequest("/api/auth/logout", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const decoded = (await response.json()) as Record<string, unknown>;
    expect(decoded.success).toBe(true);
  });
});
