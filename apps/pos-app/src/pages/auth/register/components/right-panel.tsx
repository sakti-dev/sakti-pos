import { createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import { EyeClosedIcon, EyeOpenIcon } from "~/assets";
import { AuthRightPanel } from "~/components/auth-right-panel";
import { Button } from "~/components/ui/button";
import { Link } from "~/components/ui/link";
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { cn } from "~/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RegisterRightPanel = () => {
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

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    const nameOk = name().trim().length > 0;
    const emailOk = EMAIL_RE.test(email().trim());
    const pwOk = password().length >= 6;
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
    setTimeout(() => {
      setLoading(false);
      toast.success("Registrasi berhasil! Mengalihkan...");
    }, 1800);
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
      subtitle="Daftar untuk mulai mengelola bisnis Anda dengan Nata POS."
      title="Buat akun baru"
    >
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
              placeholder="Minimal 6 karakter"
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
            Password minimal 6 karakter
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
            loading() && "pointer-events-none opacity-70"
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
    </AuthRightPanel>
  );
};
