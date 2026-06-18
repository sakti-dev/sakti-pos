import { ScrollCardShell } from "~/components/layout/scroll-card-shell";
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
    <ScrollCardShell
      footer={
        <StocktakeFooter
          onCancel={props.onCancel}
          onConfirm={() => props.onConfirm(s.ref, s.reason().trim(), s.rows())}
          state={s}
        />
      }
      top={
        <div class="space-y-3 px-4 pt-3 pb-3 lg:px-6">
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
      }
    >
      <StocktakeTable state={s} />
      <StocktakeList state={s} />
    </ScrollCardShell>
  );
}
