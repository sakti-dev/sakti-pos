import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { LoginBannerLeftSide } from "~/components/login-banner-left-side";
import { RightPanel } from "./components/right-panel";

export default function LoginPage() {
  return (
    <SafeAreaShell class="bg-background" data-ssgoi-transition="/auth/login">
      <div class="flex h-full">
        <LoginBannerLeftSide />
        <RightPanel />
      </div>
    </SafeAreaShell>
  );
}
