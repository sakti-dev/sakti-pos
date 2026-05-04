/* @refresh reload */
import Database from "@tauri-apps/plugin-sql";
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { seedDefaultOwner } from "./lib/auth-provider";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");

async function bootstrap() {
	if (!root) {
		throw new Error("Root element not found");
	}
	try {
		await Database.load("sqlite:sakti-pos.db");
		await seedDefaultOwner();
		render(() => <App />, root);
	} catch (err) {
		render(() => <BootstrapError error={String(err)} />, root);
	}
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

bootstrap();
