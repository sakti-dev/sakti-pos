import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { LoginBannerLeftSide } from "~/components/login-banner-left-side";
import { RegisterRightPanel } from "./components/right-panel";

export default function RegisterPage() {
  return (
    <SafeAreaShell class="bg-background" data-ssgoi-transition="/auth/register">
      <div class="flex min-h-0 flex-1">
        <LoginBannerLeftSide />
        <RegisterRightPanel />
      </div>
    </SafeAreaShell>
  );
}
