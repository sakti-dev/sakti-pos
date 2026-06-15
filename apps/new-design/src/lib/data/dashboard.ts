import type { Component } from "solid-js";
import { CheckCircleIcon, ClockIcon, CreditCardIcon, FileIcon } from "~/assets";

/* ── KPI cards ──────────────────────────────────────────────────── */

export type KpiTone = "info" | "warning" | "danger" | "success";

export interface KpiCardData {
  readonly ActionIcon: Component<{ class?: string }>;
  readonly count: number;
  readonly name: string;
  readonly subtitle: string;
  readonly tone: KpiTone;
  readonly value: number;
}

export const kpiCards: readonly KpiCardData[] = [
  {
    name: "Transaksi Baru",
    value: 0,
    count: 0,
    subtitle: "Hari ini",
    tone: "info",
    ActionIcon: FileIcon,
  },
  {
    name: "Sedang Diproses",
    value: 0,
    count: 0,
    subtitle: "Perlu dituntaskan",
    tone: "warning",
    ActionIcon: ClockIcon,
  },
  {
    name: "Menunggu Dibayar",
    value: 0,
    count: 0,
    subtitle: "Menunggu pembayaran",
    tone: "danger",
    ActionIcon: CreditCardIcon,
  },
  {
    name: "Transaksi Selesai",
    value: 0,
    count: 0,
    subtitle: "Selesai hari ini",
    tone: "success",
    ActionIcon: CheckCircleIcon,
  },
];

/* ── Earnings ───────────────────────────────────────────────────── */

export const earningsAmount = "Rp 2.450.000";

/* ── Current user & venue ───────────────────────────────────────── */

export const currentUser = {
  initials: "YB",
  name: "Yos Bb",
  role: "Manager",
} as const;

export const currentVenue = {
  name: "Tantri Cafe",
  address:
    "Jl. Banda No.30, Citarum, Kec. Bandung Wetan, Kota Bandung, Jawa Barat 40115",
} as const;
