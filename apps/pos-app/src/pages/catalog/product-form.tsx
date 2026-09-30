import { useLocation, useNavigate, useParams } from "@solidjs/router";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import { UploadIcon, XCloseIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { PickerField } from "~/components/picker-field";
import { Button } from "~/components/ui/button";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  createCategory,
  createProduct,
  getCategories,
  getProduct,
  updateProduct,
} from "~/db/catalog";
import {
  getModifierGroups,
  setProductModifierGroups,
} from "~/db/modifier-groups";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { pickProductImage } from "~/lib/assets/product-image";
import { resolveImageUrl } from "~/lib/assets/resolve";
import { cn, createLogger } from "~/lib/utils";

const logger = createLogger({ domain: "POS", module: "product-form" });

const labelClass =
  "font-medium text-body-sm text-foreground leading-none tracking-normal";

interface StagedPhoto {
  readonly assetId: string | null;
  readonly url: string;
}

export default function ProductFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const isEditing = () => Boolean(params.id) && params.id !== "new";

  const [product] = createResource(
    () => (isEditing() ? params.id : undefined),
    (id) => getProduct(id!)
  );
  const [categoriesList] = createResource(getCategories);

  const existing = () => product();

  const [name, setName] = createSignal("");
  const [category, setCategory] = createSignal<string>("");
  const [price, setPrice] = createSignal("");
  const [photo, setPhoto] = createSignal<StagedPhoto | null>(null);
  const [saving, setSaving] = createSignal(false);

  const groupsQuery = useDrizzleQuery(
    ["drizzle", "modifier-groups", "list"],
    () => getModifierGroups()
  );
  const [attachedGroups, setAttachedGroups] = createStore<
    Record<string, boolean>
  >({});
  const [groupsHydrated, setGroupsHydrated] = createSignal(false);

  // Edit mode: pre-check groups currently linked to this product.
  createEffect(() => {
    if (!isEditing() || groupsHydrated() || !product()) {
      return;
    }
    const productId = product()!.id;
    const next: Record<string, boolean> = {};
    for (const group of groupsQuery.data() ?? []) {
      next[group.id] = group.products.some((p) => p.id === productId);
    }
    setAttachedGroups(next);
    setGroupsHydrated(true);
  });

  const selectedGroupIds = () =>
    (groupsQuery.data() ?? [])
      .filter((g) => attachedGroups[g.id])
      .map((g) => g.id);

  createResource(
    () => existing()?.imageAssetId ?? null,
    async (assetId) => {
      const resolved = await resolveImageUrl(assetId);
      if (resolved) {
        setPhoto(resolved);
      }
    }
  );

  createResource(
    () => existing()?.id ?? null,
    (id) => {
      if (!id) {
        return;
      }
      const row = existing();
      setName(row?.name ?? "");
      setCategory(row?.categoryId ?? "");
      setPrice(row ? String(row.priceMinorUnits / 100) : "");
    }
  );

  const handlePhotoPick = async () => {
    const picked = await pickProductImage();
    if (picked) {
      setPhoto({ assetId: picked.assetId, url: picked.previewUrl });
    } else {
      toast.error("Gagal memilih foto");
    }
  };

  const saveLabel = () => {
    if (saving()) {
      return "Menyimpan…";
    }
    return isEditing() ? "Simpan Perubahan" : "Simpan Produk";
  };

  const validate = (): { name: string; price: number } | null => {
    const trimmedName = name().trim();
    if (!trimmedName) {
      toast.error("Nama produk wajib diisi");
      return null;
    }
    if (!category()) {
      toast.error("Pilih kategori");
      return null;
    }
    const priceNum = Number.parseInt(price(), 10);
    if (!priceNum || priceNum <= 0) {
      toast.error("Harga wajib diisi");
      return null;
    }
    return { name: trimmedName, price: priceNum };
  };

  const handleSave = async () => {
    const valid = validate();
    if (!valid) {
      return;
    }

    setSaving(true);
    try {
      let productId: string;
      if (isEditing() && existing()) {
        await updateProduct(existing()!.id, {
          categoryId: category(),
          ...(photo()?.assetId ? { imageAssetId: photo()!.assetId } : {}),
          name: valid.name,
          price: valid.price,
        });
        productId = existing()!.id;
        toast.success("Produk diperbarui");
      } else {
        const created = await createProduct({
          categoryId: category(),
          ...(photo()?.assetId ? { imageAssetId: photo()!.assetId } : {}),
          name: valid.name,
          price: valid.price,
        });
        productId = created.id;
        toast.success(
          photo()?.assetId
            ? "Produk ditambahkan — foto akan diproses di background"
            : "Produk ditambahkan"
        );
      }
      await setProductModifierGroups(productId, selectedGroupIds());
      navigate("/catalog");
    } catch (error) {
      logger.error("PRODUCT_SAVE_FAILED", { error: String(error) });
      toast.error("Gagal menyimpan produk");
      setSaving(false);
    }
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition={useLocation().pathname}
      title={isEditing() ? "Edit Produk" : "Tambah Produk"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          {/* ── Photo + Name ── */}
          <div class="flex flex-col gap-5 sm:flex-row">
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Foto Produk</span>
              <button
                class="group relative grid aspect-square size-[120px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border-2 border-input border-dashed bg-background sm:size-[132px]"
                onClick={handlePhotoPick}
                type="button"
              >
                <Show when={photo()}>
                  <img
                    alt="Preview"
                    class="absolute inset-0 h-full w-full object-cover"
                    src={photo()!.url}
                  />
                </Show>
                <Show when={!photo()}>
                  <div class="flex flex-col items-center gap-1.5 text-muted-foreground transition-colors group-hover:text-foreground">
                    <UploadIcon class="h-6 w-6" />
                    <span class="font-medium text-caption-sm">Upload</span>
                  </div>
                </Show>
              </button>
              <Show when={photo()}>
                <button
                  class="inline-flex items-center justify-center gap-1 font-medium text-caption-sm text-danger transition-colors hover:text-danger/80"
                  onClick={() => setPhoto(null)}
                  type="button"
                >
                  <XCloseIcon class="h-3 w-3" />
                  Hapus Foto
                </button>
              </Show>
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <TextField class="gap-1.5" onChange={setName} value={name()}>
                <TextFieldLabel>Nama Produk</TextFieldLabel>
                <TextFieldInput autofocus placeholder="e.g. Es Kopi Susu" />
              </TextField>
            </div>
          </div>

          {/* ── Divider ── */}
          <hr class="my-6 border-border" />

          {/* ── Category + Price ── */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Kategori</span>
              <PickerField
                onChange={setCategory}
                onCreate={async (query) => {
                  const created = await createCategory({ name: query });
                  return created.id;
                }}
                options={(categoriesList() ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                placeholder="Pilih kategori"
                title="Pilih Kategori"
                value={category()}
              />
            </div>

            <NumberField class="gap-1.5">
              <NumberFieldLabel>Harga (Rp)</NumberFieldLabel>
              <NumberFieldInput
                onChange={(v) => setPrice(String(v))}
                placeholder="25000"
                value={Number.parseInt(price(), 10) || undefined}
              />
            </NumberField>
          </div>

          {/* ── Modifier groups (varian) ── */}
          <div class="mt-6 flex flex-col gap-1.5">
            <span class={labelClass}>Varian</span>
            <Show
              fallback={
                <p class="text-caption-sm text-muted-foreground">
                  Belum ada varian — buat dulu di tab Varian
                </p>
              }
              when={(groupsQuery.data()?.length ?? 0) > 0}
            >
              <div class="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted p-2.5">
                <For each={groupsQuery.data() ?? []}>
                  {(group) => (
                    <button
                      class={cn(
                        "inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border px-3 py-1 font-medium text-caption-sm transition-colors",
                        attachedGroups[group.id]
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      )}
                      onClick={() => setAttachedGroups(group.id, (on) => !on)}
                      type="button"
                    >
                      {group.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* ── Actions ── */}
          <div class="mt-8 flex items-center justify-end gap-3">
            <Button
              look="outline"
              onClick={() => navigate("/catalog")}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button
              disabled={saving() || product.loading}
              onClick={handleSave}
              type="button"
            >
              {saveLabel()}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
