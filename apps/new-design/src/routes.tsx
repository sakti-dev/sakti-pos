import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core";
import { Route, Router } from "@solidjs/router";
import { AppShell } from "./components/layout/app-shell";
import { Toaster } from "./components/ui/toaster";
import Dashboard from "./pages/dashboard";
import Login from "./pages/login";
import Payment from "./pages/payment";
import Pengaturan from "./pages/pengaturan";
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
      <Route component={Pengaturan} path="/pengaturan" />
      <Route component={TransactionNew} path="/transaction-new" />
      <Route component={Payment} path="/payment" />
      <Route component={Receipt} path="/receipt" />
      <Route component={Login} path="/login" />
      <Route component={Register} path="/register" />
      <Route component={Pin} path="/pin" />
    </Router>
  );
}
