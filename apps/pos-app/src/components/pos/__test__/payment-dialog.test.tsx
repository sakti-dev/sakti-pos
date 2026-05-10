import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { PaymentDialog } from "../payment-dialog";

vi.mock("~/store/cart", () => ({
  cartItems: () => [],
  cartTotal: () => 20_000,
}));

const user = userEvent.setup();

describe("PaymentDialog", () => {
  test("does not render when open is false", () => {
    render(() => (
      <PaymentDialog onClose={() => {}} onConfirm={() => {}} open={false} />
    ));
    expect(screen.queryByText("Pembayaran")).not.toBeInTheDocument();
  });

  test("shows total and payment method buttons when open", () => {
    render(() => (
      <PaymentDialog onClose={() => {}} onConfirm={() => {}} open={true} />
    ));
    expect(screen.getByText("Pembayaran")).toBeInTheDocument();
    expect(screen.getByText("Tunai")).toBeInTheDocument();
    expect(screen.getByText("QRIS")).toBeInTheDocument();
  });

  test("calls onConfirm with cash payment data when confirmed with sufficient amount", async () => {
    const onConfirm = vi.fn();
    render(() => (
      <PaymentDialog onClose={() => {}} onConfirm={onConfirm} open={true} />
    ));

    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));

    await user.click(screen.getByText("Konfirmasi"));

    expect(onConfirm).toHaveBeenCalledWith({
      amountPaid: 30_000,
      changeAmount: 10_000,
      paymentMethod: "cash",
    });
  });

  test("calls onConfirm with qris payment data", async () => {
    const onConfirm = vi.fn();
    render(() => (
      <PaymentDialog onClose={() => {}} onConfirm={onConfirm} open={true} />
    ));

    await user.click(screen.getByText("QRIS"));
    await user.click(screen.getByText("Konfirmasi"));

    expect(onConfirm).toHaveBeenCalledWith({
      amountPaid: 20_000,
      changeAmount: 0,
      paymentMethod: "qris",
    });
  });

  test("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn();
    render(() => (
      <PaymentDialog onClose={onClose} onConfirm={() => {}} open={true} />
    ));

    await user.click(screen.getByText("Batal"));
    expect(onClose).toHaveBeenCalled();
  });
});
