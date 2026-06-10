import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { FormTextField } from "~/components/form/form-text-field";
import { ImageUpload } from "~/components/image-upload";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
  createProduct,
  getCategories,
  getProduct,
  updateProduct,
} from "~/db/menu";
import { resolveAssetUrl } from "~/lib/assets/cache";
import { createImageUpload } from "~/lib/assets/image-upload";
import {
  pluginCompressAsset,
  pluginDeleteAsset,
} from "~/lib/assets/plugin-bridge";
import { createLogger } from "~/lib/logger";
import {
  type ProductFormValues,
  ProductSchema,
} from "~/lib/schema/product-form";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { currentMerchantId } from "~/store/outlet";
import { syncNow } from "~/store/sync";

export default function ProductForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Produk" : "Tambah Produk");

  const categoriesQuery = useDrizzleQuery(["categories"], getCategories);
  const productQuery = useDrizzleQuery(
    () => (isEdit() ? ["product", params.id] : []),
    () => (isEdit() ? getProduct(params.id!) : Promise.resolve(undefined))
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
  const [initializedProductId, setInitializedProductId] = createSignal<
    string | null
  >(null);
  const savedImagePreviewUrlQuery = useDrizzleQuery(
    () => ["product-image-preview", imageAssetId()],
    () =>
      imageAssetId() ? resolveAssetUrl(imageAssetId()!) : Promise.resolve(null)
  );
  const photoLogger = createLogger({
    domain: "PHOTO",
    module: "product-photo",
  });

  const upload = createImageUpload({
    existingAssetId: imageAssetId,
    existingImageUrl: () => savedImagePreviewUrlQuery.data() ?? null,
    onClearExisting: () => setImageAssetId(null),
  });

  const canSubmit = createMemo(() => {
    const input = getInput(form);
    return (
      !!input?.name?.trim() &&
      !!input?.categoryId &&
      !!input?.price?.trim() &&
      !upload.isBusy() &&
      !form.isSubmitting
    );
  });

  createEffect(() => {
    const data = productQuery.data();
    if (!(data && categoriesQuery.data())) {
      return;
    }
    if (initializedProductId() === data.id) {
      return;
    }

    reset(form, {
      initialInput: {
        name: data.name,
        categoryId: data.categoryId ?? "",
        price: String(data.priceMinorUnits),
      },
    });
    setImageAssetId(data.imageAssetId ?? null);
    setError("");
    setInitializedProductId(data.id);
  });

  async function handleEdit(
    values: ProductFormValues,
    merchantId: string
  ): Promise<string | null> {
    const hasNewImage = upload.hasStagedImage();
    const oldImageAssetId = imageAssetId();
    const updatedProduct = await updateProduct(
      params.id ?? "",
      {
        name: values.name,
        categoryId: values.categoryId,
        priceMinorUnits: Number(values.price),
        imageAssetId: imageAssetId(),
      },
      hasNewImage && upload.jobId() && upload.stagedSourcePath()
        ? { jobId: upload.jobId()!, merchantId }
        : undefined
    );

    const nextAssetId = updatedProduct.newImageAssetId ?? imageAssetId();
    if (updatedProduct.newImageAssetId) {
      setImageAssetId(nextAssetId);
      if (oldImageAssetId && oldImageAssetId !== nextAssetId) {
        try {
          await pluginDeleteAsset({ assetPath: oldImageAssetId });
        } catch (cleanupError) {
          photoLogger.error("old_asset_delete_failed", cleanupError, {
            oldImageAssetId,
          });
        }
      }
    }
    photoLogger.info("product_updated", {
      imageAssetId: nextAssetId,
      productId: updatedProduct.id,
    });
    return nextAssetId;
  }

  async function handleCreate(
    values: ProductFormValues,
    merchantId: string
  ): Promise<string | null> {
    const hasNewImage = upload.hasStagedImage();
    const createdProduct = await createProduct(
      {
        name: values.name,
        categoryId: values.categoryId,
        priceMinorUnits: Number(values.price),
        imageAssetId: imageAssetId(),
        merchantId,
      },
      hasNewImage && upload.jobId() && upload.stagedSourcePath()
        ? { jobId: upload.jobId()!, merchantId }
        : undefined
    );

    const nextAssetId = createdProduct.newImageAssetId ?? imageAssetId();
    if (createdProduct.newImageAssetId) {
      setImageAssetId(nextAssetId);
    }
    photoLogger.info("product_created", {
      imageAssetId: nextAssetId,
      productId: createdProduct.id,
    });
    return nextAssetId;
  }

  function triggerCompression(nextAssetId: string | null) {
    const jobId = upload.jobId();
    const stagedSourcePath = upload.stagedSourcePath();
    if (
      !(upload.hasStagedImage() && jobId && stagedSourcePath && nextAssetId)
    ) {
      return;
    }
    pluginCompressAsset({
      assetId: nextAssetId,
      jobId,
      stagedSourcePath,
      maxLongEdge: 400,
      quality: 75,
    }).catch((err: unknown) =>
      photoLogger.error("compress_asset_failed", err, { jobId })
    );
  }

  const handleSave = async (values: ProductFormValues) => {
    try {
      const merchantId = currentMerchantId();
      if (!merchantId) {
        throw new Error("Merchant belum dipilih");
      }

      photoLogger.info("submit_started", {
        hasNewImage: upload.hasStagedImage(),
        isEdit: isEdit(),
        merchantId,
        productId: params.id ?? null,
      });

      const nextAssetId = isEdit()
        ? await handleEdit(values, merchantId)
        : await handleCreate(values, merchantId);

      triggerCompression(nextAssetId);
      photoLogger.info("navigate_to_product_list");
      navigate("/settings/products-categories", { replace: true });
      syncNow().catch(() => {});
    } catch (e) {
      photoLogger.error("submit_failed", e, { productId: params.id ?? null });
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
          when={!isEdit() || (productQuery.data() && categoriesQuery.data())}
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
                      categoriesQuery.data()?.map((cat) => ({
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

            <ImageUpload label="Foto Produk" state={upload}>
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
