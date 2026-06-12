import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core";
import { Route, Router } from "@solidjs/router";
import { AppShell } from "./components/layout/app-shell";
import { AuthLayout } from "./components/layout/auth-layout";
import { FlowLayout } from "./components/layout/flow-layout";
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
            {props.children}
            <Toaster />
          </ColorModeProvider>
        </>
      )}
    >
      {/* Shell routes — AppShell persists, only <main> content animates */}
      <Route component={AppShell}>
        <Route component={Dashboard} path="/" />
        <Route component={Transactions} path="/transactions" />
        <Route component={Pengaturan} path="/pengaturan" />
      </Route>

      {/* Auth routes — fade between login / register / pin */}
      <Route component={AuthLayout}>
        <Route component={Login} path="/login" />
        <Route component={Register} path="/register" />
        <Route component={Pin} path="/pin" />
      </Route>

      {/* Transaction flow — drill in from new → payment → receipt */}
      <Route component={FlowLayout}>
        <Route component={TransactionNew} path="/transaction-new" />
        <Route component={Payment} path="/payment" />
        <Route component={Receipt} path="/receipt" />
      </Route>
    </Router>
  );
}
