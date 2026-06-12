import { PinLeftPanel } from "./components/left-panel";
import { PinRightPanel } from "./components/right-panel";

export default function Pin() {
  return (
    <div class="flex min-h-screen bg-cream font-sans text-text antialiased dark:bg-[#0a0a0a]">
      <PinLeftPanel />
      <PinRightPanel />
    </div>
  );
}
