import {
  FiInbox,
  FiPackage,
  FiPlus,
  FiSearch,
  FiShoppingBag,
} from "solid-icons/fi";
import type { JSX } from "solid-js";
import { Button } from "~/components/ui/button";
import type { StocktakeScope } from "./use-stocktake";

export interface EmptyState {
  readonly kind: "bebas-stok" | "empty" | "none" | "search";
  readonly query?: string;
}

interface EmptyCopy {
  readonly body: string;
  readonly cta: string;
  readonly icon: JSX.Element;
  readonly title: string;
}

export function emptyCopy(
  kind: EmptyState["kind"],
  scope: StocktakeScope,
  query?: string
): EmptyCopy {
  if (kind === "search") {
    return {
      body: `Tidak ada barang dengan nama atau SKU "${query}".`,
      cta: "Hapus pencarian",
      icon: <FiSearch class="size-6" />,
      title: "Pencarian tidak ditemukan",
    };
  }
  if (kind === "bebas-stok") {
    return {
      body: "Produk dengan tanda ∞ Bebas Stok tidak perlu diopname karena stoknya tidak dilacak. Ubah produk ke stok terbatas di katalog untuk mulai mencatat sisanya.",
      cta: "Buka Katalog",
      icon: <FiInbox class="size-6" />,
      title: "Semua produk berstok bebas",
    };
  }
  if (scope === "retail") {
    return {
      body: "Tambahkan produk ritel di katalog agar bisa dicatat sisanya.",
      cta: "Buka Katalog",
      icon: <FiShoppingBag class="size-6" />,
      title: "Belum ada produk untuk diopname",
    };
  }
  return {
    body: "Tambahkan bahan baku baru untuk mulai mengelola stok dapur.",
    cta: "Tambah Bahan Baku",
    icon: <FiPackage class="size-6" />,
    title: "Belum ada bahan baku",
  };
}

export function EmptyStateView(props: {
  onAction: () => void;
  scope: StocktakeScope;
  state: EmptyState;
}) {
  const copy = () =>
    emptyCopy(props.state.kind, props.scope, props.state.query);
  return (
    <div class="flex flex-col items-center gap-3 px-6 text-center">
      <span class="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        {copy().icon}
      </span>
      <div class="max-w-[42ch]">
        <p class="font-semibold text-body text-foreground">{copy().title}</p>
        <p class="mt-1 text-body-sm text-muted-foreground">{copy().body}</p>
      </div>
      <Button
        look="outline"
        onClick={props.onAction}
        size="sm"
        tone="primary"
        type="button"
      >
        <FiPlus class="h-4 w-4" />
        {copy().cta}
      </Button>
    </div>
  );
}
