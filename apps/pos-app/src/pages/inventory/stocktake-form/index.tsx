import { useNavigate, useSearchParams } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { recordMovements } from "../components/lib/store";
import { StocktakeCount } from "./components/stocktake-count";

export default function StocktakePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scope = () =>
    params.scope === "ingredient" || params.scope === "retail"
      ? params.scope
      : "ingredient";

  const title = () =>
    scope() === "ingredient" ? "Opname Bahan Baku" : "Opname Barang Jadi";

  const backHref = () => `/inventory?tab=${scope()}`;

  return (
    <SubPageShell
      backHref={backHref()}
      data-ssgoi-transition="/inventory/stocktake/new"
      title={title()}
    >
      <StocktakeCount
        onCancel={() => navigate(backHref())}
        onConfirm={(ref, reason, rows) => {
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
          navigate(backHref());
        }}
        scope={scope()}
      />
    </SubPageShell>
  );
}
