import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
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
import { productImageAdapter } from "~/lib/assets/adapters/product-images";
import { createImageUpload } from "~/lib/assets/image-upload";
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
      imageAssetId()
        ? productImageAdapter.resolveCachedImageUrl(imageAssetId()!)
        : Promise.resolve(null)
  );
  const photoLogger = createLogger({
    domain: "PHOTO",
    module: "product-photo",
  });

  const upload = createImageUpload({
    existingAssetId: imageAssetId,
    existingImageUrl: () => savedImagePreviewUrlQuery.data() ?? null,
    onClearExisting: () => setImageAssetId(null),
    processingKind: "image:webp-thumbnail",
    onAssetReady: (result) => {
      setImageAssetId(result.contentHash);
      photoLogger.info("asset_ready_received");
      toast.success("Foto siap disimpan");
    },
  });

  const canSubmit = createMemo(() => {
    const input = getInput(form);
    const hasPendingImage = upload.hasStagedImage() && !upload.isReady();
    return (
      !!input?.name?.trim() &&
      !!input?.categoryId &&
      !!input?.price?.trim() &&
      !upload.isBusy() &&
      !hasPendingImage &&
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

  const handleSave = async (values: ProductFormValues) => {
    try {
      const merchantId = currentMerchantId();
      if (!merchantId) {
        throw new Error("Merchant belum dipilih");
      }

      const nextImageAssetId = imageAssetId();
      const data = {
        name: values.name,
        categoryId: values.categoryId,
        priceMinorUnits: Number(values.price),
        imageAssetId: nextImageAssetId,
      };
      photoLogger.info("submit_started", {
        hasExistingAsset: !!nextImageAssetId,
        hasStagedPhoto: upload.hasStagedImage(),
        isEdit: isEdit(),
        merchantId,
        productId: params.id ?? null,
      });

      if (isEdit()) {
        const updatedProduct = await updateProduct(params.id ?? "", data);
        photoLogger.info("product_updated", {
          imageAssetId: data.imageAssetId,
          productId: updatedProduct.id,
        });
      } else {
        const createdProduct = await createProduct({
          ...data,
          merchantId,
        });
        photoLogger.info("product_created", {
          imageAssetId: data.imageAssetId,
          productId: createdProduct.id,
        });
      }

      photoLogger.info("navigate_to_product_list");
      navigate("/settings/products-categories", { replace: true });
      syncNow().catch(() => {});
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
