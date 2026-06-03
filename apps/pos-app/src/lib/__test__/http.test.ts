import { afterEach, describe, expect, test, vi } from "vitest";

const mockGetToken = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: mockGetToken,
  },
}));

describe("api client", () => {
  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("adds the bearer token when available", async () => {
    mockGetToken.mockResolvedValueOnce("test-token");
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { api } = await import("../http");

    await api.get("api/test").json<{ ok: boolean }>();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request] = fetchMock.mock.calls[0] as unknown as [
      Request,
      RequestInit?,
    ];
    expect(request.headers.get("authorization")).toBe("Bearer test-token");
  });

  test("does not add an authorization header when no token exists", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { api } = await import("../http");

    await api.get("api/test").json<{ ok: boolean }>();

    const [request] = fetchMock.mock.calls[0] as unknown as [
      Request,
      RequestInit?,
    ];
    expect(request.headers.get("authorization")).toBeNull();
  });
});
