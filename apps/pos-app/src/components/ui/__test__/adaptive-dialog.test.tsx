import { render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── matchMedia mock ──────────────────────────────────────────────
// jsdom doesn't implement matchMedia. We mock it to return controlled
// matches values so we can simulate different viewport widths.

let mockMatches: Record<string, boolean> = {};

// jsdom doesn't implement ResizeObserver (corvu Drawer needs it)
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

const MIN_WIDTH_RE = /\(min-width:\s*([\d.]+)px\)/;

const mockMatchMedia = (query: string): MediaQueryList => {
  const match = query.match(MIN_WIDTH_RE);
  const threshold = match
    ? Number.parseFloat(match[1])
    : Number.POSITIVE_INFINITY;
  const matches = mockMatches[`${threshold}`] ?? false;
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
};

const setViewport = (width: number) => {
  mockMatches = {};
  for (const bp of [600, 768, 900, 1200]) {
    mockMatches[`${bp}`] = width >= bp;
  }
};

// ── Tests ────────────────────────────────────────────────────────

describe("AdaptiveDialog mode detection", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockMatches = {};
  });

  it("renders Drawer (bottom sheet) on mobile (<768px)", async () => {
    setViewport(375);
    const { AdaptiveDialog, AdaptiveDialogTrigger, AdaptiveDialogContent } =
      await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogTrigger>Open</AdaptiveDialogTrigger>
        <AdaptiveDialogContent>
          <p>Content</p>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    const drawerContent = document.querySelector("[data-corvu-drawer-content]");
    expect(drawerContent).not.toBeNull();
  });

  it("renders Dialog (centered) on tablet+ (≥768px)", async () => {
    setViewport(1024);
    const { AdaptiveDialog, AdaptiveDialogTrigger, AdaptiveDialogContent } =
      await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogTrigger>Open</AdaptiveDialogTrigger>
        <AdaptiveDialogContent>
          <p>Content</p>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    const dialogContent = document.querySelector("[data-corvu-dialog-content]");
    const drawerContent = document.querySelector("[data-corvu-drawer-content]");
    expect(dialogContent).not.toBeNull();
    expect(drawerContent).toBeNull();
  });

  it("renders Title and Description in dialog mode", async () => {
    setViewport(1024);
    const {
      AdaptiveDialog,
      AdaptiveDialogContent,
      AdaptiveDialogHeader,
      AdaptiveDialogTitle,
      AdaptiveDialogDescription,
    } = await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>Delete product?</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              This cannot be undone.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    expect(screen.getByText("Delete product?")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("renders Title and Description in sheet mode", async () => {
    setViewport(375);
    const {
      AdaptiveDialog,
      AdaptiveDialogContent,
      AdaptiveDialogHeader,
      AdaptiveDialogTitle,
      AdaptiveDialogDescription,
    } = await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>Delete product?</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              This cannot be undone.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    expect(screen.getByText("Delete product?")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("renders footer buttons in both modes", async () => {
    setViewport(768);
    const { AdaptiveDialog, AdaptiveDialogContent, AdaptiveDialogFooter } =
      await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogContent>
          <AdaptiveDialogFooter>
            <button type="button">Cancel</button>
            <button type="button">Delete</button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });
});
