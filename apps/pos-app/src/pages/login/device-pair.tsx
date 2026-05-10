import { useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { ApiError, pairRegister } from "~/lib/auth/cloud";
import { setOutletContext } from "~/store/outlet";

export default function DevicePair() {
	const navigate = useNavigate();
	const [code, setCode] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");

	const handlePair = async (e: Event) => {
		e.preventDefault();

		const pairingCode = code().trim();
		if (pairingCode.length !== 8) {
			setError("Kode harus 8 karakter");
			return;
		}

		setError("");
		setLoading(true);

		try {
			const result = await pairRegister(pairingCode);
			setOutletContext(
				result.outlet.id,
				result.outlet.merchantId,
				result.register.id,
			);
			navigate("/login", { replace: true });
		} catch (err) {
			if (err instanceof ApiError) {
				const messages: Record<number, string> = {
					404: "Kode tidak ditemukan",
					410: "Kode sudah kadaluarsa",
					409: "Perangkat sudah dipasangkan",
				};
				setError(messages[err.status] ?? err.message);
			} else {
				setError("Gagal terhubung ke server");
			}
		} finally {
			setLoading(false);
		}
	};

	const handleDigitInput = (e: InputEvent) => {
		const target = e.currentTarget as HTMLInputElement;
		const digits = target.value
			.replace(/[^A-Z0-9]/gi, "")
			.toUpperCase()
			.slice(0, 8);
		setCode(digits);
		target.value = digits;
	};

	return (
		<div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
			<div class="w-full max-w-sm text-center">
				<div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
					<svg
						aria-label="Smartphone"
						class="size-8 text-primary"
						fill="none"
						role="img"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<title>Smartphone</title>
						<path
							d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<h1 class="font-bold text-3xl">Pasang Perangkat</h1>
				<p class="mt-1 text-muted-foreground text-sm">
					Masukkan kode 8 karakter dari pengaturan kasir
				</p>
			</div>

			<form class="flex w-full max-w-sm flex-col gap-4" onSubmit={handlePair}>
				<Show when={error()}>
					<div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
						{error()}
					</div>
				</Show>

				<div class="flex justify-center gap-2">
					<For each={Array.from({ length: 8 }, (_, i) => i)}>
						{(index) => (
							<div
								class="flex size-12 items-center justify-center rounded-xl border-2 border-input bg-background font-mono text-2xl font-bold transition-colors"
								classList={{
									"border-primary": code().length > index,
								}}
							>
								{code()[index] ?? ""}
							</div>
						)}
					</For>
				</div>

				<input
					autofocus
					class="absolute h-0 w-0 opacity-0"
					inputMode="text"
					maxlength={8}
					onInput={handleDigitInput}
					pattern="[A-Z0-9]*"
					type="text"
					value={code()}
				/>

				<Button
					class="w-full"
					disabled={loading() || code().length !== 8}
					type="submit"
				>
					{loading() ? "Memasangkan..." : "Pasang Perangkat"}
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
		</div>
	);
}
