import { createSignal, For, Show } from "solid-js";
import { ChevronLeftIcon, EyeClosedIcon, EyeOpenIcon } from "~/assets";
import { AuthRightPanel } from "~/components/auth-right-panel";
import { Button } from "~/components/ui/button";
import { Link } from "~/components/ui/link";
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { ApiError, type Outlet, type SessionMerchant } from "~/lib/auth/cloud";
import { cn } from "~/lib/utils";
import {
  type CloudAuthStep,
  useCloudAuthFlow,
} from "~/pages/auth/use-cloud-auth-flow";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export const RegisterRightPanel = () => {
  const {
    continueAfterAuth,
    error: flowError,
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
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [nameInvalid, setNameInvalid] = createSignal(false);
  const [emailInvalid, setEmailInvalid] = createSignal(false);
  const [passwordInvalid, setPasswordInvalid] = createSignal(false);
  const [confirmInvalid, setConfirmInvalid] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

  const isAuth = () => step() === "auth";
  const pickerStep = (): Exclude<CloudAuthStep, "auth"> =>
    step() === "merchant-picker" ? "merchant-picker" : "outlet-picker";
  const subtitle = () => {
    if (step() === "merchant-picker") {
      return "Pilih bisnis";
    }
    if (step() === "outlet-picker") {
      return "Pilih outlet";
    }
    return "Daftar untuk mulai mengelola bisnis Anda dengan Nata POS.";
  };

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError("");

    const nameOk = name().trim().length > 0;
    const emailOk = EMAIL_RE.test(email().trim());
    const pwOk = password().length >= MIN_PASSWORD;
    const confirmOk =
      confirmPassword() === password() && confirmPassword().length > 0;

    setNameInvalid(!nameOk);
    setEmailInvalid(!emailOk);
    setPasswordInvalid(!pwOk);
    setConfirmInvalid(!confirmOk);

    if (!(nameOk && emailOk && pwOk && confirmOk)) {
      return;
    }

    setLoading(true);
    try {
      const { register: cloudRegister } = await import("~/lib/auth/cloud");
      await cloudRegister(email().trim(), password(), name().trim());
      await continueAfterAuth();
    } catch (err) {
      if (err instanceof ApiError) {
        const messages: Record<number, string> = {
          401: "Email atau kata sandi salah",
          409: "Email sudah terdaftar",
        };
        setError(messages[err.status] ?? err.message);
      } else {
        setError("Gagal terhubung ke server");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError("");
    if (step() === "outlet-picker") {
      setStep("merchant-picker");
    } else {
      setStep("auth");
    }
  }

  return (
    <AuthRightPanel
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href="/auth/login" variant="emphasis">
            Masuk
          </Link>
        </>
      }
      googleLabel="Daftar dengan Google"
      onGoogle={handleGoogle}
      subtitle={subtitle()}
      title="Buat akun baru"
    >
      <Show
        fallback={
          <PickerView
            error={flowError()}
            merchants={merchants()}
            onBack={handleBack}
            onSelectMerchant={handleSelectMerchant}
            onSelectOutlet={handleSelectOutlet}
            outlets={outlets()}
            picking={picking()}
            step={pickerStep()}
          />
        }
        when={isAuth()}
      >
        <Show when={flowError()}>
          <div class="relative z-10 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
            {flowError()}
          </div>
        </Show>

        <form class="relative z-10" novalidate onSubmit={handleSubmit}>
          {/* Name */}
          <TextField
            class="mb-[18px]"
            onChange={(v) => {
              setName(v);
              setNameInvalid(false);
            }}
            validationState={nameInvalid() ? "invalid" : "valid"}
            value={name()}
          >
            <TextFieldLabel for="name">Nama</TextFieldLabel>
            <TextFieldInput
              autocomplete="name"
              id="name"
              placeholder="Nama lengkap Anda"
              required
              type="text"
            />
            <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-all duration-standard ease-standard data-[invalid]:h-5 data-[invalid]:opacity-100">
              Nama tidak boleh kosong
            </TextFieldErrorMessage>
          </TextField>

          {/* Email */}
          <TextField
            class="mb-[18px]"
            onChange={(v) => {
              setEmail(v);
              setEmailInvalid(false);
            }}
            validationState={emailInvalid() ? "invalid" : "valid"}
            value={email()}
          >
            <TextFieldLabel for="email">Email</TextFieldLabel>
            <TextFieldInput
              autocomplete="email"
              id="email"
              placeholder="nama@contoh.com"
              required
              type="email"
            />
            <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-all duration-standard ease-standard data-[invalid]:h-5 data-[invalid]:opacity-100">
              Format email tidak valid
            </TextFieldErrorMessage>
          </TextField>

          {/* Password */}
          <TextField
            class="mb-[18px]"
            onChange={(v) => {
              setPassword(v);
              setPasswordInvalid(false);
            }}
            validationState={passwordInvalid() ? "invalid" : "valid"}
            value={password()}
          >
            <TextFieldLabel for="password">Password</TextFieldLabel>
            <div class="relative">
              <TextFieldInput
                autocomplete="new-password"
                class="pr-12"
                id="password"
                placeholder={`Minimal ${MIN_PASSWORD} karakter`}
                required
                type={showPassword() ? "text" : "password"}
              />
              <Button
                aria-label={
                  showPassword() ? "Sembunyikan password" : "Tampilkan password"
                }
                class="absolute top-1/2 right-3 -translate-y-1/2 place-items-center rounded-xs bg-transparent text-muted-foreground hover:bg-primary/5 hover:text-muted-foreground focus-visible:outline-offset-2"
                look="ghost"
                onClick={() => setShowPassword((s) => !s)}
                size="icon-sm"
                tone="neutral"
                type="button"
              >
                <Show
                  fallback={<EyeClosedIcon class="size-5" />}
                  when={!showPassword()}
                >
                  <EyeOpenIcon class="size-5" />
                </Show>
              </Button>
            </div>
            <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-all duration-standard ease-standard data-[invalid]:h-5 data-[invalid]:opacity-100">
              Password minimal {MIN_PASSWORD} karakter
            </TextFieldErrorMessage>
          </TextField>

          {/* Confirm Password */}
          <TextField
            class="mb-[18px]"
            onChange={(v) => {
              setConfirmPassword(v);
              setConfirmInvalid(false);
            }}
            validationState={confirmInvalid() ? "invalid" : "valid"}
            value={confirmPassword()}
          >
            <TextFieldLabel for="confirmPassword">
              Konfirmasi Password
            </TextFieldLabel>
            <div class="relative">
              <TextFieldInput
                autocomplete="new-password"
                class="pr-12"
                id="confirmPassword"
                placeholder="Ulangi password"
                required
                type={showConfirm() ? "text" : "password"}
              />
              <Button
                aria-label={
                  showConfirm() ? "Sembunyikan password" : "Tampilkan password"
                }
                class="absolute top-1/2 right-3 -translate-y-1/2 place-items-center rounded-xs bg-transparent text-muted-foreground hover:bg-primary/5 hover:text-muted-foreground focus-visible:outline-offset-2"
                look="ghost"
                onClick={() => setShowConfirm((s) => !s)}
                size="icon-sm"
                tone="neutral"
                type="button"
              >
                <Show
                  fallback={<EyeClosedIcon class="size-5" />}
                  when={!showConfirm()}
                >
                  <EyeOpenIcon class="size-5" />
                </Show>
              </Button>
            </div>
            <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-all duration-standard ease-standard data-[invalid]:h-5 data-[invalid]:opacity-100">
              Password tidak cocok
            </TextFieldErrorMessage>
          </TextField>

          {/* Submit */}
          <Button
            class={cn(
              "mt-2 w-full",
              (loading() || picking()) && "pointer-events-none opacity-70"
            )}
            size="xl"
            type="submit"
          >
            <Show
              fallback={
                <div class="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              }
              when={!loading()}
            >
              <span>Daftar</span>
            </Show>
          </Button>
        </form>
      </Show>
    </AuthRightPanel>
  );
};

function PickerView(props: {
  error: string;
  merchants: SessionMerchant[];
  onBack: () => void;
  onSelectMerchant: (m: SessionMerchant) => void;
  onSelectOutlet: (o: Outlet) => void;
  outlets: Outlet[];
  picking: boolean;
  step: Exclude<CloudAuthStep, "auth">;
}) {
  return (
    <div class="relative z-10 flex w-full flex-col gap-3">
      <Show when={props.error}>
        <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {props.error}
        </div>
      </Show>

      <Show
        fallback={
          <div class="grid w-full gap-2">
            <For each={props.outlets}>
              {(outlet) => (
                <Button
                  class="justify-start"
                  disabled={props.picking}
                  look="outline"
                  onClick={() => props.onSelectOutlet(outlet)}
                >
                  <div class="text-left">
                    <span class="block font-medium">{outlet.name}</span>
                    <Show when={outlet.address}>
                      <span class="block text-muted-foreground text-xs">
                        {outlet.address}
                      </span>
                    </Show>
                  </div>
                </Button>
              )}
            </For>
            <Button
              class="w-full"
              look="ghost"
              onClick={props.onBack}
              tone="neutral"
            >
              <ChevronLeftIcon class="size-4" />
              Kembali ke pilih bisnis
            </Button>
          </div>
        }
        when={props.step === "merchant-picker"}
      >
        <div class="grid w-full gap-2">
          <For each={props.merchants}>
            {(merchant) => (
              <Button
                class="justify-start"
                disabled={props.picking}
                look="outline"
                onClick={() => props.onSelectMerchant(merchant)}
              >
                <span class="font-medium">{merchant.name}</span>
              </Button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
