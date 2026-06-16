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

export function RightPanel() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [emailInvalid, setEmailInvalid] = createSignal(false);
  const [passwordInvalid, setPasswordInvalid] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    const emailOk = EMAIL_RE.test(email().trim());
    const pwOk = password().length >= 6;

    setEmailInvalid(!emailOk);
    setPasswordInvalid(!pwOk);

    if (!(emailOk && pwOk)) {
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Login berhasil! Mengalihkan...");
    }, 1800);
  }

  return (
    <AuthRightPanel
      footer={
        <>
          Belum punya akun?{" "}
          <Link href="/auth/register" variant="emphasis">
            Daftar sekarang
          </Link>
        </>
      }
      googleLabel="Masuk dengan Google"
      subtitle="Masukkan email dan password untuk melanjutkan ke dashboard."
      title="Masuk ke akun Anda"
    >
      <form class="relative z-10" novalidate onSubmit={handleSubmit}>
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
              autocomplete="current-password"
              class="pr-12"
              id="password"
              placeholder="Masukkan password"
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

        {/* Forgot password */}
        <div class="mt-0.5 mb-4 text-right">
          <Link href="/forgot-password">Lupa password?</Link>
        </div>

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
            <span>Masuk</span>
          </Show>
        </Button>
      </form>
    </AuthRightPanel>
  );
}
