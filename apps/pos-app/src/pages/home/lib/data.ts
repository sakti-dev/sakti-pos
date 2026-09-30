import type { Component } from "solid-js";
import {
  ChartIcon,
  ClipboardIcon,
  GridDetailIcon,
  MoreHorizontalIcon,
  PeopleIcon,
  QrCodeIcon,
  TruckIcon,
  WalletIcon,
} from "~/assets";

/* ── Needs-attention tones (rows themselves are live data now) ─── */

export type AttentionTone = "warning" | "danger" | "info";

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
