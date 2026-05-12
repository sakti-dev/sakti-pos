import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import { toast } from "solid-sonner";
import { FormTextField } from "~/components/form/form-text-field";
import { PhotoSourceDrawer } from "~/components/photo-source-drawer";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
  createProduct,
  getCategories,
  getProduct,
  updateProduct,
} from "~/db/menu";
import {
  createWebpPreviewUrl,
  deleteTempProductPhoto,
  type PickedProductPhoto,
  type ProductPhotoSource,
  pickProductPhoto,
  prepareLocalProductImageAssetFromPath,
} from "~/lib/assets";
import { createLogger } from "~/lib/logger";
import { resolveCachedProductImageUrl } from "~/lib/product-images/cache";
import {
  type ProductFormValues,
  ProductSchema,
} from "~/lib/schema/product-form";
import { currentMerchantId } from "~/store/outlet";
import { syncNow } from "~/store/sync";

export default function ProductForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Produk" : "Tambah Produk");

  const [categories] = createResource(getCategories);
  const [product] = createResource(
    () => (isEdit() ? params.id : undefined),
    (id) => (id === undefined ? undefined : getProduct(id))
  );

  const form = createForm({
    schema: ProductSchema,
    initialInput: {
      name: "",
      categoryId: "",
      price: "",
    },
  });
  const [error, setError] = createSignal("");
  const [imageAssetId, setImageAssetId] = createSignal<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = createSignal<string | null>(
    null
  );
  const [imageFileName, setImageFileName] = createSignal<string>("");
  const [imageError, setImageError] = createSignal("");
  const [isUploadingImage, setIsUploadingImage] = createSignal(false);
  const [pendingPhoto, setPendingPhoto] =
    createSignal<PickedProductPhoto | null>(null);
  const [initializedProductId, setInitializedProductId] = createSignal<
    string | null
  >(null);
  const [showPhotoSourceDrawer, setShowPhotoSourceDrawer] = createSignal(false);
  const [savedImagePreviewUrl] = createResource(
    () => (pendingPhoto() ? null : imageAssetId()),
    resolveCachedProductImageUrl
  );
  const photoLogger = createLogger({ module: "product-photo" });
  const revokePreviewUrl = (previewUrl: string | null) => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
  };
  const cleanupTempPhoto = (path: string) => {
    Promise.resolve(deleteTempProductPhoto(path)).catch(
      (cleanupError: unknown) => {
        photoLogger.warn("temp_photo_cleanup_failed", {
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
          path,
        });
      }
    );
  };
  const clearPendingPhoto = () => {
    const stagedPhoto = pendingPhoto();
    if (stagedPhoto) {
      cleanupTempPhoto(stagedPhoto.path);
    }
    setPendingPhoto(null);
  };
  const clearSelectedPhoto = () => {
    untrack(clearPendingPhoto);
    revokePreviewUrl(imagePreviewUrl());
    setImageAssetId(null);
    setImagePreviewUrl(null);
    setImageFileName("");
  };
  const queueProductPhotoUpload = (assetId: string) => {
    photoLogger.info("asset_sync_triggered", { assetId });
    syncNow()
      .then((result) => {
        photoLogger.info("asset_sync_finished", {
          assetId,
          mode: result.mode,
          pushTables: result.push.tables_synced,
        });
      })
      .catch((syncError: unknown) => {
        photoLogger.error("asset_sync_failed", syncError, { assetId });
      });
  };
  const photoButtonLabel = () => {
    if (isUploadingImage()) {
      return "Memproses...";
    }
    return imageAssetId() || pendingPhoto() ? "Ganti Foto" : "Pilih Foto";
  };
  const visibleImagePreviewUrl = () =>
    imagePreviewUrl() ?? savedImagePreviewUrl();

  onCleanup(() => {
    clearPendingPhoto();
    revokePreviewUrl(imagePreviewUrl());
  });

  const canSubmit = createMemo(() => {
    const input = getInput(form);
    return (
      !!input?.name?.trim() &&
      !!input?.categoryId &&
      !!input?.price?.trim() &&
      !isUploadingImage() &&
      !form.isSubmitting
    );
  });

  createEffect(() => {
    const data = product();
    if (!(data && categories())) {
      return;
    }
    if (initializedProductId() === data.id) {
      return;
    }

    reset(form, {
      initialInput: {
        name: data.name,
        categoryId: data.categoryId ?? "",
        price: String(data.price),
      },
    });
    clearPendingPhoto();
    setImageAssetId(data.imageAssetId ?? null);
    setImageFileName("");
    setImageError("");
    setError("");
    setInitializedProductId(data.id);
  });

  const openPhotoSourceDrawer = () => {
    photoLogger.info("drawer_opened");
    setShowPhotoSourceDrawer(true);
  };

  const triggerCameraPicker = () => handleNativePhotoPick("camera");

  const triggerGalleryPicker = () => handleNativePhotoPick("gallery");

  const handleNativePhotoPick = async (source: ProductPhotoSource) => {
    setIsUploadingImage(true);
    setImageError("");

    try {
      photoLogger.info("native_picker_requested", { source });
      const picked = await pickProductPhoto(source);
      photoLogger.info("native_picker_finished", {
        mimeType: picked.mimeType,
        originalFilename: picked.originalFilename,
        path: picked.path,
        previewMimeType: picked.previewMimeType,
        source: picked.source,
      });

      clearPendingPhoto();
      revokePreviewUrl(imagePreviewUrl());
      setPendingPhoto(picked);
      setImageAssetId(null);
      setImageFileName(picked.originalFilename);
      setImagePreviewUrl(
        picked.previewBase64
          ? `data:${picked.previewMimeType ?? picked.mimeType};base64,${
              picked.previewBase64
            }`
          : null
      );
    } catch (uploadError) {
      photoLogger.error("processing_failed", uploadError, { source });
      setImageError(
        uploadError instanceof Error
          ? uploadError.message
          : "Gagal memproses foto"
      );
      setImageAssetId(null);
      setPendingPhoto(null);
      revokePreviewUrl(imagePreviewUrl());
      setImagePreviewUrl(null);
      setImageFileName("");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async (values: ProductFormValues) => {
    try {
      let nextImageAssetId = imageAssetId();
      let preparedImageAssetId: string | null = null;
      const stagedPhoto = pendingPhoto();
      if (stagedPhoto) {
        const merchantId = currentMerchantId();
        if (!merchantId) {
          throw new Error("Merchant belum dipilih");
        }

        photoLogger.info("path_processing_started", {
          name: stagedPhoto.originalFilename,
          source: stagedPhoto.source,
        });

        const { asset, dataBase64, localPath } =
          await prepareLocalProductImageAssetFromPath({
            kind: "product_photo",
            merchantId,
            originalFilename: stagedPhoto.originalFilename,
            path: stagedPhoto.path,
          });

        photoLogger.info("path_processing_finished", {
          assetId: asset.id,
          localPath,
        });
        photoLogger.info("local_asset_prepared", {
          assetId: asset.id,
          localPath,
        });

        nextImageAssetId = asset.id;
        preparedImageAssetId = asset.id;
        setImageAssetId(asset.id);
        setPendingPhoto(null);
        if (dataBase64) {
          revokePreviewUrl(imagePreviewUrl());
          setImagePreviewUrl(createWebpPreviewUrl(dataBase64));
        }
      }

      const data = {
        name: values.name,
        categoryId: values.categoryId,
        price: values.price,
        imageAssetId: nextImageAssetId,
      };

      if (isEdit()) {
        await updateProduct(params.id ?? "", data);
      } else {
        await createProduct({
          ...data,
          merchantId: currentMerchantId() ?? "",
        });
      }
      if (preparedImageAssetId) {
        toast.success("Foto akan diupload saat online");
      }
      if (preparedImageAssetId) {
        queueProductPhotoUpload(preparedImageAssetId);
      }
      navigate("/settings/products-categories", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan produk");
    }
  };

  return (
    <>
      <PageHeader backHref="/settings/products-categories">
        {title()}
      </PageHeader>
      <div class="flex flex-1 flex-col p-4">
        <Show when={error()}>
          <div
            class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            {error()}
          </div>
        </Show>

        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center text-muted-foreground">
              Memuat...
            </div>
          }
          when={!isEdit() || (product() && categories())}
        >
          <Form
            class="flex flex-1 flex-col gap-4"
            of={form}
            onSubmit={handleSave}
          >
            <Field of={form} path={["name"]}>
              {(field) => (
                <FormTextField
                  {...field.props}
                  errors={field.errors}
                  input={field.input}
                  label="Nama Produk"
                  placeholder="Contoh: Kopi Susu"
                  required
                  type="text"
                />
              )}
            </Field>

            <Field of={form} path={["categoryId"]}>
              {(field) => (
                <div class="flex flex-col gap-1.5">
                  <label
                    class="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    for={field.props.name}
                  >
                    Kategori
                    <span class="ml-0.5 text-muted-foreground">*</span>
                  </label>
                  <Select
                    name={field.props.name}
                    onChange={(v) => field.onInput(v == null ? "" : String(v))}
                    options={
                      categories()?.map((cat) => ({
                        value: cat.id,
                        label: cat.name,
                      })) ?? []
                    }
                    placeholder="Pilih kategori"
                    value={field.input}
                  />
                </div>
              )}
            </Field>

            <Field of={form} path={["price"]}>
              {(field) => (
                <FormTextField
                  {...field.props}
                  errors={field.errors}
                  input={field.input}
                  label="Harga (Rp)"
                  placeholder="0"
                  required
                  type="number"
                />
              )}
            </Field>

            <div class="flex flex-col gap-1.5">
              <span class="font-medium text-sm leading-none">Foto Produk</span>
              <div class="flex items-start gap-4 rounded-xl border border-border bg-card p-3">
                <div class="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border border-dashed bg-muted">
                  <Show
                    fallback={
                      <span class="px-2 text-center text-muted-foreground text-xs">
                        Belum ada foto
                      </span>
                    }
                    when={visibleImagePreviewUrl()}
                  >
                    {(previewUrl) => (
                      <img
                        alt="Preview foto produk"
                        class="size-full object-cover"
                        height="96"
                        src={previewUrl()}
                        width="96"
                      />
                    )}
                  </Show>
                </div>
                <div class="flex min-w-0 flex-1 flex-col gap-2">
                  <p class="text-muted-foreground text-sm">
                    {imageFileName() ||
                      "Pilih foto untuk diunggah sebagai WebP"}
                  </p>
                  <p class="text-muted-foreground text-xs">
                    JPG/PNG, akan diproses menjadi WebP 800px.
                  </p>
                  <Show when={pendingPhoto()}>
                    <p class="text-muted-foreground text-xs">
                      Foto akan diproses saat disimpan.
                    </p>
                  </Show>
                  <Show when={imageAssetId() && !pendingPhoto()}>
                    <p class="text-muted-foreground text-xs">
                      Foto akan diupload saat online.
                    </p>
                  </Show>
                  <Show when={imageError()}>
                    <p class="text-destructive text-xs" role="alert">
                      {imageError()}
                    </p>
                  </Show>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      disabled={isUploadingImage()}
                      onClick={openPhotoSourceDrawer}
                      size="sm"
                      type="button"
                    >
                      {photoButtonLabel()}
                    </Button>
                    <Show when={imageAssetId() || pendingPhoto()}>
                      <Button
                        onClick={clearSelectedPhoto}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Hapus
                      </Button>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
            <PhotoSourceDrawer
              onOpenChange={(open) => {
                photoLogger.info("drawer_state_changed", { open });
                setShowPhotoSourceDrawer(open);
              }}
              onPickCamera={triggerCameraPicker}
              onPickGallery={triggerGalleryPicker}
              open={showPhotoSourceDrawer()}
            />

            <div class="mt-auto pt-4">
              <Button
                class="w-full"
                disabled={!canSubmit()}
                size="lg"
                type="submit"
              >
                {form.isSubmitting ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </Form>
        </Show>
      </div>
    </>
  );
}
