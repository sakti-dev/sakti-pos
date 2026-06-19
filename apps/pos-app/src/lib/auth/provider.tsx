import { useLocation, useNavigate } from "@solidjs/router";
import { listen } from "@tauri-apps/api/event";
import { getCurrent } from "@tauri-apps/plugin-deep-link";
import { onCleanup, onMount, type ParentComponent } from "solid-js";
import { toast } from "solid-sonner";
import { exchangeGoogleOAuthCode, getMerchants } from "~/lib/auth/cloud";
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger, describeError } from "~/lib/utils";

const logger = createLogger({
  domain: "AUTH",
  module: "auth-provider",
});

const PUBLIC_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/pin",
  "/onboarding",
  "/experiment",
]);

async function handleOAuthUrl(
  url: string,
  navigate: ReturnType<typeof useNavigate>
) {
  try {
    const parsed = new URL(
      url.replace("sakti-pos-dev://", "http://localhost/")
    );
    const code = parsed.searchParams.get("code");
    if (!code) {
      logger.warn("no_code_in_url", { url });
      return;
    }

    logger.info("exchange_start", { code });
    const { sessionToken, user } = await exchangeGoogleOAuthCode(code);
    await AuthStorage.saveToken(sessionToken);
    logger.info("exchange_success", { userId: user.id });

    const merchants = await getMerchants();
    if (merchants.length > 0) {
      navigate("/auth/login", { replace: true });
      toast.success(`Selamat datang, ${user.name.split(" ")[0]}!`);
    } else {
      navigate("/onboarding", { replace: true });
      toast.success("Akun terdaftar! Lengkapi profil bisnis Anda.");
    }
  } catch (err) {
    logger.error("exchange_failed", err, { url });
    toast.error(describeError(err));
  }
}

export const AuthProvider: ParentComponent = (props) => {
  const navigate = useNavigate();
  const location = useLocation();

  onMount(async () => {
    // Check for cold-start URLs (arrived before JS listener was ready)
    try {
      const currentUrls = await getCurrent();
      if (currentUrls) {
        for (const url of currentUrls) {
          if (url.includes("sakti-pos-dev://auth")) {
            logger.info("cold_start_url", { url });
            handleOAuthUrl(url, navigate);
          }
        }
      }
    } catch {
      // Deep-link plugin may not be available in dev browser
    }

    const unlisten = await listen<string>("google-oauth-callback", (event) => {
      logger.info("event_received", { url: event.payload });
      handleOAuthUrl(event.payload, navigate);
    });

    onCleanup(() => unlisten());

    // Auth guard: redirect to login if no session on protected routes
    const token = await AuthStorage.getToken();
    const path = location.pathname;
    const isPublic = PUBLIC_PATHS.has(path) || path.startsWith("/auth/");

    if (!(token || isPublic)) {
      logger.info("redirect_unauthenticated", { path });
      navigate("/auth/login", { replace: true });
    }
  });

  return props.children;
};
