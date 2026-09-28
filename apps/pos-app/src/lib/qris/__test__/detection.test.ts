import { describe, expect, it, vi } from "vitest";
import {
  appIcons,
  evaluateEvents,
  type eventKey,
  getNativeMonitoredPackages,
  hydrateAppIcons,
  isNotificationAccessGranted,
  listInstalledApps,
  mergeEvents,
  newestMatch,
} from "~/lib/qris/detection";

const invokeMock = vi.fn((command: string): unknown => {
  switch (command) {
    case "qris_get_installed_apps":
      return [
        { packageName: "com.b.second", appName: "Second Bank" },
        { packageName: "com.a.first", appName: "A Bank" },
      ];
    case "qris_get_allowed_packages":
      return ["com.a.first"];
    case "qris_get_app_icon":
      return "data:image/webp;base64,AAA";
    case "qris_get_recent_events":
      return [];
    case "qris_is_notification_access_granted":
      return true;
    default:
      return null;
  }
});

vi.mock("@tauri-apps/api/core", () => ({
  addPluginListener: vi.fn(async () => () => undefined),
  invoke: (command: string) => invokeMock(command),
}));

vi.mock("~/lib/utils", () => ({
  createLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const event = (overrides: Partial<Parameters<typeof eventKey>[0]> = {}) => ({
  packageName: "com.example.bank",
  appLabel: "Example Bank",
  amountRupiah: 15_000,
  rawText: "Dana masuk Rp15.000",
  postTimeMillis: 1_700_000_000_000,
  ...overrides,
});

describe("evaluateEvents", () => {
  const anchor = 1_700_000_000_000;

  it("marks an exact-amount event inside the session as a match", () => {
    const result = evaluateEvents(
      [event({ postTimeMillis: anchor + 1000 })],
      15_000,
      anchor
    );
    expect(result[0]?.status).toBe("match");
  });

  it("marks a different amount as mismatch", () => {
    const result = evaluateEvents(
      [event({ amountRupiah: 14_000 })],
      15_000,
      anchor
    );
    expect(result[0]?.status).toBe("mismatch");
  });

  it("marks an exact-amount event before the session anchor as stale", () => {
    const result = evaluateEvents(
      [event({ postTimeMillis: anchor - 60_000 })],
      15_000,
      anchor
    );
    expect(result[0]?.status).toBe("stale");
  });

  it("treats a null anchor as never matching (no session)", () => {
    const result = evaluateEvents([event()], 15_000, null);
    expect(result[0]?.status).toBe("stale");
  });
});

describe("command wire shapes", () => {
  it("unwraps the bare array from qris_get_installed_apps and sorts by name", async () => {
    const apps = await listInstalledApps();
    expect(apps.map((app) => app.appName)).toEqual(["A Bank", "Second Bank"]);
  });

  it("returns the bare array from qris_get_allowed_packages", async () => {
    expect(await getNativeMonitoredPackages()).toEqual(["com.a.first"]);
  });

  it("returns the bare boolean from qris_is_notification_access_granted", async () => {
    expect(await isNotificationAccessGranted()).toBe(true);
  });

  it("hydrates icons progressively and caches them", async () => {
    await hydrateAppIcons([
      { appName: "A Bank", packageName: "com.a.first" },
      { appName: "Second Bank", packageName: "com.b.second" },
    ]);
    expect(appIcons().get("com.a.first")).toBe("data:image/webp;base64,AAA");
    expect(appIcons().get("com.b.second")).toBe("data:image/webp;base64,AAA");
  });
});

describe("mergeEvents", () => {
  it("dedupes by package, postTime, and amount", () => {
    const first = event();
    const duplicate = event({ rawText: "updated text" });
    const merged = mergeEvents([first], [duplicate]);
    expect(merged).toHaveLength(1);
  });

  it("sorts by post time ascending", () => {
    const older = event({ postTimeMillis: 1, rawText: "a" });
    const newer = event({ postTimeMillis: 2, rawText: "b" });
    const merged = mergeEvents([newer], [older]);
    expect(merged.map((e) => e.rawText)).toEqual(["a", "b"]);
  });
});

describe("newestMatch", () => {
  it("prefers the newest matching event", () => {
    const matches = evaluateEvents(
      [
        event({ postTimeMillis: 10 }),
        event({ postTimeMillis: 20 }),
        event({ postTimeMillis: 30, amountRupiah: 999 }),
      ],
      15_000,
      0
    );
    const newest = newestMatch(matches);
    expect(newest?.event.postTimeMillis).toBe(20);
  });

  it("returns null when nothing matches", () => {
    const matches = evaluateEvents([event({ amountRupiah: 1 })], 15_000, 0);
    expect(newestMatch(matches)).toBeNull();
  });
});
