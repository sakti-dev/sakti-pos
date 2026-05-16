import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Show,
} from "solid-js";
import { toast } from "solid-sonner";
import { FormTextField } from "~/components/form/form-text-field";
import {
  ImageUpload,
  type ImageUploadController,
} from "~/components/image-upload";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
  createProduct,
  getCategories,
  getProduct,
  updateProduct,
} from "~/db/menu";
import { createAssetProcessingTarget } from "~/lib/asset-targets";
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
  const [isImageBusy, setIsImageBusy] = createSignal(false);
  const [initializedProductId, setInitializedProductId] = createSignal<
    string | null
  >(null);
  const [savedImagePreviewUrl] = createResource(
    () => imageAssetId(),
    resolveCachedProductImageUrl
  );
  let imageUpload: ImageUploadController | undefined;
  const photoLogger = createLogger({
    domain: "PHOTO",
    module: "product-photo",
  });
  const triggerBackgroundPhotoSync = (productId: string) => {
    window.setTimeout(() => {
      syncNow()
        .then((result) => {
          photoLogger.info("asset_sync_finished", {
            productId,
            mode: result.mode,
            pushTables: result.push.tables_synced,
          });
        })
        .catch((syncError: unknown) => {
          photoLogger.error("asset_sync_failed", syncError, {
            productId,
          });
        });
    }, 0);
  };

  const canSubmit = createMemo(() => {
    const input = getInput(form);
    return (
      !!input?.name?.trim() &&
      !!input?.categoryId &&
      !!input?.price?.trim() &&
      !isImageBusy() &&
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
    setImageAssetId(data.imageAssetId ?? null);
    setError("");
    setInitializedProductId(data.id);
  });

  const handleSave = async (values: ProductFormValues) => {
    try {
      const merchantId = currentMerchantId();
      if (!merchantId) {
        throw new Error("Merchant belum dipilih");
      }

      const nextImageAssetId = imageAssetId();
      const hasStagedImage = imageUpload?.hasStagedImage() ?? false;
      const data = {
        name: values.name,
        categoryId: values.categoryId,
        price: values.price,
        imageAssetId: nextImageAssetId,
      };
      photoLogger.info("submit_started", {
        hasExistingAsset: !!nextImageAssetId,
        hasStagedPhoto: hasStagedImage,
        isEdit: isEdit(),
        merchantId,
        productId: params.id ?? null,
      });

      let savedProductId: string;
      let shouldTriggerPhotoSync = false;
      if (isEdit()) {
        const updatedProduct = await updateProduct(params.id ?? "", data);
        savedProductId = updatedProduct.id;
        photoLogger.info("product_updated", {
          imageAssetId: data.imageAssetId,
          productId: savedProductId,
        });
      } else {
        const createdProduct = await createProduct({
          ...data,
          merchantId,
        });
        savedProductId = createdProduct.id;
        photoLogger.info("product_created", {
          imageAssetId: data.imageAssetId,
          productId: savedProductId,
        });
      }

      if (hasStagedImage) {
        try {
          const enqueueResult = await imageUpload?.enqueueFor(
            createAssetProcessingTarget("productImage", savedProductId)
          );

          if (!enqueueResult) {
            throw new Error("Tidak ada foto staged untuk diproses");
          }

          photoLogger.info("pending_photo_job_enqueued", {
            jobId: enqueueResult.jobId,
            productId: savedProductId,
          });
          toast.success("Foto akan diproses di background");
          shouldTriggerPhotoSync = true;
        } catch (enqueueError) {
          photoLogger.error("photo_job_enqueue_failed", enqueueError, {
            productId: savedProductId,
          });
          toast.error("Foto tersimpan, tapi job background gagal dijadwalkan");
        }
      }
      photoLogger.info("navigate_to_product_list", {
        productId: savedProductId,
        shouldTriggerPhotoSync,
      });
      navigate("/settings/products-categories", { replace: true });
      if (shouldTriggerPhotoSync) {
        photoLogger.info("background_sync_triggered", {
          productId: savedProductId,
        });
        triggerBackgroundPhotoSync(savedProductId);
      }
    } catch (e) {
      photoLogger.error("submit_failed", e, {
        productId: params.id ?? null,
      });
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

            <ImageUpload
              existingAssetId={imageAssetId()}
              existingImageUrl={savedImagePreviewUrl()}
              label="Foto Produk"
              onBusyChange={setIsImageBusy}
              onController={(controller) => {
                imageUpload = controller;
              }}
              onExistingAssetClear={() => setImageAssetId(null)}
              processingKind="image:webp-thumbnail"
            >
              <ImageUpload.Preview alt="Preview foto produk" />
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <ImageUpload.FileName fallback="Pilih foto untuk diunggah sebagai WebP" />
                <ImageUpload.Description>
                  JPG/PNG, akan diproses menjadi WebP 400px.
                </ImageUpload.Description>
                <ImageUpload.StateText />
                <ImageUpload.Error />
                <ImageUpload.Actions>
                  <ImageUpload.Trigger />
                  <ImageUpload.Remove />
                </ImageUpload.Actions>
              </div>
            </ImageUpload>

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
