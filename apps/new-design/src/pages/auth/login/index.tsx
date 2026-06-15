import { LoginBannerLeftSide } from "~/components/login-banner-left-side";
import { RightPanel } from "./components/right-panel";

export default function LoginPage() {
  return (
    <div
      class="flex h-screen bg-background font-sans text-foreground antialiased"
      data-ssgoi-transition="/auth/login"
    >
      <LoginBannerLeftSide />
      <RightPanel />
    </div>
  );
}
