import type { JSX } from "solid-js";
import { Fab } from "./fab";
import { MagicNav } from "./magic-nav";
import type { NavKey } from "./sidebar";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface AppShellProps {
  readonly activeNav: NavKey;
  readonly children: JSX.Element;
}

export const AppShell = (props: AppShellProps) => {
  return (
    <div class="bg-cream">
      <Sidebar />
      <TopBar />

      {/* Main content area */}
      <main class="relative mt-[54px] ml-[var(--sidebar-w,80px)] flex h-[calc(100vh-54px)] flex-1 flex-col overflow-hidden max-[900px]:ml-0 md:rounded-l-lg md:rounded-tr-lg dark:bg-[#141414]">
        {props.children}
      </main>

      <Fab />
      <MagicNav active={props.activeNav} />
    </div>
  );
};
