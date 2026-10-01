import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { nextGoodsReceiptRef, recordGoodsReceipt } from "~/db/inventory";
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
        onConfirm={(lines, meta) => {
          nextGoodsReceiptRef()
            .then((ref) =>
              recordGoodsReceipt({
                lines,
                note: meta.note,
                ref,
                supplierName: meta.supplierName || null,
              })
                .then(() => {
                  toast.success(`Penerimaan ${ref} tersimpan`);
                  navigate("/inventory?tab=ingredient");
                })
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Gagal menyimpan penerimaan"
                  );
                })
            )
            .catch((error: unknown) => {
              toast.error(
                error instanceof Error ? error.message : "Gagal membuat nomor"
              );
            });
        }}
      />
    </SubPageShell>
  );
}
