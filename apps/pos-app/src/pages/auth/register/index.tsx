import { LoginBannerLeftSide } from "~/components/login-banner-left-side";
import { RegisterRightPanel } from "./components/right-panel";

export default function RegisterPage() {
  return (
    <div
      class="flex h-screen bg-background font-sans text-foreground antialiased"
      data-ssgoi-transition="/auth/register"
    >
      <LoginBannerLeftSide />
      <RegisterRightPanel />
    </div>
  );
}
