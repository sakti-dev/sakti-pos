import { createPresence } from "@solid-primitives/presence";
import {
  type RouteSectionProps,
  useLocation,
  useNavigate,
} from "@solidjs/router";
import { clsx } from "clsx";
import {
  TbOutlineClipboard,
  TbOutlineDeviceDesktop,
  TbOutlineMenu2,
  TbOutlinePencil,
  TbOutlineSettings,
  TbOutlineUserPlus,
} from "solid-icons/tb";
import type { JSX } from "solid-js";
import { createEffect, createSignal, For, Show } from "solid-js";
import { Toaster } from "solid-sonner";
import { OfflineBanner } from "~/components/ui/offline-banner";
import { currentUserRole, isAuthenticated } from "~/lib/auth";

const navItems = [
  {
    href: "/pos",
    icon: TbOutlineDeviceDesktop,
    label: "Kasir",
    roles: undefined,
  },
  {
    href: "/orders",
    icon: TbOutlineClipboard,
    label: "Pesanan",
    roles: undefined,
  },
  {
    href: "/menu",
    icon: TbOutlinePencil,
    label: "Menu",
    roles: ["owner", "manager"] as string[],
  },
  {
    href: "/users",
    icon: TbOutlineUserPlus,
    label: "Pengguna",
    roles: ["owner"] as string[],
  },
  {
    href: "/settings",
    icon: TbOutlineSettings,
    label: "Pengaturan",
    roles: undefined,
  },
] as const;

export default function Layout(props: RouteSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = () => location.pathname === "/login";

  createEffect(() => {
    if (!(isLogin() || isAuthenticated())) {
      navigate("/login");
    }
  });

  return (
    <div
      class="flex h-screen flex-col bg-background text-foreground"
      style={{
        padding: "env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0",
      }}
    >
      <OfflineBanner />
      <main class="flex-1 overflow-hidden">{props.children}</main>
      <Toaster />
    </div>
  );
}

interface AppShellProps {
  children: JSX.Element;
  class?: string;
  title: string;
  topbarSuffix?: JSX.Element;
}

export function AppShell(props: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  createEffect(() => {
    setSidebarOpen(false);
  });

  const role = currentUserRole();
  const visibleItems = navItems.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

  const presence = createPresence(sidebarOpen, {
    transitionDuration: 200,
  });

  return (
    <div class={clsx("flex h-full flex-col", props.class)}>
      <header class="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur-sm">
        <button
          aria-label="Menu"
          class="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-accent"
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <TbOutlineMenu2 class="size-6" />
        </button>
        <h1 class="font-semibold text-lg">{props.title}</h1>
        <Show when={props.topbarSuffix}>
          <div class="ml-auto">{props.topbarSuffix}</div>
        </Show>
      </header>
      <div
        class={
          props.class
            ? "flex min-h-0 flex-1"
            : "scrollbar-none flex-1 overflow-y-auto"
        }
      >
        {props.children}
      </div>
      <Show when={presence.isMounted()}>
        <button
          aria-label="Tutup menu"
          class="fixed inset-0 z-50 transition-colors duration-200"
          onClick={() => setSidebarOpen(false)}
          style={{
            "background-color": presence.isVisible()
              ? "rgba(0, 0, 0, 0.5)"
              : "rgba(0, 0, 0, 0)",
          }}
          type="button"
        />
        <nav
          class="fixed left-3 z-50 flex w-72 flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
          style={{
            top: "env(safe-area-inset-top)",
            transition: "max-height 200ms ease, opacity 200ms ease",
            ...(presence.isEntering() && {
              "max-height": "0px",
              opacity: "0",
            }),
            ...(presence.isExiting() && {
              "max-height": "0px",
              opacity: "0",
            }),
            ...(presence.isVisible() && {
              "max-height":
                "calc(100dvh - 1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
              opacity: "1",
            }),
          }}
        >
          <div
            class="flex h-12 items-center gap-3 border-b px-6"
            style={{ ...(presence.isExiting() && { visibility: "hidden" }) }}
          >
            <span class="font-bold text-lg text-primary">Sakti POS</span>
          </div>
          <div
            class="flex flex-col gap-2 overflow-y-auto p-3"
            style={{ ...(presence.isExiting() && { visibility: "hidden" }) }}
          >
            <For each={visibleItems}>
              {(item) => {
                const isActive = () =>
                  location.pathname === item.href ||
                  location.pathname.startsWith(`${item.href}/`);
                return (
                  <button
                    class={clsx(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-3 font-medium text-sm transition-colors",
                      isActive()
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => {
                      setSidebarOpen(false);
                      navigate(item.href, { replace: true });
                    }}
                    type="button"
                  >
                    <item.icon class="h-5 w-5" />
                    <span>{item.label}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </nav>
      </Show>
    </div>
  );
}
