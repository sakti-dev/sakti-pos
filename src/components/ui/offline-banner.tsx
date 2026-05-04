import { createSignal, onCleanup, onMount, Show } from "solid-js";

export function OfflineBanner() {
  const [offline, setOffline] = createSignal(!navigator.onLine);

  onMount(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    onCleanup(() => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    });
  });

  return (
    <Show when={offline()}>
      <div class="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-sm text-warning-foreground">
        <svg
          aria-hidden="true"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="1" x2="23" y1="1" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" x2="12.01" y1="20" y2="20" />
        </svg>
        <span>Offline — data tersimpan lokal</span>
      </div>
    </Show>
  );
}
