import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { recordMovements } from "../components/lib/store";
import { GoodsReceiptForm } from "./goods-receipt-form";

export default function GoodsReceiptPage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=goods-receipt"
      data-ssgoi-transition="/inventory/goods-receipt/new"
      title="Penerimaan Barang Baru"
    >
      <GoodsReceiptForm
        onCancel={() => navigate("/inventory?tab=goods-receipt")}
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
          navigate("/inventory?tab=goods-receipt");
        }}
      />
    </SubPageShell>
  );
}
