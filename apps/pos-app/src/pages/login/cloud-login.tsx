import { createForm, Field, Form } from "@formisch/solid";
import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { FormTextField } from "~/components/form/form-text-field";
import { Button } from "~/components/ui/button";
import { GoogleIcon } from "~/components/ui/custom-icon";
import { ApiError, login as cloudLogin } from "~/lib/auth/cloud";
import {
  CloudLoginSchema,
  type CloudLoginValues,
} from "~/lib/schema/cloud-login-form";
import { CloudAuthPickers } from "./cloud-auth-pickers";
import { useCloudAuthFlow } from "./use-cloud-auth-flow";

export default function CloudLogin() {
  const navigate = useNavigate();
  const {
    continueAfterAuth,
    error,
    handleGoogle,
    handleSelectMerchant,
    handleSelectOutlet,
    merchants,
    outlets,
    picking,
    setError,
    setStep,
    step,
  } = useCloudAuthFlow();
  const pickerStep = () =>
    step() === "merchant-picker" ? "merchant-picker" : "outlet-picker";

  const authForm = createForm({
    schema: CloudLoginSchema,
    initialInput: { email: "", password: "" },
  });

  const handleSubmit = async (values: CloudLoginValues) => {
    setError("");
    try {
      await cloudLogin(values.email, values.password);
      await continueAfterAuth();
    } catch (err) {
      if (err instanceof ApiError) {
        const messages: Record<number, string> = {
          401: "Email atau kata sandi salah",
        };
        setError(messages[err.status] ?? err.message);
      } else {
        setError("Gagal terhubung ke server");
      }
    }
  };

  return (
    <div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div class="w-full max-w-sm text-center">
        <h1 class="font-bold text-3xl">Sakti POS</h1>
        <p class="mt-1 text-muted-foreground text-sm">
          {step() === "merchant-picker"
            ? "Pilih bisnis"
            : step() === "outlet-picker"
              ? "Pilih outlet"
              : "Masuk ke akun cloud"}
        </p>
      </div>

      <Show
        when={step() === "auth"}
        fallback={
          <CloudAuthPickers
            error={error()}
            merchants={merchants()}
            onBack={() => {
              setError("");
              setStep("merchant-picker");
            }}
            onSelectMerchant={handleSelectMerchant}
            onSelectOutlet={handleSelectOutlet}
            outlets={outlets()}
            picking={picking()}
            step={pickerStep()}
          />
        }
      >
        <Form
          class="flex w-full max-w-sm flex-col gap-4"
          of={authForm}
          onSubmit={handleSubmit}
        >
          <Show when={error()}>
            <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error()}
            </div>
          </Show>

          <Field of={authForm} path={["email"]}>
            {(field) => (
              <FormTextField
                {...field.props}
                autofocus
                errors={field.errors}
                input={field.input}
                label="Email"
                placeholder="email@contoh.com"
                required
                type="email"
              />
            )}
          </Field>

          <Field of={authForm} path={["password"]}>
            {(field) => (
              <FormTextField
                {...field.props}
                errors={field.errors}
                input={field.input}
                label="Kata Sandi"
                placeholder="Kata sandi"
                required
                type="password"
              />
            )}
          </Field>

          <Button class="w-full" disabled={authForm.isSubmitting} type="submit">
            {authForm.isSubmitting ? "Memproses..." : "Masuk"}
          </Button>

          <div class="text-center text-sm">
            <button
              class="text-primary hover:underline"
              onClick={() => navigate("/cloud-register")}
              type="button"
            >
              Belum punya akun? Daftar
            </button>
          </div>

          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-background px-2 text-muted-foreground">atau</span>
            </div>
          </div>

          <Button
            class="w-full gap-2"
            onClick={handleGoogle}
            type="button"
            variant="outline"
          >
            <GoogleIcon class="size-6" />
            Masuk dengan Google
          </Button>

          <Button
            class="w-full"
            onClick={() => navigate("/device-pair", { replace: true })}
            type="button"
            variant="secondary"
          >
            Sambungkan Perangkat
          </Button>
        </Form>
      </Show>
    </div>
  );
}
