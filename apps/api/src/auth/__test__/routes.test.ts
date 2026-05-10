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

async function makeRequest(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    method?: string;
    query?: Record<string, string>;
  } = {}
) {
  let url = `http://localhost${path}`;
  if (options.query) {
    const params = new URLSearchParams(options.query);
    url = `${url}?${params.toString()}`;
  }

  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { headers, method: options.method ?? "GET" };
  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  const request = new Request(url, init);
  const app = authRoutes.compile();
  const response = await app.handle(request);

  const status = response.status;
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { json, status };
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

    const { status } = await makeRequest("/api/auth/register", {
      method: "POST",
      body: {
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      },
    });

    expect(status).toBe(200);
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

    const { json, status } = await makeRequest("/api/auth/register", {
      method: "POST",
      body: {
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      },
    });

    expect(status).toBe(409);
    expect((json as Record<string, unknown>).error).toBe(
      "Email already registered"
    );
  });

  test("validates password minimum length", async () => {
    const { status } = await makeRequest("/api/auth/register", {
      method: "POST",
      body: { email: "test@example.com", password: "short", name: "Test User" },
    });

    expect(status).toBe(422);
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

    const { json, status } = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: "nonexistent@example.com", password: "password123" },
    });

    expect(status).toBe(401);
    expect((json as Record<string, unknown>).error).toBe(
      "Invalid email or password"
    );
  });
});

describe("GET /api/auth/session", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns null user when no session cookie", async () => {
    const { json, status } = await makeRequest("/api/auth/session");
    expect(status).toBe(200);
    expect((json as Record<string, unknown>).user).toBeNull();
  });

  test("returns user with merchants when session is valid", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    let selectCallCount = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
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

    const { json, status } = await makeRequest("/api/auth/session", {
      cookie: "narvik_session=valid-token",
    });

    expect(status).toBe(200);
    const result = json as Record<string, unknown>;
    expect(result.user).toBeDefined();
    expect(result.merchants).toBeDefined();
  });
});

describe("POST /api/auth/logout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns success even without session", async () => {
    const { json, status } = await makeRequest("/api/auth/logout", {
      method: "POST",
    });
    expect(status).toBe(200);
    expect((json as Record<string, unknown>).success).toBe(true);
  });
});
