import { SearchBar } from "~/components/search-bar";
import { StocktakeFooter } from "./stocktake-footer";
import { StocktakeList } from "./stocktake-list";
import { StocktakeTable } from "./stocktake-table";
import { type StocktakeScope, useStocktake } from "./use-stocktake";
import type { VarianceRow } from "./utils";

export interface StocktakeCountProps {
  readonly onCancel: () => void;
  readonly onConfirm: (
    ref: string,
    reason: string,
    rows: VarianceRow[]
  ) => void;
  readonly scope: StocktakeScope;
}

export function StocktakeCount(props: StocktakeCountProps) {
  const s = useStocktake(props.scope);

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Description + Search — pinned (gap lives here, outside scroll area) */}
      <div class="shrink-0 space-y-3 px-4 pt-3 pb-3 lg:px-6">
        <p class="text-body-sm text-muted-foreground">
          {props.scope === "retail"
            ? "Hitung jumlah fisik barang jualan jadi yang ada di etalase depan."
            : "Hitung jumlah fisik bahan baku yang ada di gudang dapur."}
        </p>
        <SearchBar
          onInput={s.setSearch}
          placeholder="Cari nama barang atau SKU..."
          value={s.search()}
        />
      </div>

      {/* Scroll box — the bordered, rounded CLIPPER.
          overflow-y-auto + border-radius clips the sticky header's top
          corners, so body rows can never peek through the rounded notches. */}
      <div class="scrollbar-none mx-4 mb-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border lg:mx-6">
        <div class="flex flex-col">
          <StocktakeTable state={s} />
          <StocktakeList state={s} />
        </div>
      </div>

      {/* Footer — full-width, pinned to bottom by the flex-1 scroll area */}
      <StocktakeFooter
        onCancel={props.onCancel}
        onConfirm={() => props.onConfirm(s.ref, s.reason().trim(), s.rows())}
        state={s}
      />
    </div>
  );
}
