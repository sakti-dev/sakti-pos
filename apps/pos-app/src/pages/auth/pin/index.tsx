import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { PinLeftPanel } from "./components/left-panel";
import { PinRightPanel } from "./components/right-panel";

export default function PinLoginPage() {
  return (
    <SafeAreaShell class="bg-background" data-ssgoi-transition="/auth/pin">
      <div class="flex h-full overflow-x-hidden">
        <PinLeftPanel />
        <PinRightPanel />
      </div>
    </SafeAreaShell>
  );
}
