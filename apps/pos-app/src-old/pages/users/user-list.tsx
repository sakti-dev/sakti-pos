import { A, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { AppShell } from "~/components/layout";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { getStaff } from "~/db/staff";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { cn } from "~/lib/utils";

const ROLE_STYLES: Record<string, string> = {
  manager: "bg-blue-600 text-white",
  cashier: "bg-muted text-muted-foreground",
};

const ROLE_LABELS: Record<string, string> = {
  manager: "Manajer",
  cashier: "Kasir",
};

export default function UserList() {
  const navigate = useNavigate();
  const usersQuery = useDrizzleQuery(["staff"], getStaff);

  return (
    <AppShell title="Pengguna">
      <div class="p-4">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-muted-foreground text-sm">
            {usersQuery.data()?.length ?? 0} pengguna
          </p>
          <A href="/users/add">
            <Button size="sm">+ Tambah</Button>
          </A>
        </div>

        <Show
          fallback={
            <Show
              fallback={
                <div class="space-y-2">
                  <For each={[1, 2, 3]}>
                    {() => (
                      <Card class="flex items-center gap-3" size="sm">
                        <Skeleton class="size-10 shrink-0 rounded-full" />
                        <div class="flex-1 space-y-2">
                          <Skeleton class="h-4 w-24" />
                          <Skeleton class="h-3 w-16" />
                        </div>
                      </Card>
                    )}
                  </For>
                </div>
              }
              when={usersQuery.data() !== undefined}
            >
              <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>Belum ada pengguna</p>
                <p class="text-sm">
                  Tap "+ Tambah" untuk membuat pengguna baru
                </p>
              </div>
            </Show>
          }
          when={usersQuery.data() && usersQuery.data()!.length > 0}
        >
          <div class="space-y-2">
            <For each={usersQuery.data()}>
              {(user) => (
                <Card class="flex items-center gap-3" size="sm">
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-lg text-primary-foreground">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{user.name}</p>
                    <div class="flex items-center gap-2">
                      <span
                        class={cn(
                          "rounded-full px-2 py-0.5 font-medium text-xs",
                          ROLE_STYLES[user.role] ?? ""
                        )}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                      <Show when={!user.isActive}>
                        <span class="text-destructive text-xs">Nonaktif</span>
                      </Show>
                    </div>
                  </div>
                  <button
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                    onClick={() => navigate(`/users/${user.id}/edit`)}
                    type="button"
                  >
                    ✏️
                  </button>
                </Card>
              )}
            </For>
          </div>
        </Show>
      </div>
    </AppShell>
  );
}
