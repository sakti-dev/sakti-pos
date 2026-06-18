import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { updateLatestCostPrice } from "../components/lib/ingredients";
import { recordMovements } from "../components/lib/store";
import { GoodsReceiptForm } from "./goods-receipt-form";

export default function GoodsReceiptPage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=ingredient"
      data-ssgoi-transition="/inventory/goods-receipt/new"
      title="Penerimaan Barang Baru"
    >
      <GoodsReceiptForm
        onCancel={() => navigate("/inventory?tab=ingredient")}
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
          // Update latestCostPrice for ingredient items
          for (const i of items) {
            if (i.costPrice > 0) {
              updateLatestCostPrice(i.productId, i.costPrice);
            }
          }
          navigate("/inventory?tab=ingredient");
        }}
      />
    </SubPageShell>
  );
}
