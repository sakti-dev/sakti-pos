import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core";
import { Route, Router } from "@solidjs/router";
import { AppShell } from "./components/layout/app-shell";
import { Toaster } from "./components/ui/toaster";
import Dashboard from "./pages/dashboard";
import Inventory from "./pages/inventory";
import Katalog from "./pages/katalog";
import Login from "./pages/login";
import Payment from "./pages/payment";
import Pengaturan from "./pages/pengaturan";
import { SectionBisnis } from "./pages/pengaturan/components/section-bisnis";
import { SectionPajak } from "./pages/pengaturan/components/section-pajak";
import { SectionPembayaran } from "./pages/pengaturan/components/section-pembayaran";
import { SectionPerangkat } from "./pages/pengaturan/components/section-perangkat";
import { SectionStruk } from "./pages/pengaturan/components/section-struk";
import { SectionTentang } from "./pages/pengaturan/components/section-tentang";
import { SectionTim } from "./pages/pengaturan/components/section-tim";
import { SectionUmum } from "./pages/pengaturan/components/section-umum";
import Pin from "./pages/pin";
import Receipt from "./pages/receipt";
import Register from "./pages/register";
import TransactionNew from "./pages/transaction-new";
import Transactions from "./pages/transactions";

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
      <Route component={Dashboard} path="/" />
      <Route component={Transactions} path="/transactions" />
      <Route component={Pengaturan} path="/pengaturan">
        <Route component={SectionBisnis} path="/" />
        <Route component={SectionBisnis} path="/bisnis" />
        <Route component={SectionUmum} path="/umum" />
        <Route component={SectionPajak} path="/pajak" />
        <Route component={SectionPembayaran} path="/pembayaran" />
        <Route component={SectionStruk} path="/struk" />
        <Route component={SectionTim} path="/tim" />
        <Route component={SectionPerangkat} path="/perangkat" />
        <Route component={SectionTentang} path="/tentang" />
      </Route>
      <Route component={Katalog} path="/katalog" />
      <Route component={Inventory} path="/inventory" />
      <Route component={TransactionNew} path="/transaction-new" />
      <Route component={Payment} path="/payment" />
      <Route component={Receipt} path="/receipt" />
      <Route component={Login} path="/login" />
      <Route component={Register} path="/register" />
      <Route component={Pin} path="/pin" />
    </Router>
  );
}
