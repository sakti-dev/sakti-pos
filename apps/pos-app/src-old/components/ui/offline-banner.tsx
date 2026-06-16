import { TbOutlineWifiOff } from "solid-icons/tb";
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
        <TbOutlineWifiOff class="size-4" />
        <span>Offline — data tersimpan lokal</span>
      </div>
    </Show>
  );
}
