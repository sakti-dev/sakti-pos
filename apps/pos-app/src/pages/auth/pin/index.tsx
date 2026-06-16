import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { PinLeftPanel } from "./components/left-panel";
import { PinRightPanel } from "./components/right-panel";

export default function PinLoginPage() {
  return (
    <SafeAreaShell class="bg-background" data-ssgoi-transition="/auth/pin">
      <div class="flex min-h-0 flex-1 overflow-x-hidden">
        <PinLeftPanel />
        <PinRightPanel />
      </div>
    </SafeAreaShell>
  );
}
