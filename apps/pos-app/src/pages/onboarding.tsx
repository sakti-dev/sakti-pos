import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { ApiError, createShop } from "~/lib/cloud-auth";
import { setShopId } from "~/lib/shop";

export default function Onboarding() {
	const navigate = useNavigate();
	const [shopName, setShopName] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		if (!shopName().trim()) return;

		setError("");
		setLoading(true);

		try {
			const shop = await createShop(shopName().trim());
			setShopId(shop.id);
			navigate("/login", { replace: true });
		} catch (err) {
			if (err instanceof ApiError) {
				setError(err.message);
			} else {
				setError("Gagal membuat toko");
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
			<div class="w-full max-w-sm text-center">
				<h1 class="font-bold text-3xl">Sakti POS</h1>
				<p class="mt-1 text-muted-foreground text-sm">Buat toko pertama Anda</p>
			</div>

			<form class="flex w-full max-w-sm flex-col gap-4" onSubmit={handleSubmit}>
				<Show when={error()}>
					<div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
						{error()}
					</div>
				</Show>

				<div class="flex flex-col gap-1.5">
					<label class="font-medium text-sm" for="shop-name">
						Nama Toko
					</label>
					<input
						autofocus
						class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
						id="shop-name"
						onInput={(e) => setShopName(e.currentTarget.value)}
						placeholder="Contoh: Toko Sakti"
						required
						type="text"
						value={shopName()}
					/>
				</div>

				<Button
					class="w-full"
					disabled={loading() || !shopName().trim()}
					type="submit"
				>
					{loading() ? "Menyimpan..." : "Buat Toko"}
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
