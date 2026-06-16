import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { recordMovements } from "~/lib/inventory/store";
import { OpnameCount } from "../components/opname-count";

export default function InventoryOpnameNewPage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=opname"
      data-ssgoi-transition="/inventory/opname/new"
      title="Stock Opname"
    >
      <OpnameCount
        onCancel={() => navigate("/inventory?tab=opname")}
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
          navigate("/inventory?tab=opname");
        }}
      />
    </SubPageShell>
  );
}
