import { useNavigate, useParams } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import { countActiveOwners, createUser, getUser, updateUser } from "~/db/users";
import { currentUser } from "~/lib/auth";
import { hashPin } from "~/lib/auth-provider";
import { cn } from "~/lib/utils";

const ROLE_OPTIONS = [
  { value: "cashier", label: "Kasir" },
  { value: "manager", label: "Manajer" },
  { value: "owner", label: "Owner" },
];

export default function UserForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Pengguna" : "Tambah Pengguna");

  const [user] = createResource(
    () => (isEdit() ? Number(params.id) : undefined),
    (id) => (id === undefined ? undefined : getUser(id))
  );

  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal<string | undefined>(undefined);
  const [pin, setPin] = createSignal("");
  const [confirmPin, setConfirmPin] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [deactivateOpen, setDeactivateOpen] = createSignal(false);

  const validate = (): string | null => {
    const trimmed = name().trim();
    if (!trimmed) {
      return "Nama wajib diisi";
    }
    if (!role()) {
      return "Peran wajib dipilih";
    }
    if (!isEdit()) {
      if (pin().length < 6) {
        return "PIN minimal 6 digit";
      }
      if (pin() !== confirmPin()) {
        return "PIN tidak cocok";
      }
    }
    return null;
  };

  const checkBusinessRules = async (): Promise<string | null> => {
    const me = currentUser();
    const targetId = Number(params.id);
    const newRole = role();

    if (isEdit() && me?.id === targetId) {
      if (!isActive()) {
        return "Tidak dapat menonaktifkan akun sendiri";
      }
      if (newRole !== "owner") {
        const ownerCount = await countActiveOwners();
        if (ownerCount <= 1) {
          return "Tidak dapat mengubah peran — Anda satu-satunya owner aktif";
        }
      }
    }

    if (isEdit() && !isActive()) {
      const ownerCount = await countActiveOwners();
      if (ownerCount <= 1 && user()?.role === "owner") {
        return "Tidak dapat menonaktifkan — setidaknya harus ada satu owner aktif";
      }
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isEdit()) {
        const ruleError = await checkBusinessRules();
        if (ruleError) {
          setError(ruleError);
          setLoading(false);
          return;
        }

        await updateUser(Number(params.id), {
          name: name().trim(),
          role: role() as "owner" | "manager" | "cashier",
          isActive: isActive(),
        });
      } else {
        const hashedPin = await hashPin(pin());
        await createUser({
          name: name().trim(),
          role: role() as "owner" | "manager" | "cashier",
          pin: hashedPin,
        });
      }
      navigate("/users", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan pengguna");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async () => {
    setDeactivateOpen(false);
    const ruleError = await checkBusinessRules();
    if (ruleError) {
      setError(ruleError);
      return;
    }
    setIsActive(!isActive());
  };

  const canSave = () => {
    if (!(name().trim() && role()) || loading()) {
      return false;
    }
    if (!isEdit()) {
      return pin().length >= 6 && pin() === confirmPin();
    }
    return true;
  };

  return (
    <>
      <PageHeader backHref="/users">{title()}</PageHeader>
      <div class="flex flex-1 flex-col p-4">
        <Show when={error()}>
          <div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
            {error()}
          </div>
        </Show>

        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center text-muted-foreground">
              Memuat...
            </div>
          }
          when={!isEdit() || user()}
        >
          <div class="flex flex-col gap-4">
            <div>
              <label class="mb-1.5 block font-medium text-sm" for="user-name">
                Nama
              </label>
              <input
                class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                id="user-name"
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Nama pengguna"
                type="text"
                value={isEdit() ? (user()?.name ?? "") : name()}
              />
            </div>

            <div>
              <label class="mb-1.5 block font-medium text-sm" for="user-role">
                Peran
              </label>
              <Select
                label="Peran"
                name="role"
                onChange={(v) => setRole(v == null ? undefined : String(v))}
                options={ROLE_OPTIONS}
                placeholder="Pilih peran"
                value={
                  role() ?? (isEdit() ? user()?.role : undefined) ?? undefined
                }
              />
            </div>

            <Show when={!isEdit()}>
              <div>
                <label class="mb-1.5 block font-medium text-sm" for="user-pin">
                  PIN (6 digit)
                </label>
                <input
                  class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  id="user-pin"
                  inputMode="numeric"
                  onInput={(e) => setPin(e.currentTarget.value)}
                  placeholder="Minimal 6 digit"
                  type="password"
                  value={pin()}
                />
              </div>
              <div>
                <label
                  class="mb-1.5 block font-medium text-sm"
                  for="user-confirm-pin"
                >
                  Konfirmasi PIN
                </label>
                <input
                  class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  id="user-confirm-pin"
                  inputMode="numeric"
                  onInput={(e) => setConfirmPin(e.currentTarget.value)}
                  placeholder="Ulangi PIN"
                  type="password"
                  value={confirmPin()}
                />
              </div>
            </Show>

            <Show when={isEdit()}>
              <div class="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p class="font-medium text-sm">Status Aktif</p>
                  <p class="text-muted-foreground text-xs">
                    {isActive()
                      ? "Pengguna dapat login"
                      : "Pengguna tidak dapat login"}
                  </p>
                </div>
                <button
                  class={cn(
                    "shrink-0 rounded-full px-2.5 py-1 font-medium text-xs",
                    isActive()
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => {
                    if (isActive()) {
                      setDeactivateOpen(true);
                    } else {
                      setIsActive(true);
                    }
                  }}
                  type="button"
                >
                  {isActive() ? "Aktif" : "Nonaktif"}
                </button>
              </div>

              <button
                class="text-primary text-sm underline"
                onClick={() =>
                  navigate(`/users/${params.id}/reset-pin`, {
                    replace: true,
                  })
                }
                type="button"
              >
                Ubah PIN
              </button>
            </Show>
          </div>
        </Show>

        <div class="mt-auto pt-4">
          <Button
            class="w-full"
            disabled={!canSave()}
            onClick={handleSave}
            size="lg"
          >
            {loading() ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>

      <ConfirmDrawer
        message="Nonaktifkan pengguna ini? Mereka tidak akan bisa login."
        onClose={() => setDeactivateOpen(false)}
        onConfirm={handleToggleActive}
        open={deactivateOpen()}
        title="Nonaktifkan Pengguna"
        variant="destructive"
      />
    </>
  );
}
