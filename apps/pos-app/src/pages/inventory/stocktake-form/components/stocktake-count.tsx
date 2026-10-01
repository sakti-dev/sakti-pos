import { toast } from "solid-sonner";
import { ScrollCardShell } from "~/components/layout/scroll-card-shell";
import { SearchBar } from "~/components/search-bar";
import { recordStocktake } from "~/db/inventory";
import { StocktakeFooter } from "./stocktake-footer";
import { StocktakeList } from "./stocktake-list";
import { StocktakeTable } from "./stocktake-table";
import { type StocktakeScope, useStocktake } from "./use-stocktake";

export interface StocktakeCountProps {
  readonly onCancel: () => void;
  /** Called after the stocktake persisted successfully. */
  readonly onDone: () => void;
  readonly scope: StocktakeScope;
}

export function StocktakeCount(props: StocktakeCountProps) {
  const s = useStocktake(props.scope);

  const handleConfirm = () => {
    const lines = s.buildLines();
    const ref = s.ref.latest;
    const reason = s.reason().trim();
    if (!ref || lines.length === 0) {
      return;
    }
    recordStocktake({
      lines,
      reason,
      ref,
      targetType: s.scope === "ingredient" ? "ingredient" : "product",
    })
      .then(() => {
        toast.success(`Opname ${ref} tersimpan`);
        props.onDone();
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Gagal menyimpan opname"
        );
      });
  };

  return (
    <ScrollCardShell
      footer={
        <StocktakeFooter
          onCancel={props.onCancel}
          onConfirm={handleConfirm}
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
