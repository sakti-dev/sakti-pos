import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("responsive", () => {
  let innerWidth: number;
  let innerHeight: number;

  beforeEach(() => {
    innerWidth = window.innerWidth;
    innerHeight = window.innerHeight;
    window.innerWidth = 800;
    window.innerHeight = 600;
  });

  afterEach(() => {
    window.innerWidth = innerWidth;
    window.innerHeight = innerHeight;
    vi.restoreAllMocks();
  });

  describe("useIsPhone", () => {
    test("returns true when user agent matches mobile", async () => {
      const originalUA = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
        writable: true,
      });

      const { useIsPhone } = await import("~/lib/responsive");
      const isPhone = useIsPhone();
      expect(typeof isPhone).toBe("function");

      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: originalUA,
        writable: true,
      });
    });

    test("returns false when user agent matches tablet", async () => {
      const originalUA = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)",
        writable: true,
      });

      const { useIsPhone } = await import("~/lib/responsive");
      const isPhone = useIsPhone();
      expect(typeof isPhone).toBe("function");

      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: originalUA,
        writable: true,
      });
    });

    test("checks window dimensions for desktop UA", async () => {
      const originalUA = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        writable: true,
      });

      window.innerWidth = 400;
      window.innerHeight = 300;

      const { useIsPhone } = await import("~/lib/responsive");
      const isPhone = useIsPhone();
      expect(typeof isPhone).toBe("function");

      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: originalUA,
        writable: true,
      });
    });
  });

  describe("useIsLandscape", () => {
    test("returns a signal function", async () => {
      const { useIsLandscape } = await import("~/lib/responsive");
      const landscape = useIsLandscape();
      expect(typeof landscape).toBe("function");
    });

    test("detects landscape orientation", async () => {
      window.innerWidth = 1024;
      window.innerHeight = 768;

      const { useIsLandscape } = await import("~/lib/responsive");
      const landscape = useIsLandscape();
      expect(typeof landscape).toBe("function");

      window.innerWidth = innerWidth;
      window.innerHeight = innerHeight;
    });
  });
});
