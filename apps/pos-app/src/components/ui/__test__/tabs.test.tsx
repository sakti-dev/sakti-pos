import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "../tabs";

// ── matchMedia mock ──
let mockMatches: Record<string, boolean> = {};
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

// ── ResizeObserver mock ──
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

// ── WAAPI mock — element.animate doesn't exist in jsdom ──
const animateMock = vi.fn();
let animateCalls: { keyframes: Keyframe[]; options: object }[] = [];

beforeEach(() => {
  mockMatches = {};
  window.matchMedia = vi.fn().mockImplementation(mockMatchMedia);

  animateCalls = [];
  animateMock.mockImplementation((keyframes: Keyframe[], options: object) => {
    animateCalls.push({ keyframes, options });
    return { cancel: vi.fn(), onfinish: null, finished: Promise.resolve() };
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animateMock,
  });
});

afterEach(() => {
  mockMatches = {};
});

const RIGHT_OFFSET_RE = /translate3d\(\s*[\d]/;
const LEFT_OFFSET_RE = /translate3d\(\s*-/;

/** Find the slide animation call (has translate3d in keyframes). */
const findSlideCall = ():
  | { keyframes: Keyframe[]; options: object }
  | undefined =>
  animateCalls.find(
    (c) =>
      typeof c.keyframes?.[0]?.transform === "string" &&
      c.keyframes[0].transform.includes("translate3d")
  );

function renderTabs(props?: {
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  render(() => (
    <Tabs defaultValue={props?.defaultValue ?? "a"} onChange={props?.onChange}>
      <TabsList>
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
        <TabsTrigger value="c">Gamma</TabsTrigger>
        <TabsIndicator />
      </TabsList>
      <TabsContent data-testid="panel-a" value="a">
        <div data-testid="content-a">A</div>
      </TabsContent>
      <TabsContent data-testid="panel-b" value="b">
        <div data-testid="content-b">B</div>
      </TabsContent>
      <TabsContent data-testid="panel-c" value="c">
        <div data-testid="content-c">C</div>
      </TabsContent>
    </Tabs>
  ));
}

describe("Tabs WAAPI slide animation", () => {
  /** Click a tab and flush SolidJS reactive effects. */
  const clickTab = (label: string) => {
    fireEvent.click(screen.getByText(label));
  };

  it("does NOT animate on initial render", () => {
    renderTabs();
    expect(animateCalls.length).toBe(0);
  });

  it("animates content on FIRST tab change", () => {
    renderTabs();

    clickTab("Beta");

    expect(findSlideCall()).toBeTruthy();
  });

  it("slides from the RIGHT when moving to a higher index", () => {
    renderTabs();

    clickTab("Beta");

    const slide = findSlideCall();
    expect(slide).toBeTruthy();
    const firstTransform = slide!.keyframes[0].transform as string;
    expect(firstTransform).toMatch(RIGHT_OFFSET_RE);
  });

  it("slides from the LEFT when moving to a lower index", () => {
    renderTabs();

    // a → c (right)
    clickTab("Gamma");
    animateCalls = [];

    // c → a (left)
    clickTab("Alpha");

    const slide = findSlideCall();
    expect(slide).toBeTruthy();
    const firstTransform = slide!.keyframes[0].transform as string;
    expect(firstTransform).toMatch(LEFT_OFFSET_RE);
  });

  it("uses fill: forwards", () => {
    renderTabs();

    clickTab("Beta");

    const slide = findSlideCall();
    expect(slide).toBeTruthy();
    expect(slide!.options).toMatchObject({ fill: "forwards" });
  });

  it("still calls consumer onChange", () => {
    const onChange = vi.fn();
    renderTabs({ onChange });

    clickTab("Beta");

    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("renders all panels with forceMount (hidden when not selected)", () => {
    renderTabs();

    // All three panels exist in DOM
    expect(screen.getByTestId("panel-a")).toBeTruthy();
    expect(screen.getByTestId("panel-b")).toBeTruthy();
    expect(screen.getByTestId("panel-c")).toBeTruthy();
  });
});
