import { useNavigate, useSearchParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import PinPad from "~/components/ui/pinpad";
import { getOwnerStaff } from "~/db/staff";
import {
  ApiError,
  createMerchant,
  createOutlet,
  createStaff as createStaffApi,
  getCurrentCloudStaff,
  getSession,
  type Merchant,
} from "~/lib/auth/cloud";
import { login, setScope } from "~/store/auth";
import { setOutletContext } from "~/store/outlet";
import { syncNow } from "~/store/sync";

type Step = "merchant" | "outlet" | "setup-pin";

export function resolveInitialStep(
  merchantIdFromQuery: string | null,
  outletIdFromQuery: string | null
): Step {
  if (merchantIdFromQuery && outletIdFromQuery) {
    return "setup-pin";
  }
  if (merchantIdFromQuery) {
    return "outlet";
  }
  return "merchant";
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawMerchantId = searchParams.merchantId;
  const merchantIdFromQuery =
    typeof rawMerchantId === "string" ? rawMerchantId : null;
  const rawOutletId = searchParams.outletId;
  const outletIdFromQuery =
    typeof rawOutletId === "string" ? rawOutletId : null;

  const [step, setStep] = createSignal<Step>(
    resolveInitialStep(merchantIdFromQuery, outletIdFromQuery)
  );
  const [merchantName, setMerchantName] = createSignal("");
  const [outletName, setOutletName] = createSignal("");
  const [outletAddress, setOutletAddress] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [createdMerchant, setCreatedMerchant] = createSignal<Merchant | null>(
    merchantIdFromQuery
      ? { id: merchantIdFromQuery, name: "", createdAt: "", updatedAt: "" }
      : null
  );
  const [pin, setPin] = createSignal("");
  const [createdOutletId, setCreatedOutletId] = createSignal<string | null>(
    outletIdFromQuery
  );

  const handleCreateMerchant = async (e: Event) => {
    e.preventDefault();
    if (!merchantName().trim()) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const merchant = await createMerchant(merchantName().trim());
      setCreatedMerchant(merchant);
      setStep("outlet");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Gagal membuat bisnis");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOutlet = async (e: Event) => {
    e.preventDefault();
    const merchant = createdMerchant();
    if (!merchant) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await createOutlet(
        merchant.id,
        outletName().trim(),
        outletAddress().trim() || undefined
      );
      setOutletContext(
        result.id,
        result.merchantId,
        result.register?.id,
        result.timezone
      );
      setCreatedOutletId(result.id);

      const existingOwner = await getOwnerStaff(merchant.id);
      if (existingOwner) {
        navigate("/login", { replace: true });
      } else {
        setStep("setup-pin");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Gagal membuat outlet");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (enteredPin: string) => {
    if (pin().length === 0) {
      setPin(enteredPin);
      return;
    }

    if (pin() !== enteredPin) {
      setError("PIN tidak cocok");
      setPin("");
      return;
    }

    const merchant = createdMerchant();
    if (!merchant) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const session = await getSession();
      const ownerName = session.user?.name || "Owner";
      await createStaffApi({
        merchantId: merchant.id,
        outletId: createdOutletId() ?? undefined,
        name: ownerName,
        pin: pin(),
        role: "owner",
      });
      const cloudStaff = await getCurrentCloudStaff(merchant.id);
      if (!cloudStaff.staff) {
        setError("Gagal menghubungkan akun cloud dengan staff");
        setPin("");
        return;
      }
      await syncNow();
      const activeStaff = await getOwnerStaff(merchant.id);
      if (activeStaff) {
        await login(activeStaff.id, pin());
        setScope(merchant.id);
        navigate("/pos", { replace: true });
      } else {
        setError("Gagal memuat staff setelah sync");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Gagal membuat PIN");
      }
      setPin("");
    } finally {
      setLoading(false);
    }
  };
  const subtitle = () => {
    if (step() === "merchant") {
      return "Buat bisnis Anda";
    }
    if (step() === "outlet") {
      return "Buat outlet pertama";
    }
    return pin().length === 0 ? "Buat PIN" : "Konfirmasi PIN";
  };

  return (
    <div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div class="w-full max-w-sm text-center">
        <h1 class="font-bold text-3xl">Sakti POS</h1>
        <p class="mt-1 text-muted-foreground text-sm">{subtitle()}</p>
      </div>

      <Show when={step() === "merchant"}>
        <form
          class="flex w-full max-w-sm flex-col gap-4"
          onSubmit={handleCreateMerchant}
        >
          <Show when={error()}>
            <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error()}
            </div>
          </Show>

          <div class="flex flex-col gap-1.5">
            <label class="font-medium text-sm" for="merchant-name">
              Nama Bisnis
            </label>
            <input
              autofocus
              class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
              id="merchant-name"
              onInput={(e) => setMerchantName(e.currentTarget.value)}
              placeholder="Contoh: PT Sakti Jaya"
              required
              type="text"
              value={merchantName()}
            />
          </div>

          <Button
            class="w-full"
            disabled={loading() || !merchantName().trim()}
            type="submit"
          >
            {loading() ? "Menyimpan..." : "Lanjutkan"}
          </Button>

          <div class="text-center">
            <button
              class="text-muted-foreground text-sm hover:text-foreground"
              onClick={() => navigate("/cloud-login", { replace: true })}
              type="button"
            >
              ← Kembali
            </button>
          </div>
        </form>
      </Show>

      <Show when={step() === "outlet"}>
        <form
          class="flex w-full max-w-sm flex-col gap-4"
          onSubmit={handleCreateOutlet}
        >
          <Show when={error()}>
            <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error()}
            </div>
          </Show>

          <div class="flex flex-col gap-1.5">
            <label class="font-medium text-sm" for="outlet-name">
              Nama Outlet
            </label>
            <input
              autofocus
              class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
              id="outlet-name"
              onInput={(e) => setOutletName(e.currentTarget.value)}
              placeholder="Contoh: Cabang Sudirman"
              required
              type="text"
              value={outletName()}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-medium text-sm" for="outlet-address">
              Alamat (opsional)
            </label>
            <input
              class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
              id="outlet-address"
              onInput={(e) => setOutletAddress(e.currentTarget.value)}
              placeholder="Jl. Sudirman No. 123"
              type="text"
              value={outletAddress()}
            />
          </div>

          <Button
            class="w-full"
            disabled={loading() || !outletName().trim()}
            type="submit"
          >
            {loading() ? "Menyimpan..." : "Buat Outlet"}
          </Button>

          <div class="text-center">
            <button
              class="text-muted-foreground text-sm hover:text-foreground"
              onClick={() => navigate("/cloud-login", { replace: true })}
              type="button"
            >
              ← Kembali
            </button>
          </div>
        </form>
      </Show>

      <Show when={step() === "setup-pin"}>
        <div class="flex w-full max-w-sm flex-col items-center gap-4">
          <Show when={error()}>
            <div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error()}
            </div>
          </Show>

          <p class="text-center text-sm">
            {pin().length === 0
              ? "Masukkan PIN 6 digit Anda"
              : "Masukkan ulang PIN untuk konfirmasi"}
          </p>

          <PinPad
            disabled={loading()}
            maxLength={6}
            onSubmit={handlePinSubmit}
            resetTrigger={pin().length > 0 ? "confirm" : "first"}
          />
        </div>
      </Show>
    </div>
  );
}
