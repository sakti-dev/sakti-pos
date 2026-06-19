import { useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";
import {
  type CurrentCloudStaff,
  getCurrentCloudStaff,
  getGoogleOAuthUrl,
  getMerchants,
  getOutlets,
  type Outlet,
  type SessionMerchant,
} from "~/lib/auth/cloud";
import { createLogger, describeError } from "~/lib/utils";
import { getActiveStaff, loginWithCloudStaff, setScope } from "~/store/auth";
import { setOutletContext } from "~/store/outlet";
import { syncNow } from "~/store/sync";

const cloudAuthLogger = createLogger({
  domain: "AUTH",
  module: "cloud-auth-flow",
});

export type CloudAuthStep = "auth" | "merchant-picker" | "outlet-picker";

const routeForRole = (role: string) => (role === "cashier" ? "/pos" : "/");

export function useCloudAuthFlow() {
  const navigate = useNavigate();
  const [step, setStep] = createSignal<CloudAuthStep>("auth");
  const [error, setError] = createSignal("");
  const [merchants, setMerchants] = createSignal<SessionMerchant[]>([]);
  const [outlets, setOutlets] = createSignal<Outlet[]>([]);
  const [picking, setPicking] = createSignal(false);

  const continueAfterAuth = async () => {
    const userMerchants = await getMerchants();
    if (userMerchants.length > 0) {
      setMerchants(userMerchants);
      setStep("merchant-picker");
      return;
    }

    navigate("/onboarding", { replace: true });
  };

  const handleSelectMerchant = async (merchant: SessionMerchant) => {
    setPicking(true);
    setError("");
    try {
      const merchantOutlets = await getOutlets(merchant.merchantId);
      if (merchantOutlets.length > 0) {
        setOutlets(merchantOutlets);
        setStep("outlet-picker");
      } else {
        navigate(`/onboarding?merchantId=${merchant.merchantId}`, {
          replace: true,
        });
      }
    } catch {
      setError("Gagal memuat outlet");
    } finally {
      setPicking(false);
    }
  };

  const handleSelectOutlet = async (outlet: Outlet) => {
    setPicking(true);
    setError("");
    cloudAuthLogger.info("outlet_selected", {
      merchantId: outlet.merchantId,
      outletId: outlet.id,
      outletName: outlet.name,
    });
    setOutletContext(outlet.id, outlet.merchantId, undefined, outlet.timezone);
    let currentCloudStaff: CurrentCloudStaff;
    try {
      cloudAuthLogger.info("current_cloud_staff:request", {
        merchantId: outlet.merchantId,
      });
      currentCloudStaff = await getCurrentCloudStaff(outlet.merchantId);
      cloudAuthLogger.info("current_cloud_staff:result", {
        claimed: currentCloudStaff.claimed,
        reason: currentCloudStaff.reason,
        staffId: currentCloudStaff.staff?.id,
        staffRole: currentCloudStaff.staff?.role,
      });
    } catch (err) {
      const message = describeError(err);
      cloudAuthLogger.error("current_cloud_staff:failed", err, {
        merchantId: outlet.merchantId,
        outletId: outlet.id,
      });
      setError(`Gagal memeriksa staff cloud: ${message}`);
      setPicking(false);
      return;
    }

    try {
      cloudAuthLogger.info("sync:request", {
        merchantId: outlet.merchantId,
        outletId: outlet.id,
      });
      setScope(outlet.merchantId);
      await syncNow();
      cloudAuthLogger.info("sync:result", {
        merchantId: outlet.merchantId,
        outletId: outlet.id,
      });
    } catch (err) {
      const message = describeError(err);
      cloudAuthLogger.error("sync:failed", err, {
        merchantId: outlet.merchantId,
        outletId: outlet.id,
      });
      setError(`Gagal menyinkronkan data: ${message}`);
      return;
    } finally {
      setPicking(false);
    }

    if (currentCloudStaff.staff) {
      try {
        const authUser = await loginWithCloudStaff(currentCloudStaff.staff.id);
        navigate(routeForRole(authUser.role), { replace: true });
      } catch (err) {
        cloudAuthLogger.error("local_cloud_staff_login:failed", err, {
          staffId: currentCloudStaff.staff.id,
        });
        setError("Data pengguna belum tersinkron. Coba sinkronkan lagi.");
      }
      return;
    }

    if (
      currentCloudStaff.reason === "ambiguous-owner" ||
      currentCloudStaff.reason === "not-allowed"
    ) {
      navigate("/auth/pin", { replace: true });
      return;
    }

    const activeStaff = await getActiveStaff();
    if (activeStaff.length === 0) {
      navigate(
        `/onboarding?merchantId=${outlet.merchantId}&outletId=${outlet.id}`,
        {
          replace: true,
        }
      );
      return;
    }

    navigate("/auth/pin", { replace: true });
  };

  const handleGoogle = () => {
    window.open(getGoogleOAuthUrl(), "_blank", "noopener");
  };

  return {
    continueAfterAuth,
    error,
    handleGoogle,
    handleSelectMerchant,
    handleSelectOutlet,
    merchants,
    outlets,
    picking,
    setError,
    setStep,
    step,
  };
}
