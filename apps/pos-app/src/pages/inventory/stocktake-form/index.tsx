import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { recordMovements } from "../components/lib/store";
import { StocktakeCount } from "./components/stocktake-count";

export default function StocktakePage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=stocktake"
      data-ssgoi-transition="/inventory/stocktake/new"
      title="Stock Opname"
    >
      <StocktakeCount
        onCancel={() => navigate("/inventory?tab=stocktake")}
        onConfirm={(ref, reason, rows) => {
          // Only items with non-zero variance produce movements.
          const meaningful = rows.filter((r) => r.diff !== 0);
          if (meaningful.length > 0) {
            recordMovements(
              meaningful.map((r) => ({
                productId: r.productId,
                type: "stocktake" as const,
                delta: r.diff,
                note: reason,
                ref,
              }))
            );
          }
          toast.success(`${ref} tersimpan`);
          navigate("/inventory?tab=stocktake");
        }}
      />
    </SubPageShell>
  );
}
