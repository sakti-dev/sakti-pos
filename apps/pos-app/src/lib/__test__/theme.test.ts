import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const STORAGE_KEY = "sakti-pos:theme";
const originalMatchMedia = window.matchMedia;

let mockMediaQuery: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function setupMatchMedia(matches = false) {
  mockMediaQuery = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi
    .fn()
    .mockReturnValue(mockMediaQuery as unknown as MediaQueryList);
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setupMatchMedia(false);
  vi.resetModules();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("theme", () => {
  test("defaults to system theme when no stored value", async () => {
    const { theme } = await import("~/lib/theme");
    expect(theme()).toBe("system");
  });

  test("reads stored theme from localStorage", async () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    const { theme } = await import("~/lib/theme");
    expect(theme()).toBe("dark");
  });

  test("setTheme persists to localStorage", async () => {
    const { setTheme } = await import("~/lib/theme");
    setTheme("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  test("setTheme dark adds dark class", async () => {
    const { setTheme } = await import("~/lib/theme");
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("setTheme light removes dark class", async () => {
    const { setTheme } = await import("~/lib/theme");
    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("setTheme system uses media query for dark", async () => {
    setupMatchMedia(true);
    const { setTheme } = await import("~/lib/theme");
    setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("setTheme system removes dark class when prefers light", async () => {
    const { setTheme } = await import("~/lib/theme");
    setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("registers media query change listener on import", async () => {
    await import("~/lib/theme");
    expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });
});
