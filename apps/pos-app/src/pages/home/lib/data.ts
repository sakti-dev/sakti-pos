import type { Component } from "solid-js";
import {
  BoxPackageIcon,
  ChartIcon,
  ClipboardIcon,
  ClockIcon,
  CreditCardIcon,
  GridDetailIcon,
  MoreHorizontalIcon,
  PeopleIcon,
  QrCodeIcon,
  TruckIcon,
  WalletIcon,
} from "~/assets";
import {
  currentUser,
  currentVenue,
  earningsAmount,
} from "~/lib/data/dashboard";

export { currentUser, currentVenue, earningsAmount };

/* ── Register / drawer status ──────────────────────────────────── */

export interface RegisterStatus {
  /** Float amount in the cash drawer */
  readonly drawer: string;
  readonly open: boolean;
  readonly synced: boolean;
}

export const registerStatus: RegisterStatus = {
  open: true,
  drawer: "Rp 450rb",
  synced: true,
} as const;

/* ── Today's earnings breakdown ────────────────────────────────── */

export interface EarningsBreakdown {
  readonly card: number;
  readonly cash: number;
  readonly unpaid: number;
}

export const earningsBreakdown: EarningsBreakdown = {
  cash: 3,
  card: 1,
  unpaid: 0,
} as const;

/* ── Needs-attention items ─────────────────────────────────────── */

export type AttentionTone = "warning" | "danger" | "info";

export interface AttentionItem {
  readonly count: number;
  readonly href?: string;
  readonly Icon: Component<{ class?: string }>;
  readonly label: string;
  readonly subtitle: string;
  readonly tone: AttentionTone;
}

export const attentionItems: readonly AttentionItem[] = [
  {
    Icon: BoxPackageIcon,
    label: "Stok menipis",
    subtitle: "Perlu pembelian ulang",
    count: 3,
    href: "/inventory",
    tone: "warning",
  },
  {
    Icon: ClockIcon,
    label: "Sedang diproses",
    subtitle: "Perlu dituntaskan",
    count: 2,
    href: "/transactions",
    tone: "info",
  },
  {
    Icon: CreditCardIcon,
    label: "Belum dibayar",
    subtitle: "Menunggu pembayaran",
    count: 0,
    href: "/transactions",
    tone: "danger",
  },
] as const;

/* ── Full menu set ─────────────────────────────────────────────── */

export interface MenuItem {
  readonly href: string;
  readonly Icon: Component<{ class?: string }>;
  readonly label: string;
}

export interface MenuGroup {
  readonly items: readonly MenuItem[];
  readonly label: string;
}

/* The home grid IS the comprehensive menu surface — every app menu the
   sidebar/notch nav doesn't surface. Grouped by domain so it reads as a
   navigation list, not a flat launcher deck. */
export const menuGroups: readonly MenuGroup[] = [
  {
    label: "Kelola bisnis",
    items: [
      { Icon: GridDetailIcon, href: "/catalog", label: "Katalog" },
      { Icon: PeopleIcon, href: "/setting", label: "Pelanggan" },
      { Icon: ChartIcon, href: "/transactions", label: "Laporan" },
      { Icon: WalletIcon, href: "/setting", label: "Dompet" },
    ],
  },
  {
    label: "Layanan penjualan",
    items: [
      { Icon: ClipboardIcon, href: "/setting", label: "Tipe order" },
      { Icon: TruckIcon, href: "/setting", label: "Tipe pengantaran" },
      { Icon: QrCodeIcon, href: "/setting", label: "QR menu" },
      { Icon: MoreHorizontalIcon, href: "/setting", label: "Lainnya" },
    ],
  },
] as const;
