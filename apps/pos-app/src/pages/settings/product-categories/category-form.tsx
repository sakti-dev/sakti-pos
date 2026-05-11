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
import { createCategory, getCategory, updateCategory } from "~/db/menu";
import {
  type CategoryFormValues,
  CategorySchema,
} from "~/lib/schema/category-form";
import { currentMerchantId } from "~/store/outlet";

export default function CategoryForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Kategori" : "Tambah Kategori");

  const [category] = createResource(
    () => (isEdit() ? params.id : undefined),
    (id) => (id === undefined ? undefined : getCategory(id))
  );

  const form = createForm({
    schema: CategorySchema,
    initialInput: { name: "" },
  });
  const [error, setError] = createSignal("");

  const canSubmit = createMemo(() => {
    const input = getInput(form);
    return !!input?.name?.trim() && !form.isSubmitting;
  });

  createEffect(() => {
    const data = category();
    if (!data) {
      return;
    }

    reset(form, {
      initialInput: { name: data.name },
    });
    setError("");
  });

  const handleSave = async (values: CategoryFormValues) => {
    try {
      if (isEdit()) {
        await updateCategory(params.id ?? "", { name: values.name });
      } else {
        await createCategory({
          name: values.name,
          merchantId: currentMerchantId() ?? "",
        });
      }
      navigate("/settings/products-categories", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan kategori");
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
          when={!isEdit() || category()}
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
                  label="Nama Kategori"
                  placeholder="Contoh: Minuman"
                  required
                  type="text"
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
