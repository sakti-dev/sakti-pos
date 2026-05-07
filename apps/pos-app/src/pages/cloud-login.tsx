import { useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	ApiError,
	login as cloudLogin,
	register as cloudRegister,
	getGoogleOAuthUrl,
	getShops,
	type Shop,
} from "~/lib/cloud-auth";
import { setShopId } from "~/lib/shop";

type Step = "login" | "register" | "shop-picker";

export default function CloudLogin() {
	const navigate = useNavigate();
	const [step, setStep] = createSignal<Step>("login");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [name, setName] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
	const [shops, setShops] = createSignal<Shop[]>([]);

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			if (step() === "login") {
				await cloudLogin(email(), password());
			} else {
				await cloudRegister(email(), password(), name());
			}

			const userShops = await getShops();
			if (userShops.length > 0) {
				setShops(userShops);
				setStep("shop-picker");
			} else {
				navigate("/onboarding", { replace: true });
			}
		} catch (err) {
			if (err instanceof ApiError) {
				const messages: Record<number, string> = {
					401: "Email atau kata sandi salah",
					409: "Email sudah terdaftar",
				};
				setError(messages[err.status] ?? err.message);
			} else {
				setError("Gagal terhubung ke server");
			}
		} finally {
			setLoading(false);
		}
	};

	const handleSelectShop = (shop: Shop) => {
		setShopId(shop.id);
		navigate("/login", { replace: true });
	};

	const handleGoogle = () => {
		window.open(getGoogleOAuthUrl(), "_blank", "noopener");
	};

	return (
		<div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
			<div class="w-full max-w-sm text-center">
				<h1 class="font-bold text-3xl">Sakti POS</h1>
				<p class="mt-1 text-muted-foreground text-sm">
					{step() === "shop-picker"
						? "Pilih toko"
						: step() === "register"
							? "Buat akun baru"
							: "Masuk ke akun cloud"}
				</p>
			</div>

			<Show
				fallback={
					<div class="flex w-full max-w-sm flex-col items-center gap-3">
						<div class="grid w-full gap-2">
							<For each={shops()}>
								{(shop) => (
									<Button
										class="justify-start"
										variant="outline"
										onClick={() => handleSelectShop(shop)}
									>
										<span class="font-medium">{shop.name}</span>
									</Button>
								)}
							</For>
						</div>
						<Button
							class="w-full"
							onClick={() => navigate("/onboarding", { replace: true })}
							variant="secondary"
						>
							+ Buat toko baru
						</Button>
					</div>
				}
				when={step() === "shop-picker"}
			>
				<form
					class="flex w-full max-w-sm flex-col gap-4"
					onSubmit={handleSubmit}
				>
					<Show when={error()}>
						<div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{error()}
						</div>
					</Show>

					<Show when={step() === "register"}>
						<div class="flex flex-col gap-1.5">
							<label class="font-medium text-sm" for="cloud-name">
								Nama
							</label>
							<input
								autofocus
								class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
								id="cloud-name"
								onInput={(e) => setName(e.currentTarget.value)}
								placeholder="Nama lengkap"
								required
								type="text"
								value={name()}
							/>
						</div>
					</Show>

					<div class="flex flex-col gap-1.5">
						<label class="font-medium text-sm" for="cloud-email">
							Email
						</label>
						<input
							autofocus={step() === "login"}
							class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
							id="cloud-email"
							onInput={(e) => setEmail(e.currentTarget.value)}
							placeholder="email@contoh.com"
							required
							type="email"
							value={email()}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<label class="font-medium text-sm" for="cloud-password">
							Kata Sandi
						</label>
						<input
							class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
							id="cloud-password"
							minlength={step() === "register" ? 8 : undefined}
							onInput={(e) => setPassword(e.currentTarget.value)}
							placeholder={
								step() === "register" ? "Minimal 8 karakter" : "Kata sandi"
							}
							required
							type="password"
							value={password()}
						/>
					</div>

					<Button class="w-full" disabled={loading()} type="submit">
						{loading()
							? "Memproses..."
							: step() === "register"
								? "Daftar"
								: "Masuk"}
					</Button>

					<div class="relative">
						<div class="absolute inset-0 flex items-center">
							<span class="w-full border-t" />
						</div>
						<div class="relative flex justify-center text-xs uppercase">
							<span class="bg-background px-2 text-muted-foreground">atau</span>
						</div>
					</div>

					<Button class="w-full" onClick={handleGoogle} variant="outline">
						Masuk dengan Google
					</Button>

					<div class="text-center text-sm">
						<Show
							fallback={
								<button
									class="text-primary hover:underline"
									onClick={() => setStep("register")}
									type="button"
								>
									Belum punya akun? Daftar
								</button>
							}
							when={step() === "register"}
						>
							<button
								class="text-primary hover:underline"
								onClick={() => setStep("login")}
								type="button"
							>
								Sudah punya akun? Masuk
							</button>
						</Show>
					</div>

					<div class="text-center">
						<button
							class="text-muted-foreground text-sm hover:text-foreground"
							onClick={() => navigate("/login", { replace: true })}
							type="button"
						>
							← Kembali ke PIN login
						</button>
					</div>
				</form>
			</Show>
		</div>
	);
}
