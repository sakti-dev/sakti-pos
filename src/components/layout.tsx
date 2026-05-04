import {
  type RouteSectionProps,
  useLocation,
  useNavigate,
} from "@solidjs/router";
import { clsx } from "clsx";
import type { JSX } from "solid-js";
import {
  type ComponentProps,
  createEffect,
  createSignal,
  For,
  Show,
} from "solid-js";
import { currentUserRole, isAuthenticated } from "~/lib/auth";

const navItems = [
  { href: "/pos", icon: PosIcon, label: "Kasir", roles: undefined },
  { href: "/orders", icon: OrdersIcon, label: "Pesanan", roles: undefined },
  {
    href: "/menu",
    icon: MenuIconIcon,
    label: "Menu",
    roles: ["owner", "manager"] as string[],
  },
  {
    href: "/users",
    icon: UsersIcon,
    label: "Pengguna",
    roles: ["owner"] as string[],
  },
  {
    href: "/settings",
    icon: SettingsIcon,
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
      <main class="flex-1 overflow-hidden">{props.children}</main>
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

  return (
    <div class={clsx("flex h-full flex-col", props.class)}>
      <header class="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur-sm">
        <button
          aria-label="Menu"
          class="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-accent"
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="24"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
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
      <Show when={sidebarOpen()}>
        <button
          aria-label="Tutup menu"
          class="fixed inset-0 z-50 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
        <nav
          class="fixed left-3 z-50 flex w-72 flex-col rounded-2xl bg-card shadow-2xl"
          style={{
            top: "calc(0.25rem + env(safe-area-inset-top))",
            bottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          }}
        >
          <div class="flex items-center gap-3 border-b px-6 py-[11.5px]">
            <span class="font-bold text-lg text-primary">Sakti POS</span>
          </div>
          <div class="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
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

function PosIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="14" rx="2" width="20" x="2" y="3" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function OrdersIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect height="4" rx="1" ry="1" width="8" x="8" y="2" />
    </svg>
  );
}

function MenuIconIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function UsersIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  );
}

function SettingsIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
