/* @refresh reload */
import Database from "@tauri-apps/plugin-sql";
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { seedDefaultManager } from "./lib/auth-provider";
import { loadOutletContext } from "./lib/outlet";
import { runStartupSync } from "./lib/sync";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
const [booted, setBooted] = createSignal(false);
const [bootError, setBootError] = createSignal<string | null>(null);

async function bootstrap() {
	if (!root) {
		throw new Error("Root element not found");
	}

	try {
		await Database.load("sqlite:sakti-pos.db");
		await seedDefaultManager();
		loadOutletContext();
		const syncPromise = runStartupSync();
		const timeout = new Promise((r) => setTimeout(r, 5000));
		await Promise.race([syncPromise, timeout]);
		setBooted(true);
	} catch (err) {
		setBootError(String(err));
	}
}

function Root() {
	return (
		<Show fallback={<App />} when={!booted() && !bootError()}>
			<Show
				fallback={<BootstrapError error={bootError()!} />}
				when={!bootError()}
			>
				<BootSplash />
			</Show>
		</Show>
	);
}

function BootSplash() {
	return (
		<div class="flex h-screen flex-col items-center justify-center bg-primary text-primary-foreground">
			<h1 class="mb-4 font-bold text-4xl">Sakti POS</h1>
			<div class="mb-4 size-8 animate-spin rounded-full border-2 border-current border-b-transparent" />
			<p class="text-sm opacity-80">Memulai aplikasi...</p>
		</div>
	);
}

function BootstrapError(props: { error: string }) {
	const [details, setDetails] = createSignal(false);

	return (
		<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 class="font-bold text-2xl text-destructive">Gagal memuat aplikasi</h1>
			<p class="text-muted-foreground text-sm">
				Terjadi kesalahan saat memulai. Coba restart aplikasi.
			</p>
			<button
				class="text-muted-foreground text-xs underline"
				onClick={() => setDetails(!details())}
				type="button"
			>
				{details() ? "Sembunyikan detail" : "Lihat detail"}
			</button>
			<Show when={details()}>
				<pre class="max-w-full overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-left text-xs">
					{props.error}
				</pre>
			</Show>
		</div>
	);
}

render(() => <Root />, root!);
bootstrap();
