import { useColorMode } from "@kobalte/core";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import {
  BagIcon,
  ChartIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  GoogleIcon,
  GridDetailIcon,
  MoonIcon,
  SunIcon,
} from "~/assets";
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

const ghostCards = [
  {
    Icon: GridDetailIcon,
    label: "Pembayaran",
    class: "w-[90px] bottom-10 right-4 opacity-65",
    lineWidths: ["65%", "80%"],
    anim: "animate-ghost-3",
  },
  {
    Icon: ChartIcon,
    label: "Laporan",
    class: "w-[85px] bottom-10 left-4 opacity-65",
    lineWidths: ["60%", "75%"],
    anim: "animate-ghost-4",
  },
  {
    Icon: BagIcon,
    label: "Pesanan",
    class: "w-[95px] top-[140px] right-4 opacity-60",
    lineWidths: ["50%", "65%"],
    anim: "animate-ghost-2",
  },
  {
    Icon: ChartIcon,
    label: "Invoice",
    class: "w-[100px] top-[140px] left-4 opacity-70",
    lineWidths: ["55%", "70%"],
    anim: "animate-ghost-1",
  },
] as const;

export function RightPanel() {
  const { colorMode, setColorMode } = useColorMode();

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
    <div class="relative flex w-full flex-col justify-center overflow-y-auto bg-background p-8 lg:w-[480px] lg:min-w-[420px] lg:px-14 lg:py-10">
      <For each={ghostCards}>
        {(gc) => (
          <div
            class={cn(
              "pointer-events-none absolute z-0 flex flex-col items-center rounded-[10px] border-[1.5px] border-[rgba(9,73,51,0.12)] bg-[rgba(9,73,51,0.04)] backdrop-blur-[2px] dark:border-[rgba(60,208,112,0.10)] dark:bg-[rgba(60,208,112,0.03)]",
              gc.class,
              gc.anim
            )}
          >
            <div class="flex items-center justify-center p-3 pb-1">
              <gc.Icon class="h-6 w-6 text-[rgba(9,73,51,0.45)] dark:text-[rgba(60,208,112,0.45)]" />
            </div>
            <For each={gc.lineWidths}>
              {(w) => (
                <div
                  class="mx-2 my-1 h-1.5 rounded-[3px] bg-[rgba(9,73,51,0.08)] dark:bg-[rgba(60,208,112,0.08)]"
                  style={{ width: w }}
                />
              )}
            </For>
            <div class="px-2 pb-2 text-center font-semibold text-[9px] text-[rgba(9,73,51,0.50)] uppercase tracking-[0.04em] dark:text-[rgba(60,208,112,0.55)]">
              {gc.label}
            </div>
          </div>
        )}
      </For>

      {/* Theme toggle */}
      <Button
        aria-label="Toggle tema"
        class="absolute top-5 right-6 z-[2] grid size-9 place-items-center rounded-xs border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-offset-2"
        look="ghost"
        onClick={() => setColorMode(colorMode() === "dark" ? "light" : "dark")}
        tone="neutral"
      >
        <Show
          fallback={<MoonIcon class="h-[18px] w-[18px]" />}
          when={colorMode() !== "dark"}
        >
          <SunIcon class="h-[18px] w-[18px]" />
        </Show>
      </Button>

      {/* Mobile logo (≤lg) */}
      <div class="mb-6 flex flex-col items-center gap-3 lg:hidden">
        <img
          alt="Nata POS"
          class="h-12 w-12 rounded-sm object-contain"
          height={48}
          src="/logo.png"
          width={48}
        />
        <span class="font-bold text-[22px] text-primary tracking-[-0.01em] dark:text-foreground">
          Nata POS
        </span>
      </div>

      {/* Form header */}
      <div class="relative z-[1] mb-7 text-center lg:text-left">
        <h1 class="mb-1.5 font-bold text-[26px] tracking-[-0.01em]">
          Masuk ke akun Anda
        </h1>
        <p class="text-muted-foreground text-sm leading-relaxed">
          Masukkan email dan password untuk melanjutkan ke dashboard.
        </p>
      </div>

      {/* Login form */}
      <form class="relative z-[1]" novalidate onSubmit={handleSubmit}>
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
          <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-[height,opacity] duration-[200ms] ease-[ease] data-[invalid]:h-[18px] data-[invalid]:opacity-100">
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
              class="absolute top-1/2 right-3 -translate-y-1/2 place-items-center rounded-xs bg-transparent text-muted-foreground hover:bg-primary-light hover:text-muted-foreground focus-visible:outline-offset-2"
              look="ghost"
              onClick={() => setShowPassword((s) => !s)}
              size="icon-xs"
              tone="neutral"
              type="button"
            >
              <Show
                fallback={<EyeClosedIcon class="h-[18px] w-[18px]" />}
                when={!showPassword()}
              >
                <EyeOpenIcon class="h-[18px] w-[18px]" />
              </Show>
            </Button>
          </div>
          <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-[height,opacity] duration-[200ms] ease-[ease] data-[invalid]:h-[18px] data-[invalid]:opacity-100">
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
              <div class="h-[18px] w-[18px] animate-spin rounded-full border-2 border-[rgba(255,255,255,0.3)] border-t-white" />
            }
            when={!loading()}
          >
            <span>Masuk</span>
          </Show>
        </Button>
      </form>

      {/* Divider */}
      <div class="relative z-[1] my-6 flex items-center gap-4">
        <div class="h-px flex-1 bg-border" />
        <span class="text-muted-foreground text-xs uppercase tracking-[0.06em]">
          atau
        </span>
        <div class="h-px flex-1 bg-border" />
      </div>

      <Button
        class="relative z-[1] w-full"
        look="outline"
        onClick={() => toast.success("Menghubungkan ke Google...")}
        size="lg"
        tone="neutral"
      >
        <GoogleIcon class="h-5 w-5 shrink-0" />
        Masuk dengan Google
      </Button>
      {/* Footer */}
      <div class="relative z-[1] mt-7 text-center text-[13px] text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/register" variant="emphasis">
          Daftar sekarang
        </Link>
      </div>
    </div>
  );
}
