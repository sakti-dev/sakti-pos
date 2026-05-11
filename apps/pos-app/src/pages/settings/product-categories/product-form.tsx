import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Show,
} from "solid-js";
import { FormTextField } from "~/components/form/form-text-field";
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
  type ProductFormValues,
  ProductSchema,
} from "~/lib/schema/product-form";
import { currentMerchantId } from "~/store/outlet";

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
      imageUrl: "",
    },
  });
  const [error, setError] = createSignal("");

  const canSubmit = createMemo(() => {
    const input = getInput(form);
    return (
      !!input?.name?.trim() &&
      !!input?.categoryId &&
      !!input?.price?.trim() &&
      !form.isSubmitting
    );
  });

  createEffect(() => {
    const data = product();
    if (!(data && categories())) {
      return;
    }

    reset(form, {
      initialInput: {
        name: data.name,
        categoryId: data.categoryId ?? "",
        price: String(data.price),
        imageUrl: data.imageUrl ?? "",
      },
    });
    setError("");
  });

  const handleSave = async (values: ProductFormValues) => {
    try {
      const data = {
        name: values.name,
        categoryId: values.categoryId,
        price: values.price,
        imageUrl: values.imageUrl === "" ? null : values.imageUrl,
      };

      if (isEdit()) {
        await updateProduct(params.id ?? "", data);
      } else {
        await createProduct({
          ...data,
          merchantId: currentMerchantId() ?? "",
        });
      }
      navigate("/menu/products", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan produk");
    }
  };

  return (
    <>
      <PageHeader backHref="/menu/products">{title()}</PageHeader>
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

            <Field of={form} path={["imageUrl"]}>
              {(field) => (
                <FormTextField
                  {...field.props}
                  errors={field.errors}
                  input={field.input}
                  label="URL Gambar"
                  placeholder="https://..."
                  type="url"
                />
              )}
            </Field>

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
