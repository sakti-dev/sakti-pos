import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { createResource, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { createCategory, getCategories, updateCategory } from "~/db/catalog";

export default function CategoryFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const isEditing = () => Boolean(params.id) && params.id !== "new";

  const [categoriesList, { refetch }] = createResource(getCategories);
  const existing = () =>
    isEditing() ? categoriesList()?.find((c) => c.id === params.id) : undefined;

  const [name, setName] = createSignal("");
  const [hydrated, setHydrated] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  createResource(
    () => existing()?.id ?? null,
    (id) => {
      if (id && !hydrated()) {
        setName(existing()?.name ?? "");
        setHydrated(true);
      }
    }
  );

  const saveLabel = () => {
    if (saving()) {
      return "Menyimpan…";
    }
    return isEditing() ? "Simpan Perubahan" : "Simpan Kategori";
  };

  const handleSave = async () => {
    const trimmed = name().trim();
    if (!trimmed) {
      toast.error("Nama kategori wajib diisi");
      return;
    }
    setSaving(true);
    try {
      if (isEditing() && existing()) {
        await updateCategory(existing()!.id, { name: trimmed });
        toast.success("Kategori diperbarui");
      } else {
        await createCategory({ name: trimmed });
        toast.success("Kategori ditambahkan");
      }
      await refetch();
      navigate("/catalog");
    } catch {
      toast.error("Gagal menyimpan kategori");
      setSaving(false);
    }
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition={useLocation().pathname}
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
            <Button disabled={saving()} onClick={handleSave} type="button">
              {saveLabel()}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
