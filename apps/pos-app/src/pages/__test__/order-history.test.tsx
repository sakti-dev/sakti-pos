import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { DailySummary, OrderItemRow, OrderRow } from "~/db/orders";

const mockOrders: OrderRow[] = [
  {
    amountPaid: 20_000,
    changeAmount: 0,
    createdAt: "2026-05-04T10:00:00.000Z",
    id: "order-1",
    orderNumber: "2026-05-04-001",
    paymentMethod: "cash",
    status: "completed",
    staffId: "staff-1",
    staffName: "Kasir 1",
    total: 20_000,
  },
  {
    amountPaid: 30_000,
    changeAmount: 5000,
    createdAt: "2026-05-04T11:00:00.000Z",
    id: "order-2",
    orderNumber: "2026-05-04-002",
    paymentMethod: "qris",
    status: "cancelled",
    staffId: "staff-2",
    staffName: "Kasir 2",
    total: 25_000,
  },
];

const mockItems: Record<string, OrderItemRow[]> = {
  "order-1": [
    {
      id: "item-1",
      productName: "Kopi Susu",
      quantity: 2,
      subtotal: 20_000,
      unitPrice: 10_000,
    },
  ],
  "order-2": [
    {
      id: "item-2",
      productName: "Nasi Goreng",
      quantity: 1,
      subtotal: 25_000,
      unitPrice: 25_000,
    },
  ],
};

const mockSummary: DailySummary = {
  cashTotal: 20_000,
  orderCount: 2,
  qrisTotal: 0,
  totalRevenue: 20_000,
};

const mockCancelOrder = vi.fn();

vi.mock("~/db/orders", () => ({
  getOrders: vi.fn(() => Promise.resolve(mockOrders)),
  getOrderItems: vi.fn((id: string) => Promise.resolve(mockItems[id] ?? [])),
  getDailySummary: vi.fn(() => Promise.resolve(mockSummary)),
  cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
}));

vi.mock("~/store/auth", () => ({
  currentUserRole: vi.fn(() => "manager"),
}));

vi.mock("~/store/responsive", () => ({
  useIsPhone: () => () => false,
}));

vi.mock("~/components/layout", () => ({
  AppShell: (props: { children: JSX.Element; title: string }) => (
    <div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  ),
}));

vi.mock("~/components/daily-summary", () => ({
  DailySummaryBar: (props: { data: DailySummary | undefined }) => (
    <div data-testid="daily-summary">
      {props.data ? `${props.data.orderCount} pesanan` : "Loading..."}
    </div>
  ),
}));

vi.mock("~/components/order-card", () => ({
  OrderCard: (props: {
    items: OrderItemRow[];
    onCancel?: () => void;
    order: OrderRow;
  }) => (
    <div data-testid="order-card">
      <span>{props.order.orderNumber}</span>
      {props.onCancel && (
        <button data-testid="cancel-btn" onClick={props.onCancel} type="button">
          Batalkan
        </button>
      )}
    </div>
  ),
}));

vi.mock("~/components/confirm-drawer", () => ({
  ConfirmDrawer: (props: {
    open: boolean;
    message: string;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) => (
    <Show when={props.open}>
      <div data-testid="confirm-drawer">
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <button
          data-testid="confirm-btn"
          onClick={props.onConfirm}
          type="button"
        >
          {props.confirmLabel}
        </button>
      </div>
    </Show>
  ),
}));

vi.mock("~/components/ui/select", () => ({
  Select: (props: {
    onChange: (v: unknown) => void;
    options: { label: string; value: string }[];
    value: string;
  }) => (
    <select
      data-testid="status-select"
      onChange={(e) => props.onChange(e.currentTarget.value)}
      value={props.value}
    >
      <For each={props.options}>
        {(opt) => <option value={opt.value}>{opt.label}</option>}
      </For>
    </select>
  ),
}));

vi.mock("~/components/ui/skeleton", () => ({
  Skeleton: (props: { class?: string }) => (
    <div class={props.class} data-testid="skeleton" />
  ),
}));

vi.mock("solid-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import OrderHistory from "../order-history";

describe("OrderHistory", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders title 'Riwayat Pesanan'", async () => {
    render(() => <OrderHistory />);
    expect(await screen.findByText("Riwayat Pesanan")).toBeInTheDocument();
  });

  test("shows DailySummaryBar", async () => {
    render(() => <OrderHistory />);
    await screen.findByText("Riwayat Pesanan");
    expect(screen.getByTestId("daily-summary")).toHaveTextContent("2 pesanan");
  });

  test("shows date filter inputs and status select", async () => {
    render(() => <OrderHistory />);
    await screen.findByText("Riwayat Pesanan");
    expect(screen.getByTestId("status-select")).toBeInTheDocument();
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });

  test("renders order list with OrderCards", async () => {
    render(() => <OrderHistory />);
    await screen.findByText("Riwayat Pesanan");
    expect(screen.getAllByTestId("order-card")).toHaveLength(2);
    expect(screen.getByText("2026-05-04-001")).toBeInTheDocument();
    expect(screen.getByText("2026-05-04-002")).toBeInTheDocument();
  });

  test("shows empty state when no orders", async () => {
    const { getOrders } = await import("~/db/orders");
    vi.mocked(getOrders).mockResolvedValueOnce([]);
    render(() => <OrderHistory />);
    await screen.findByText("Riwayat Pesanan");
    expect(screen.getByText("Belum ada pesanan")).toBeInTheDocument();
  });

  test("shows cancel button for owner role", async () => {
    render(() => <OrderHistory />);
    await screen.findByText("Riwayat Pesanan");
    expect(screen.getAllByTestId("cancel-btn")).toHaveLength(2);
  });

  test("does not show cancel button for cashier role", async () => {
    const { currentUserRole } = await import("~/store/auth");
    vi.mocked(currentUserRole).mockReturnValue("cashier");
    render(() => <OrderHistory />);
    await screen.findByText("Riwayat Pesanan");
    expect(screen.queryByTestId("cancel-btn")).not.toBeInTheDocument();
  });
});
