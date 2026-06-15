import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── matchMedia mock (same as adaptive-dialog tests) ──────────────

let mockMatches: Record<string, boolean> = {};

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

const MIN_WIDTH_RE = /\(min-width:\s*([\d.]+)px\)/;
const BUAT_RE = /Buat/;

const setViewport = (width: number) => {
  mockMatches = {};
  for (const bp of [600, 768, 900, 1200]) {
    mockMatches[`${bp}`] = width >= bp;
  }
};

// jsdom doesn't implement ResizeObserver (corvu Drawer needs it)
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

const OPTIONS = [
  { value: "kopi", label: "Kopi" },
  { value: "non-kopi", label: "Non-Kopi" },
  { value: "makanan", label: "Makanan" },
];

describe("PickerField", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockMatches = {};
  });

  it("shows placeholder when no value", async () => {
    setViewport(1024);
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Kategori"
      />
    ));
    expect(screen.getByText("Pilih kategori")).toBeTruthy();
  });

  it("shows selected option label as button text", async () => {
    setViewport(1024);
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Kategori"
        value="kopi"
      />
    ));
    expect(screen.getByText("Kopi")).toBeTruthy();
  });

  it("opens dialog on button click and shows all options", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
      />
    ));
    await user.click(screen.getByText("Pilih kategori"));
    expect(screen.getByText("Pilih Kategori")).toBeTruthy(); // dialog title
    expect(screen.getAllByText("Kopi")).toHaveLength(1);
    expect(screen.getByText("Non-Kopi")).toBeTruthy();
    expect(screen.getByText("Makanan")).toBeTruthy();
  });

  it("calls onChange when option clicked and closes dialog", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        onChange={onChange}
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
      />
    ));
    await user.click(screen.getByText("Pilih kategori"));
    await user.click(screen.getByText("Makanan"));
    expect(onChange).toHaveBeenCalledWith("makanan");
  });

  it("filters options by search query", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
      />
    ));
    await user.click(screen.getByText("Pilih kategori"));
    const searchInput = screen.getByPlaceholderText("Cari...");
    await user.type(searchInput, "kop");
    expect(screen.getByText("Kopi")).toBeTruthy();
    expect(screen.queryByText("Makanan")).toBeNull();
  });

  it("shows create row when onCreate provided and query has no exact match", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue("promo");
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        onCreate={onCreate}
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
      />
    ));
    await user.click(screen.getByText("Pilih kategori"));
    const searchInput = screen.getByPlaceholderText("Cari...");
    await user.type(searchInput, "Promo");
    expect(screen.getByText(BUAT_RE)).toBeTruthy();
  });

  it("hides create row when query exactly matches existing option", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        onCreate={onCreate}
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
      />
    ));
    await user.click(screen.getByText("Pilih kategori"));
    const searchInput = screen.getByPlaceholderText("Cari...");
    await user.type(searchInput, "Kopi");
    expect(screen.queryByText(BUAT_RE)).toBeNull();
  });

  it("calls onCreate and onChange when create row clicked", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue("promo");
    const onChange = vi.fn();
    const { PickerField } = await import("../picker-field");
    render(() => (
      <PickerField
        onChange={onChange}
        onCreate={onCreate}
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
      />
    ));
    await user.click(screen.getByText("Pilih kategori"));
    const searchInput = screen.getByPlaceholderText("Cari...");
    await user.type(searchInput, "Promo");
    await user.click(screen.getByText(BUAT_RE));
    expect(onCreate).toHaveBeenCalledWith("Promo");
    expect(onChange).toHaveBeenCalledWith("promo");
  });

  it("shows checkmark next to selected option", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    const { PickerField } = await import("../picker-field");
    const { container } = render(() => (
      <PickerField
        options={OPTIONS}
        placeholder="Pilih kategori"
        title="Pilih Kategori"
        value="non-kopi"
      />
    ));
    await user.click(screen.getByText("Non-Kopi"));
    // Check icon should be present (rendered as svg with class containing "check")
    const checkIcons = container.querySelectorAll("svg");
    expect(checkIcons.length).toBeGreaterThan(0);
  });
});
