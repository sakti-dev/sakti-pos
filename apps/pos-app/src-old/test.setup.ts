import "@testing-library/jest-dom/vitest";
import { createResource } from "solid-js";
import { vi } from "vitest";

globalThis.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  disconnect() {}
  observe() {}
  unobserve() {}
};

vi.mock("~/lib/use-drizzle-query", () => ({
  useDrizzleQuery: vi.fn(
    (
      keyOrSource: unknown[] | (() => unknown),
      buildQuery: () => Promise<unknown>
    ) => {
      const sourceKey =
        typeof keyOrSource === "function" ? keyOrSource : () => keyOrSource;

      const [data, { refetch }] = createResource(sourceKey, async () =>
        buildQuery()
      );

      return {
        data,
        loading: () => data.loading,
        error: () => data.error,
        refetch,
      };
    }
  ),
  setSyncDataVersion: vi.fn(),
}));
