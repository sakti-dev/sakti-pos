import { useNavigate, useSearchParams } from "@solidjs/router";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
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
        onDone={() => navigate(backHref())}
        scope={scope()}
      />
    </SubPageShell>
  );
}
