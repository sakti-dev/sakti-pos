import { LoginBannerLeftSide } from "~/components/login-banner-left-side";
import { RegisterRightPanel } from "./components/right-panel";

export default function Register() {
  return (
    <div class="flex h-screen bg-cream font-sans text-foreground antialiased dark:bg-background">
      <LoginBannerLeftSide />
      <RegisterRightPanel />
    </div>
  );
}
