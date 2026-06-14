import { PinLeftPanel } from "./components/left-panel";
import { PinRightPanel } from "./components/right-panel";

export default function Pin() {
  return (
    <main
      class="flex min-h-screen bg-background font-sans text-foreground antialiased"
      data-ssgoi-transition="/pin"
    >
      <PinLeftPanel />
      <PinRightPanel />
    </main>
  );
}
