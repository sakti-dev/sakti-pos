import {
  TbOutlineChevronRight,
  TbOutlineCloud,
  TbOutlineCloudOff,
} from "solid-icons/tb";
import { Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { PageHeader } from "~/components/ui/page-header";
import { useSettings } from "./use-settings";

export default function CloudSettings() {
  const settings = useSettings();

  return (
    <>
      <PageHeader backHref="/settings">Cloud</PageHeader>
      <div class="space-y-4 p-4">
        <Show when={settings.cloudSession()?.user}>
          <section class="space-y-2">
            <div class="rounded-xl border bg-card">
              <div class="flex items-center gap-3 border-b p-4">
                <TbOutlineCloud class="size-5 shrink-0 text-primary" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-sm">
                    {settings.cloudSession()?.user?.email}
                  </p>
                  <Show when={settings.currentOutletId()}>
                    <p class="text-muted-foreground text-xs">
                      Toko aktif terhubung
                    </p>
                  </Show>
                </div>
              </div>
              <button
                class="flex w-full items-center justify-between p-4 active:bg-accent"
                onClick={() => settings.setShowDisconnectConfirm(true)}
                type="button"
              >
                <span class="text-destructive text-sm">Lepaskan Perangkat</span>
                <TbOutlineCloudOff class="size-5 text-destructive" />
              </button>
            </div>
          </section>
        </Show>

        <Show when={!settings.cloudSession()?.user}>
          <section class="space-y-2">
            <div class="rounded-xl border bg-card">
              <button
                class="flex w-full items-center justify-between p-4 active:bg-accent"
                onClick={settings.handleConnectCloud}
                type="button"
              >
                <span class="text-sm">Hubungkan akun cloud</span>
                <TbOutlineChevronRight class="size-5 text-muted-foreground" />
              </button>
            </div>
          </section>
        </Show>
      </div>

      <ConfirmDrawer
        confirmLabel="Lepaskan"
        message="Perangkat akan dilepas dari outlet ini. Anda perlu login ulang dengan akun cloud atau memasangkan ulang perangkat."
        onClose={() => settings.setShowDisconnectConfirm(false)}
        onConfirm={settings.handleDisconnect}
        open={settings.showDisconnectConfirm()}
        title="Lepaskan Perangkat"
        variant="destructive"
      />
    </>
  );
}
