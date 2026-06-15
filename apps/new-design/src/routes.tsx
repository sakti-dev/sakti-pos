import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core";
import { Route, Router } from "@solidjs/router";
import { AppShell } from "./components/layout/app-shell";
import { Toaster } from "./components/ui/toaster";
import LoginPage from "./pages/auth/login";
import PinLoginPage from "./pages/auth/pin";
import RegisterPage from "./pages/auth/register";
import CatalogPage from "./pages/catalog";
import CategoryFormPage from "./pages/catalog/category-form";
import ProductFormPage from "./pages/catalog/product-form";
import VariantFormPage from "./pages/catalog/variant-form";
import HomePage from "./pages/home";
import InventoryPage from "./pages/inventory";
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

export default function AppRoutes() {
  return (
    <Router
      root={(props) => (
        <>
          <ColorModeScript storageType={storageManager.type} />
          <ColorModeProvider storageManager={storageManager}>
            <AppShell {...props} />
            <Toaster />
          </ColorModeProvider>
        </>
      )}
    >
      <Route component={HomePage} path="/" />
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
      <Route component={CashRegisterPage} path="/transactions/cash-register" />
      <Route component={PaymentPage} path="/transactions/payment" />
      <Route component={Receipt} path="/transactions/receipt" />
      <Route component={LoginPage} path="/auth/login" />
      <Route component={RegisterPage} path="/auth/register" />
      <Route component={PinLoginPage} path="/auth/pin" />
    </Router>
  );
}
