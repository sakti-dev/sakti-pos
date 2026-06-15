import { useNavigate, useParams } from "@solidjs/router";
import { createSignal } from "solid-js";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { categories } from "~/lib/data/catalog";

export default function CategoryFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const editId = () =>
    params.id && params.id !== "new" ? params.id : undefined;
  const existing = () =>
    editId() ? categories.find((c) => c.id === editId()) : undefined;
  const isEditing = () => Boolean(existing());

  const [name, setName] = createSignal(existing()?.name ?? "");

  const handleSave = () => {
    const trimmed = name().trim();
    if (!trimmed) {
      toast.error("Nama kategori wajib diisi");
      return;
    }
    toast.success(isEditing() ? "Kategori diperbarui" : "Kategori ditambahkan");
    navigate("/catalog");
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition="/catalog/category"
      title={isEditing() ? "Edit Kategori" : "Tambah Kategori"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          <TextField class="mb-6 gap-1.5" onChange={setName} value={name()}>
            <TextFieldLabel>Nama Kategori</TextFieldLabel>
            <TextFieldInput autofocus placeholder="e.g. Minuman" />
          </TextField>

          <div class="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button
              look="outline"
              onClick={() => navigate("/catalog")}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button onClick={handleSave} type="button">
              {isEditing() ? "Simpan Perubahan" : "Simpan Kategori"}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
