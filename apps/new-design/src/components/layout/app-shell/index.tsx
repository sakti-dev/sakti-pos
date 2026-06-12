import type { RouteSectionProps } from "@solidjs/router";
import { Show } from "solid-js";
import { Fab } from "./fab";
import { MagicNav } from "./magic-nav";
import type { NavKey } from "./sidebar";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** Derive active nav key from current pathname. */
const navFromPath = (pathname: string): NavKey => {
  if (pathname === "/") {
    return "home";
  }
  if (pathname === "/transactions") {
    return "transactions";
  }
  if (pathname === "/pengaturan") {
    return "settings";
  }
  return "home";
};

export const AppShell = (props: RouteSectionProps) => {
  const pathname = () => props.location.pathname;
  const activeNav = () => navFromPath(pathname());

  return (
    <div class="bg-cream dark:bg-surface">
      <Sidebar />
      <TopBar />

      <main class="relative mt-[54px] ml-[var(--sidebar-w,80px)] flex h-[calc(100vh-54px)] flex-1 flex-col overflow-hidden max-[900px]:ml-0 dark:bg-surface">
        {props.children}
      </main>

      <Show when={activeNav() === "home" || activeNav() === "transactions"}>
        <Fab />
      </Show>
      <MagicNav active={activeNav()} />
    </div>
  );
};
