import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import type { Region } from "~/lib/data/regions";
import { StepMerchant } from "./components/step-merchant";
import {
  isPhoneValid,
  normalizePhone,
  StepOutlet,
} from "./components/step-outlet";
import { StepPreferences } from "./components/step-preferences";
import { WizardShell } from "./components/wizard-shell";
import { INITIAL_ONBOARDING_FORM, type OnboardingForm } from "./types";

const TOTAL_STEPS = 3;

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
] as const;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [form, setForm] = createStore<OnboardingForm>({
    ...INITIAL_ONBOARDING_FORM,
  });

  const [step, setStep] = createSignal(1);
  const [nameInvalid, setNameInvalid] = createSignal(false);
  const [phoneInvalid, setPhoneInvalid] = createSignal(false);
  const [regionInvalid, setRegionInvalid] = createSignal(false);
  const [selectedRegionName, setSelectedRegionName] = createSignal<
    string | undefined
  >();
  const [submitting, setSubmitting] = createSignal(false);

  const stepIndex = () => step() - 1;
  const meta = () => STEP_META[stepIndex()];

  const isNameValid = () => form.merchant_name.trim().length >= 3;
  const isRegionValid = () => form.subdistrict_id.length > 0;

  // Per-step gate. The "Next" button reflects the current step's validity.
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
      default:
        return false;
    }
  });

  function next() {
    // Re-validate the current step before advancing; surface inline errors.
    if (step() === 1) {
      const ok = isNameValid();
      setNameInvalid(!ok);
      if (!ok) {
        return;
      }
    }
    if (step() === 2) {
      const phoneOk = isPhoneValid(form.outlet_phone);
      const regionOk = isRegionValid();
      setPhoneInvalid(!phoneOk);
      setRegionInvalid(!regionOk);
      if (!(phoneOk && regionOk)) {
        return;
      }
    }
    if (step() < TOTAL_STEPS) {
      setStep((s) => s + 1);
    }
  }

  function back() {
    if (submitting()) {
      return;
    }
    setNameInvalid(false);
    setPhoneInvalid(false);
    setRegionInvalid(false);
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

  // ── Submit ──────────────────────────────────────────────────────
  // Builds the single onboarding payload the backend controller wraps in
  // one transaction (merchants → outlets → session context). Until the
  // Eden/API client is wired, this mirrors the auth pages' mock-then-
  // navigate convention. Replace `mockSubmit` with the real typed call.
  async function submit() {
    if (submitting()) {
      return;
    }
    setSubmitting(true);
    try {
      await mockSubmit({ ...form });
      toast.success("Onboarding selesai. Selamat berjualan! 🚀");
      // Active merchant/outlet context is set server-side in the real flow;
      // land on the home dashboard. replace:true so the user can't back
      // into a completed onboarding (same pattern as payment → receipt).
      setTimeout(() => navigate("/", { replace: true }), 900);
    } catch (err) {
      setSubmitting(false);
      toast.error("Gagal menyimpan onboarding. Coba lagi.");
      // Re-throw so the error is visible to the caller/logger, not swallowed.
      throw err;
    }
  }

  async function handlePrimary() {
    if (step() < TOTAL_STEPS) {
      next();
      return;
    }
    try {
      await submit();
    } catch {
      // Error already surfaced via toast inside submit().
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
        <Show when={step() === 1}>
          <StepMerchant
            businessType={form.business_type}
            name={form.merchant_name}
            nameInvalid={nameInvalid()}
            onBusinessTypeChange={(v) => {
              setForm("business_type", v);
            }}
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
            onTaxPercentageChange={(v) => {
              // Clamp to a sane 0–100 range.
              setForm("tax_percentage", Math.min(100, Math.max(0, v)));
            }}
            onUseTaxChange={(v) => setForm("use_tax", v)}
            taxPercentage={form.tax_percentage}
            useTax={form.use_tax}
          />
        </Show>
      </WizardShell>
    </SafeAreaShell>
  );
}

/** MOCK — replace with the typed Eden/API onboarding call. Kept local so the
 *  contract (one payload → one transaction) is visible at the call site.
 *
 *  When the real call lands: route through `~/lib/logger.ts` under the
 *  `[JS] [POS:ONBOARDING_SUBMIT]` prefix (see docs/knowledge/APP-LOGGING-DOCS.md)
 *  and update LOG_FILTER in logs/capture-adb-logcat.sh. */
function mockSubmit(_payload: OnboardingForm): Promise<{ ok: true }> {
  return new Promise((resolve) =>
    setTimeout(() => resolve({ ok: true }), 1400)
  );
}
