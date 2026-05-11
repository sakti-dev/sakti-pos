import { Route, Router, useNavigate } from "@solidjs/router";
import { createEffect, type JSX, Show } from "solid-js";
import { currentUserRole, isAuthenticated } from "./store/auth";
import { isDevicePaired } from "./store/outlet";
import "./index.css";
import Layout from "./components/layout";
import Dashboard from "./pages/dashboard/dashboard";
import CloudLogin from "./pages/login/cloud-login";
import CloudRegister from "./pages/login/cloud-register";
import DevicePair from "./pages/login/device-pair";
import LocalAuth from "./pages/login/local-auth";
import CategoryForm from "./pages/menu/category-form";
import CategoryList from "./pages/menu/category-list";
import MenuHome from "./pages/menu/menu-home";
import ProductForm from "./pages/menu/product-form";
import ProductList from "./pages/menu/product-list";
import Onboarding from "./pages/onboarding";
import OrderHistory from "./pages/order-history";
import POS from "./pages/pos/pos-shell";
import AccountSettings from "./pages/settings/account";
import OutletSettings from "./pages/settings/outlet";
import PrinterSettingsPage from "./pages/settings/printer";
import ProductsCategoriesSettings from "./pages/settings/products-categories";
import Settings from "./pages/settings/settings";
import ResetPin from "./pages/users/reset-pin";
import UserForm from "./pages/users/user-form";
import UserList from "./pages/users/user-list";
import UserManagement from "./pages/users/user-management";

function RequireAuth(props: { children: JSX.Element; roles?: string[] }) {
  const navigate = useNavigate();

  createEffect(() => {
    const authed = isAuthenticated();
    const paired = isDevicePaired();
    console.log("[SYNC-DEBUG] RequireAuth guard", { authed, paired });
    if (!authed) {
      navigate(paired ? "/login" : "/cloud-login");
    }
  });

  return (
    <Show when={isAuthenticated()}>
      <Show
        fallback={
          <div class="flex min-h-screen items-center justify-center text-muted-foreground">
            Akses ditolak
          </div>
        }
        when={!props.roles || props.roles.includes(currentUserRole() ?? "")}
      >
        {props.children}
      </Show>
    </Show>
  );
}

function App() {
  return (
    <Router root={Layout}>
      <Route component={CloudLogin} path="/cloud-login" />
      <Route component={CloudRegister} path="/cloud-register" />
      <Route component={DevicePair} path="/device-pair" />
      <Route component={Onboarding} path="/onboarding" />
      <Route
        component={() => (
          <RequireAuth roles={["manager", "owner"]}>
            <Dashboard />
          </RequireAuth>
        )}
        path="/"
      />
      <Route component={LocalAuth} path="/login" />
      <Route
        component={() => (
          <RequireAuth>
            <POS />
          </RequireAuth>
        )}
        path="/pos"
      />
      <Route
        component={(props) => (
          <RequireAuth roles={["manager", "owner"]}>
            {props.children}
          </RequireAuth>
        )}
        path="/menu"
      >
        <Route component={MenuHome} path="/" />
        <Route component={CategoryList} path="/categories" />
        <Route component={CategoryForm} path="/categories/add" />
        <Route component={CategoryForm} path="/categories/:id/edit" />
        <Route component={ProductList} path="/products" />
        <Route component={ProductForm} path="/products/add" />
        <Route component={ProductForm} path="/products/:id/edit" />
      </Route>
      <Route
        component={() => (
          <RequireAuth>
            <OrderHistory />
          </RequireAuth>
        )}
        path="/orders"
      />
      <Route
        component={(props) => (
          <RequireAuth roles={["manager", "owner"]}>
            <UserManagement {...props} />
          </RequireAuth>
        )}
        path="/users"
      >
        <Route component={UserList} path="/" />
        <Route component={UserForm} path="/add" />
        <Route component={UserForm} path="/:id/edit" />
        <Route component={ResetPin} path="/:id/reset-pin" />
      </Route>
      <Route
        component={(props) => <RequireAuth>{props.children}</RequireAuth>}
        path="/settings"
      >
        <Route component={Settings} path="/" />
        <Route component={AccountSettings} path="/account" />
        <Route component={OutletSettings} path="/outlet" />
        <Route component={PrinterSettingsPage} path="/printer" />
        <Route
          component={ProductsCategoriesSettings}
          path="/products-categories"
        />
      </Route>
    </Router>
  );
}

export default App;
