import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	ApiError,
	createMerchant,
	createOutlet,
	type Merchant,
} from "~/lib/cloud-auth";

type Step = "merchant" | "outlet";

export default function Onboarding() {
	const navigate = useNavigate();
	const [step, setStep] = createSignal<Step>("merchant");
	const [merchantName, setMerchantName] = createSignal("");
	const [outletName, setOutletName] = createSignal("");
	const [outletAddress, setOutletAddress] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
	const [createdMerchant, setCreatedMerchant] = createSignal<Merchant | null>(
		null,
	);

	const handleCreateMerchant = async (e: Event) => {
		e.preventDefault();
		if (!merchantName().trim()) return;

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
		if (!outletName().trim() || !createdMerchant()) return;

		setError("");
		setLoading(true);

		try {
			await createOutlet(
				createdMerchant()!.id,
				outletName().trim(),
				outletAddress().trim() || undefined,
			);
			navigate("/device-pair", { replace: true });
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

	return (
		<div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
			<div class="w-full max-w-sm text-center">
				<h1 class="font-bold text-3xl">Sakti POS</h1>
				<p class="mt-1 text-muted-foreground text-sm">
					{step() === "merchant" ? "Buat bisnis Anda" : "Buat outlet pertama"}
				</p>
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
		</div>
	);
}
