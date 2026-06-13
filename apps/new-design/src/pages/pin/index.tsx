import { PinLeftPanel } from "./components/left-panel";
import { PinRightPanel } from "./components/right-panel";

export default function Pin() {
  return (
    <div
      class="flex min-h-screen bg-background font-sans text-foreground antialiased"
      data-ssgoi-transition="/pin"
    >
      <PinLeftPanel />
      <PinRightPanel />
    </div>
  );
}
