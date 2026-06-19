import { useNavigate, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { Numpad, PinDots } from "~/components/pin";
import {
  ApiError,
  createMerchant,
  createOutlet,
  createStaff as createStaffApi,
  getCurrentCloudStaff,
} from "~/lib/auth/cloud";
import type { Region } from "~/lib/data/regions";
import { createLogger } from "~/lib/logger";
import { setScope } from "~/store/auth";
import { setOutletContext } from "~/store/outlet";
import { syncNow } from "~/store/sync";
import { StepMerchant } from "./components/step-merchant";
import {
  isPhoneValid,
  normalizePhone,
  StepOutlet,
} from "./components/step-outlet";
import { StepPreferences } from "./components/step-preferences";
import { WizardShell } from "./components/wizard-shell";
import { INITIAL_ONBOARDING_FORM, type OnboardingForm } from "./types";

const onboardingLogger = createLogger({
  domain: "AUTH",
  module: "onboarding",
});

const TOTAL_STEPS = 4;

const STEP_META = [
  {
    title: "Profil Bisnis",
    subtitle: "Beri tahu kami nama dan jenis usaha Anda untuk memulai.",
  },
  {
    title: "Setelan Cabang & Lokasi",
    subtitle: "Atur cabang utama dan lokasi usaha Anda.",
  },
  {
    title: "Setelan Kasir Cepat",
    subtitle: "Sedikit preferensi sebelum Anda mulai berjualan.",
  },
  { title: "Buat PIN", subtitle: "Buat PIN 6 digit untuk keamanan akun Anda." },
] as const;

const PREFS_STORAGE_KEY = "sakti-pos:onboarding-prefs";

function savePreferences(form: OnboardingForm) {
  localStorage.setItem(
    PREFS_STORAGE_KEY,
    JSON.stringify({
      business_type: form.business_type,
      initial_cash: form.initial_cash,
      tax_percentage: form.tax_percentage,
      use_tax: form.use_tax,
    })
  );
}

function resolveInitialStep(
  merchantId: string | null,
  outletId: string | null
): number {
  if (merchantId && outletId) {
    return 4;
  }
  if (merchantId) {
    return 2;
  }
  return 1;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const merchantIdFromQuery =
    typeof searchParams.merchantId === "string"
      ? searchParams.merchantId
      : null;
  const outletIdFromQuery =
    typeof searchParams.outletId === "string" ? searchParams.outletId : null;

  const [form, setForm] = createStore<OnboardingForm>({
    ...INITIAL_ONBOARDING_FORM,
  });
  const [step, setStep] = createSignal(
    resolveInitialStep(merchantIdFromQuery, outletIdFromQuery)
  );
  const [nameInvalid, setNameInvalid] = createSignal(false);
  const [phoneInvalid, setPhoneInvalid] = createSignal(false);
  const [regionInvalid, setRegionInvalid] = createSignal(false);
  const [selectedRegionName, setSelectedRegionName] = createSignal<
    string | undefined
  >();
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [createdMerchantId, setCreatedMerchantId] = createSignal<string | null>(
    merchantIdFromQuery
  );
  const [createdOutletId, setCreatedOutletId] = createSignal<string | null>(
    outletIdFromQuery
  );
  const [pin, setPin] = createSignal("");
  const [pinConfirm, setPinConfirm] = createSignal("");
  const [pinError, setPinError] = createSignal("");
  const [pinStep, setPinStep] = createSignal<"first" | "confirm">("first");

  const stepIndex = () => step() - 1;
  const meta = () => STEP_META[stepIndex()];
  const isNameValid = () => form.merchant_name.trim().length >= 3;
  const isRegionValid = () => form.subdistrict_id.length > 0;
  const pinComplete = () =>
    pinStep() === "confirm" && pinConfirm().length === 6;
  const pinLabel = () =>
    pinStep() === "first" ? "Masukkan PIN" : "Konfirmasi PIN";

  const canProceed = createMemo(() => {
    switch (step()) {
      case 1:
        return isNameValid();
      case 2:
        return (
          form.outlet_name.trim().length > 0 &&
          isPhoneValid(form.outlet_phone) &&
          isRegionValid()
        );
      case 3:
        return true;
      case 4:
        return pinComplete();
      default:
        return false;
    }
  });

  function back() {
    if (submitting()) {
      return;
    }
    setError("");
    setNameInvalid(false);
    setPhoneInvalid(false);
    setRegionInvalid(false);
    setPinError("");
    if (step() === 4 && pinStep() === "confirm") {
      setPinStep("first");
      setPinConfirm("");
      return;
    }
    if (step() > 1) {
      setStep((s) => s - 1);
    } else {
      navigate("/auth/register");
    }
  }

  function handleRegionSelect(region: Region) {
    setForm("subdistrict_id", region.id);
    setForm("timezone", region.timezone);
    setSelectedRegionName(region.name);
    setRegionInvalid(false);
  }

  // ── Step 1: Create merchant ───────────────────────────────────────
  async function handleCreateMerchant() {
    if (submitting()) {
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const merchant = await createMerchant(form.merchant_name.trim());
      setCreatedMerchantId(merchant.id);
      onboardingLogger.info("merchant_created", { merchantId: merchant.id });
      setStep(2);
    } catch (err) {
      onboardingLogger.error("create_merchant_failed", err, {
        name: form.merchant_name.trim(),
      });
      setError(err instanceof ApiError ? err.message : "Gagal membuat bisnis");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 2: Create outlet ─────────────────────────────────────────
  async function handleCreateOutlet() {
    const merchantId = createdMerchantId();
    if (!merchantId || submitting()) {
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await createOutlet(
        merchantId,
        form.outlet_name.trim(),
        form.raw_street_address.trim() || undefined
      );
      setOutletContext(
        result.id,
        result.merchantId,
        result.register?.id,
        result.timezone
      );
      setCreatedOutletId(result.id);
      onboardingLogger.info("outlet_created", {
        outletId: result.id,
        merchantId,
      });

      // Check if owner staff already exists
      const { getOwnerStaff } = await import("~/db/staff");
      const existingOwner = await getOwnerStaff(merchantId);
      if (existingOwner) {
        onboardingLogger.info("owner_staff_exists", { merchantId });
        // Skip PIN setup, go to preferences then finish
        setStep(3);
        return;
      }

      setStep(3);
    } catch (err) {
      onboardingLogger.error("create_outlet_failed", err, { merchantId });
      setError(err instanceof ApiError ? err.message : "Gagal membuat outlet");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 4: PIN setup ────────────────────────────────────────────
  function handlePinDigit(digit: string) {
    if (submitting()) {
      return;
    }
    const current = pinStep() === "first" ? pin() : pinConfirm();
    if (current.length >= 6) {
      return;
    }

    if (pinStep() === "first") {
      setPin(current + digit);
      if (current.length + 1 === 6) {
        // Auto-advance to confirm
        setTimeout(() => {
          setPinStep("confirm");
        }, 200);
      }
    } else {
      setPinConfirm(current + digit);
    }
  }

  function handlePinBackspace() {
    if (pinStep() === "first") {
      setPin(pin().slice(0, -1));
    } else {
      if (pinConfirm().length === 0) {
        setPinStep("first");
        return;
      }
      setPinConfirm(pinConfirm().slice(0, -1));
    }
  }

  // ── Final submit (after Step 4) ───────────────────────────────────
  async function submit() {
    if (submitting()) {
      return;
    }
    const merchantId = createdMerchantId();
    if (!merchantId) {
      setError("Data bisnis tidak ditemukan");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // Save preferences to localStorage (pending future DB schema)
      savePreferences({ ...form });

      // If PIN was set, create staff
      if (pin().length === 6 && pin() === pinConfirm()) {
        const session = await (await import("~/lib/auth/cloud")).getSession();
        const ownerName = session.user?.name || "Owner";
        await createStaffApi({
          merchantId,
          outletId: createdOutletId() ?? undefined,
          name: ownerName,
          pin: pin(),
          role: "owner",
        });
        const cloudStaff = await getCurrentCloudStaff(merchantId);
        if (!cloudStaff.staff) {
          setError("Gagal menghubungkan akun cloud dengan staff");
          setSubmitting(false);
          return;
        }
        onboardingLogger.info("owner_staff_created", {
          merchantId,
          staffId: cloudStaff.staff.id,
        });
      }

      setScope(merchantId);
      await syncNow();
      onboardingLogger.info("onboarding_complete", {
        merchantId,
        outletId: createdOutletId(),
      });

      toast.success("Onboarding selesai. Selamat berjualan! 🚀");
      setTimeout(() => navigate("/", { replace: true }), 900);
    } catch (err) {
      onboardingLogger.error("onboarding_failed", err, { merchantId });
      setSubmitting(false);
      setError(
        err instanceof ApiError ? err.message : "Gagal menyelesaikan onboarding"
      );
      toast.error("Gagal menyimpan. Coba lagi.");
    }
  }

  async function handlePrimary() {
    if (step() === 1) {
      await handleCreateMerchant();
      return;
    }
    if (step() === 2) {
      await handleCreateOutlet();
      return;
    }
    if (step() === 3) {
      setStep(4);
      return;
    }
    if (step() === 4) {
      // Validate PIN match
      if (pin() !== pinConfirm()) {
        setPinError("PIN tidak cocok");
        setPinConfirm("");
        setPinStep("first");
        setPin("");
        return;
      }
      await submit();
    }
  }

  return (
    <SafeAreaShell class="bg-background" data-ssgoi-transition="/onboarding">
      <WizardShell
        canProceed={canProceed()}
        onBack={back}
        onNext={handlePrimary}
        step={step()}
        submitLabel={step() === TOTAL_STEPS ? "Mulai Berjualan 🚀" : undefined}
        submitting={submitting()}
        subtitle={meta().subtitle}
        title={meta().title}
        total={TOTAL_STEPS}
      >
        <Show when={error()}>
          <div class="mx-auto mb-4 max-w-md rounded-lg bg-destructive/10 px-3 py-2 text-center text-destructive text-sm">
            {error()}
          </div>
        </Show>

        <Show when={step() === 1}>
          <StepMerchant
            businessType={form.business_type}
            name={form.merchant_name}
            nameInvalid={nameInvalid()}
            onBusinessTypeChange={(v) => setForm("business_type", v)}
            onNameChange={(v) => {
              setForm("merchant_name", v);
              if (nameInvalid() && v.trim().length >= 3) {
                setNameInvalid(false);
              }
            }}
          />
        </Show>

        <Show when={step() === 2}>
          <StepOutlet
            onOutletNameChange={(v) => setForm("outlet_name", v)}
            onOutletPhoneChange={(v) => {
              setForm("outlet_phone", normalizePhone(v));
              if (phoneInvalid() && isPhoneValid(normalizePhone(v))) {
                setPhoneInvalid(false);
              }
            }}
            onRegionSelect={handleRegionSelect}
            onStreetAddressChange={(v) => setForm("raw_street_address", v)}
            outletName={form.outlet_name}
            outletPhone={form.outlet_phone}
            phoneInvalid={phoneInvalid()}
            rawStreetAddress={form.raw_street_address}
            regionInvalid={regionInvalid()}
            selectedLabel={selectedRegionName()}
            subdistrictId={form.subdistrict_id}
          />
        </Show>

        <Show when={step() === 3}>
          <StepPreferences
            initialCash={form.initial_cash}
            onInitialCashChange={(v) => setForm("initial_cash", v)}
            onTaxPercentageChange={(v) =>
              setForm("tax_percentage", Math.min(100, Math.max(0, v)))
            }
            onUseTaxChange={(v) => setForm("use_tax", v)}
            taxPercentage={form.tax_percentage}
            useTax={form.use_tax}
          />
        </Show>

        <Show when={step() === 4}>
          <div class="flex flex-col items-center gap-5">
            <div class="text-center text-muted-foreground text-sm">
              {pinLabel()}
            </div>
            <PinDots
              hasError={!!pinError()}
              length={(pinStep() === "first" ? pin() : pinConfirm()).length}
            />
            <Show when={pinError()}>
              <div class="text-center text-danger text-sm">{pinError()}</div>
            </Show>
            <Numpad
              disabled={submitting()}
              onBackspace={handlePinBackspace}
              onDigit={handlePinDigit}
            />
          </div>
        </Show>
      </WizardShell>
    </SafeAreaShell>
  );
}
