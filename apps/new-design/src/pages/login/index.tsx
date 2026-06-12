import { LoginBannerLeftSide } from "~/components/login-banner-left-side";
import { RightPanel } from "./components/right-panel";

export default function Login() {
  return (
    <div
      class="flex h-screen bg-cream font-sans text-foreground antialiased dark:bg-background"
      data-ssgoi-transition="/login"
    >
      <LoginBannerLeftSide />
      <RightPanel />
    </div>
  );
}
