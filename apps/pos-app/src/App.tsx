import { Navigate, Route, Router, useNavigate } from "@solidjs/router";
import { createEffect, type JSX, Show } from "solid-js";
import { currentUserRole, isAuthenticated } from "./lib/auth";
import "./index.css";
import Layout from "./components/layout";
import Login from "./pages/login";
import CategoryForm from "./pages/menu/category-form";
import CategoryList from "./pages/menu/category-list";
import MenuHome from "./pages/menu/menu-home";
import ProductForm from "./pages/menu/product-form";
import ProductList from "./pages/menu/product-list";
import MenuManagement from "./pages/menu-management";
import OrderHistory from "./pages/order-history";
import POS from "./pages/pos";
import Settings from "./pages/settings";
import ResetPin from "./pages/users/reset-pin";
import UserForm from "./pages/users/user-form";
import UserList from "./pages/users/user-list";
import UserManagement from "./pages/users/user-management";

function RequireAuth(props: { children: JSX.Element; roles?: string[] }) {
  const navigate = useNavigate();

  createEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
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
      <Route component={() => <Navigate href="/pos" />} path="/" />
      <Route component={Login} path="/login" />
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
          <RequireAuth roles={["owner", "manager"]}>
            <MenuManagement {...props} />
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
          <RequireAuth roles={["owner"]}>
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
        component={() => (
          <RequireAuth>
            <Settings />
          </RequireAuth>
        )}
        path="/settings"
      />
    </Router>
  );
}

export default App;
