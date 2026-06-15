import { PinLeftPanel } from "./components/left-panel";
import { PinRightPanel } from "./components/right-panel";

export default function PinLoginPage() {
  return (
    <main
      class="flex min-h-screen overflow-x-hidden bg-background font-sans text-foreground antialiased"
      data-ssgoi-transition="/auth/pin"
    >
      <PinLeftPanel />
      <PinRightPanel />
    </main>
  );
}
