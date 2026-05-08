/* @refresh reload */
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { loadOutletContext } from "./store/outlet";
import { runStartupSync } from "./store/sync";
import "./index.css";
import App from "./App";

loadOutletContext();

const [booted, setBooted] = createSignal(false);
const [bootError, setBootError] = createSignal<string | null>(null);

async function bootstrap() {
	try {
		await Promise.race([
			runStartupSync(),
			new Promise((r) => setTimeout(r, 5000)),
		]);
	} catch (err) {
		setBootError(String(err));
	} finally {
		setBooted(true);
	}
}

function Root() {
	return (
		<Show when={booted() || bootError()} fallback={<BootSplash />}>
			<Show
				when={!bootError()}
				fallback={<BootstrapError error={bootError()!} />}
			>
				<App />
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

const root = document.getElementById("root");
render(() => <Root />, root!);
bootstrap();
