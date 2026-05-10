import dayjs from "dayjs";
import type { ReceiptData } from "./types";

const LINE_WIDTH = 32;
const WHITESPACE_REGEX = /\s+/;

const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("id-ID").format(amount);

const wrapWords = (value: string, width: number): string[] => {
  const words = value.trim().split(WHITESPACE_REGEX);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word.length > width ? word.slice(0, width) : word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

const lineAmount = (label: string, amount: number): string =>
  `[L]${label}[R]${formatAmount(amount)}`;

export const formatReceiptForAndroid = (data: ReceiptData): string => {
  const lines: string[] = [
    `[C]<b><font size='big'>${data.business.name}</font></b>`,
  ];

  if (data.business.address) {
    for (const line of wrapWords(data.business.address, LINE_WIDTH)) {
      lines.push(`[C]${line}`);
    }
  }
  if (data.business.phone) {
    lines.push(`[C]${data.business.phone}`);
  }

  lines.push(
    "[C]--------------------------------",
    `[L]No: ${data.order.orderNumber}`,
    `[L]Tgl: ${dayjs(data.order.createdAt).format("YYYY-MM-DD HH:mm")}`,
    `[L]Kasir: ${data.order.cashierName}`,
    "[C]--------------------------------"
  );

  for (const item of data.items) {
    for (const nameLine of wrapWords(item.name, LINE_WIDTH)) {
      lines.push(`[L]${nameLine}`);
    }
    lines.push(
      `[L]  ${item.quantity} x ${formatAmount(item.unitPrice)}[R]${formatAmount(item.subtotal)}`
    );
  }

  lines.push("[C]--------------------------------");
  if (data.totals.subtotal != null) {
    lines.push(lineAmount("Subtotal", data.totals.subtotal));
  }
  if (data.totals.tax) {
    lines.push(lineAmount(data.totals.tax.label, data.totals.tax.amount));
  }
  if (data.totals.adminFee) {
    lines.push(
      lineAmount(data.totals.adminFee.label, data.totals.adminFee.amount)
    );
  }
  lines.push(`[L]<b>TOTAL</b>[R]<b>${formatAmount(data.totals.total)}</b>`);
  lines.push("[C]--------------------------------");

  const paymentLabel = data.payment.method === "cash" ? "TUNAI" : "QRIS";
  lines.push(`[L]Metode: ${paymentLabel}`);
  lines.push(lineAmount("Bayar", data.payment.amountPaid));
  if (data.payment.method === "cash" && data.payment.changeAmount != null) {
    lines.push(lineAmount("Kembali", data.payment.changeAmount));
  }

  lines.push(
    "[C]--------------------------------",
    "[C]Terima Kasih!",
    "[C]atas kunjungan Anda",
    "[L]\n[L]\n[L]"
  );

  return lines.join("\n");
};
