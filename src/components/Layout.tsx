import { A, useLocation, useNavigate, RouteSectionProps } from "@solidjs/router";
import { Show, createEffect, JSX } from "solid-js";
import { clsx } from "clsx";
import { isAuthenticated } from "~/lib/auth";

const navItems = [
  { href: "/pos", label: "Kasir", icon: PosIcon },
  { href: "/orders", label: "Pesanan", icon: OrdersIcon },
  { href: "/menu", label: "Menu", icon: MenuIcon },
  { href: "/users", label: "Pengguna", icon: UsersIcon },
  { href: "/settings", label: "Pengaturan", icon: SettingsIcon },
] as const;

export default function Layout(props: RouteSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = () => location.pathname === "/login";

  createEffect(() => {
    if (!isLogin() && !isAuthenticated()) {
      navigate("/login");
    }
  });

  return (
    <div class="flex flex-col h-screen bg-background text-foreground">
      <Show
        when={!isLogin()}
        fallback={
          <main class="flex-1 overflow-y-auto">{props.children}</main>
        }
      >
        <main
          class="flex-1 overflow-y-auto"
          style={{
            "padding-bottom":
              "calc(3.5rem + var(--safe-area-inset-bottom, 0px))",
          }}
        >
          {props.children}
        </main>
        <nav
          class="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
          style={{
            "padding-bottom": "var(--safe-area-inset-bottom, 0px)",
          }}
        >
          <div class="flex items-center justify-around h-14">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.href ||
                location.pathname.startsWith(item.href + "/");
              return (
                <A
                  href={item.href}
                  class={clsx(
                    "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[56px]",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon class="w-5 h-5" />
                  <span class="text-[10px] leading-tight">{item.label}</span>
                </A>
              );
            })}
          </div>
        </nav>
      </Show>
    </div>
  );
}

function PosIcon(props: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function OrdersIcon(props: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    </svg>
  );
}

function MenuIcon(props: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    >
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function UsersIcon(props: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  );
}

function SettingsIcon(props: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
