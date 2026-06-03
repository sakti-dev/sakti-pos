import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../storage", () => ({
  AuthStorage: {
    getToken: vi.fn(() => Promise.resolve(null)),
    saveToken: vi.fn(() => Promise.resolve()),
    clearToken: vi.fn(() => Promise.resolve()),
  },
}));

const originalFetch = globalThis.fetch;

describe("isCloudAuthenticated", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  test("returns false when no token stored", async () => {
    const { isCloudAuthenticated } = await import("../cloud");
    expect(await isCloudAuthenticated()).toBe(false);
  });

  test("returns true when token exists", async () => {
    const { AuthStorage } = await import("../storage");
    (AuthStorage.getToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "test-token"
    );
    const { isCloudAuthenticated } = await import("../cloud");
    expect(await isCloudAuthenticated()).toBe(true);
  });

  test("getCurrentCloudStaff posts to staff me endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            claimed: false,
            hasStaff: true,
            reason: "",
            staff: {
              createdAt: "2026-05-10T00:00:00.000Z",
              hasOutletId: true,
              hasPin: true,
              id: "staff-1",
              isActive: true,
              merchantId: "merchant-1",
              name: "Owner",
              outletId: "outlet-1",
              role: "owner",
              updatedAt: "2026-05-10T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getCurrentCloudStaff } = await import("../cloud");
    const result = await getCurrentCloudStaff("merchant-1");

    expect(result.staff?.id).toBe("staff-1");
  });

  test("getOutlets maps timezone from the API response", async () => {
    vi.resetModules();

    const mockOutletList = vi.fn().mockResolvedValue({
      data: {
        outlets: [
          {
            address: "Jl. Merdeka",
            hasAddress: true,
            hasReceiptAddress: true,
            hasReceiptName: true,
            id: "outlet-1",
            isActive: true,
            merchantId: "merchant-1",
            name: "Main",
            receiptAddress: "Jl. Merdeka",
            receiptName: "Warung",
            timezone: "Asia/Makassar",
          },
        ],
      },
      error: null,
    });

    vi.doMock("~/lib/api/eden", () => ({
      eden: {
        api: {
          outlets: {
            list: { post: mockOutletList },
          },
        },
      },
    }));

    const { getOutlets } = await import("../cloud");
    const outlets = await getOutlets("merchant-1");

    expect(outlets).toEqual([
      {
        address: "Jl. Merdeka",
        hasAddress: true,
        hasReceiptAddress: true,
        hasReceiptName: true,
        id: "outlet-1",
        isActive: true,
        merchantId: "merchant-1",
        name: "Main",
        receiptAddress: "Jl. Merdeka",
        receiptName: "Warung",
        timezone: "Asia/Makassar",
      },
    ]);

    vi.doUnmock("~/lib/api/eden");
  });

  test("createOutlet defaults timezone to Asia/Jakarta", async () => {
    vi.resetModules();

    const mockOutletCreate = vi.fn().mockResolvedValue({
      data: {
        hasRegister: false,
        outlet: {
          address: "",
          hasAddress: false,
          hasReceiptAddress: true,
          hasReceiptName: true,
          id: "outlet-1",
          isActive: true,
          merchantId: "merchant-1",
          name: "Main",
          receiptAddress: "Jl. Merdeka",
          receiptName: "Warung",
          timezone: "Asia/Jakarta",
        },
        register: undefined,
      },
      error: null,
    });

    vi.doMock("~/lib/api/eden", () => ({
      eden: {
        api: {
          outlets: {
            create: { post: mockOutletCreate },
          },
        },
      },
    }));

    const { createOutlet } = await import("../cloud");
    const outlet = await createOutlet("merchant-1", "Main");

    expect(mockOutletCreate).toHaveBeenCalledWith({
      address: "",
      merchantId: "merchant-1",
      name: "Main",
      timezone: "Asia/Jakarta",
    });
    expect(outlet.timezone).toBe("Asia/Jakarta");
    expect(outlet.receiptName).toBe("Warung");
    expect(outlet.receiptAddress).toBe("Jl. Merdeka");

    vi.doUnmock("~/lib/api/eden");
  });
});
