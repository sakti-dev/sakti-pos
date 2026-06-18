import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { recordMovements } from "~/lib/inventory/store";
import { TerimaReceive } from "../components/terima-receive";

export default function InventoryTerimaNewPage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=terima"
      data-ssgoi-transition="/inventory/terima/new"
      title="Penerimaan Barang Baru"
    >
      <TerimaReceive
        onCancel={() => navigate("/inventory?tab=terima")}
        onConfirm={({ ref, supplier, note, items }) => {
          recordMovements(
            items.map((i) => ({
              productId: i.productId,
              type: "restock" as const,
              delta: i.qty,
              costPrice: i.costPrice,
              supplier,
              ref,
              note,
            }))
          );
          toast.success(`${ref} tersimpan`);
          navigate("/inventory?tab=terima");
        }}
      />
    </SubPageShell>
  );
}
