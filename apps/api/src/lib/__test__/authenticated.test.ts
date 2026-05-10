import { afterEach, describe, expect, test, vi } from "bun:test";
import { Elysia } from "elysia";

const mockValidateSession = vi.fn();

vi.mock("../auth", () => ({
  narvik: {
    cookieName: "narvik_session",
    validateSession: (...args: unknown[]) => mockValidateSession(...args),
  },
}));

const { authenticated } = await import("../authenticated");

async function requestProtected(cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers.cookie = cookie;
  }

  const app = new Elysia()
    .use(authenticated)
    .get("/protected", ({ session }) => ({ userId: session.userId }))
    .compile();

  const response = await app.handle(
    new Request("http://localhost/protected", { headers })
  );
  const text = await response.text();
  const json = JSON.parse(text);
  return { json, status: response.status };
}

describe("authenticated guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 before the handler when no session exists", async () => {
    mockValidateSession.mockResolvedValue(null);

    const { json, status } = await requestProtected();

    expect(status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  test("adds session to guarded route context", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    const { json, status } = await requestProtected(
      "narvik_session=valid-token"
    );

    expect(status).toBe(200);
    expect(json).toEqual({ userId: "user-1" });
  });
});
