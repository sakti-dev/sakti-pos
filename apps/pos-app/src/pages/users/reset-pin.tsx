import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { changePin } from "~/lib/auth-provider";

export default function ResetPin() {
	const params = useParams();
	const navigate = useNavigate();

	const [pin, setPin] = createSignal("");
	const [confirmPin, setConfirmPin] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");

	const handleSave = async () => {
		if (pin().length < 6) {
			setError("PIN minimal 6 digit");
			return;
		}
		if (pin() !== confirmPin()) {
			setError("PIN tidak cocok");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await changePin(Number(params.id), pin());
			toast.success("PIN berhasil direset");
			navigate("/users", { replace: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal mengubah PIN");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<PageHeader backHref={`/users/${params.id}/edit`}>Ubah PIN</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Show when={error()}>
					<div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
						{error()}
					</div>
				</Show>

				<div class="flex flex-col gap-4">
					<div>
						<label class="mb-1.5 block font-medium text-sm" for="new-pin">
							PIN Baru (6 digit)
						</label>
						<input
							class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
							id="new-pin"
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
							for="confirm-new-pin"
						>
							Konfirmasi PIN Baru
						</label>
						<input
							class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
							id="confirm-new-pin"
							inputMode="numeric"
							onInput={(e) => setConfirmPin(e.currentTarget.value)}
							placeholder="Ulangi PIN baru"
							type="password"
							value={confirmPin()}
						/>
					</div>
				</div>

				<div class="mt-auto pt-4">
					<Button
						class="w-full"
						disabled={pin().length < 6 || pin() !== confirmPin() || loading()}
						onClick={handleSave}
						size="lg"
					>
						{loading() ? "Menyimpan..." : "Simpan PIN"}
					</Button>
				</div>
			</div>
		</>
	);
}
