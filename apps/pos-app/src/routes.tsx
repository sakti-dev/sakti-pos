import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
  useColorMode,
} from "@kobalte/core";
import { Route, Router } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { createEffect } from "solid-js";
import { AuthProvider } from "~/lib/auth/provider";
import { AppShell } from "./components/layout/app-shell";
import { Toaster } from "./components/ui/toaster";
import LoginPage from "./pages/auth/login";
import PinLoginPage from "./pages/auth/pin";
import RegisterPage from "./pages/auth/register";
import CatalogPage from "./pages/catalog";
import CategoryFormPage from "./pages/catalog/category-form";
import ProductFormPage from "./pages/catalog/product-form";
import VariantFormPage from "./pages/catalog/variant-form";
import ExperimentPage from "./pages/experiment";
import HomePage from "./pages/home";
import InventoryPage from "./pages/inventory";
import GoodsReceiptPage from "./pages/inventory/goods-receipt";
import HistoryPage from "./pages/inventory/history";
import StocktakePage from "./pages/inventory/stocktake-form";
import OnboardingPage from "./pages/onboarding";
import SettingPage from "./pages/setting";
import { SectionAbout } from "./pages/setting/components/section-about";
import { SectionBusiness } from "./pages/setting/components/section-business";
import { SectionDevices } from "./pages/setting/components/section-devices";
import { SectionGeneral } from "./pages/setting/components/section-general";
import { SectionPaymentMethods } from "./pages/setting/components/section-payment-methods";
import { SectionReceipt } from "./pages/setting/components/section-receipt";
import { SectionTax } from "./pages/setting/components/section-tax";
import { SectionTeams } from "./pages/setting/components/section-teams";
import Transactions from "./pages/transactions";
import CashRegisterPage from "./pages/transactions/cash-register";
import PaymentPage from "./pages/transactions/payment";
import Receipt from "./pages/transactions/receipt";

const storageManager = createLocalStorageManager("sakti-theme");

const THEME_COLORS = {
  light: "#f9f8f2",
  dark: "#1a1a1a",
} as const;

function NativeThemeSync() {
  const { colorMode } = useColorMode();

  createEffect(() => {
    const isDark = colorMode() === "dark";
    const color = isDark ? THEME_COLORS.dark : THEME_COLORS.light;
    invoke("sync_status_bar_color", { color, isDark }).catch(() => {});
  });

  return null;
}

export default function AppRoutes() {
  return (
    <Router
      root={(props) => (
        <>
          <ColorModeScript storageType={storageManager.type} />
          <ColorModeProvider storageManager={storageManager}>
            <AuthProvider>
              <AppShell {...props} />
              <Toaster />
              <NativeThemeSync />
            </AuthProvider>
          </ColorModeProvider>
        </>
      )}
    >
      <Route component={HomePage} path="/" />
      <Route component={ExperimentPage} path="/experiment" />
      <Route component={Transactions} path="/transactions" />
      <Route component={SettingPage} path="/setting">
        <Route component={SectionBusiness} path="/" />
        <Route component={SectionBusiness} path="/business" />
        <Route component={SectionGeneral} path="/general" />
        <Route component={SectionTax} path="/tax" />
        <Route component={SectionPaymentMethods} path="/payment-methods" />
        <Route component={SectionReceipt} path="/receipt" />
        <Route component={SectionTeams} path="/teams" />
        <Route component={SectionDevices} path="/devices" />
        <Route component={SectionAbout} path="/about" />
      </Route>
      <Route component={CatalogPage} path="/catalog" />
      <Route component={CategoryFormPage} path="/catalog/category/new" />
      <Route component={CategoryFormPage} path="/catalog/category/:id" />
      <Route component={VariantFormPage} path="/catalog/variant/new" />
      <Route component={VariantFormPage} path="/catalog/variant/:id" />
      <Route component={ProductFormPage} path="/catalog/product/new" />
      <Route component={ProductFormPage} path="/catalog/product/:id" />
      <Route component={InventoryPage} path="/inventory" />
      <Route component={HistoryPage} path="/inventory/history" />
      <Route component={StocktakePage} path="/inventory/stocktake/new" />
      <Route component={GoodsReceiptPage} path="/inventory/goods-receipt/new" />
      <Route component={CashRegisterPage} path="/transactions/cash-register" />
      <Route component={PaymentPage} path="/transactions/payment" />
      <Route component={Receipt} path="/transactions/receipt" />
      <Route component={LoginPage} path="/auth/login" />
      <Route component={RegisterPage} path="/auth/register" />
      <Route component={PinLoginPage} path="/auth/pin" />
      <Route component={OnboardingPage} path="/onboarding" />
    </Router>
  );
}
