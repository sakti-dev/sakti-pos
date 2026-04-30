import { Navigate, Route, Router, useNavigate } from "@solidjs/router";
import { createEffect, type JSX, Show } from "solid-js";
import { currentUserRole, isAuthenticated } from "./lib/auth";
import "./index.css";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import MenuManagement from "./pages/MenuManagement";
import CategoryForm from "./pages/menu/category-form";
import CategoryList from "./pages/menu/category-list";
import MenuIndex from "./pages/menu/index";
import ProductForm from "./pages/menu/product-form";
import ProductList from "./pages/menu/product-list";
import OrderHistory from "./pages/OrderHistory";
import POS from "./pages/POS";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

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
        component={() => (
          <RequireAuth roles={["owner", "manager"]}>
            <MenuManagement />
          </RequireAuth>
        )}
        path="/menu"
      >
        <Route component={MenuIndex} path="/" />
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
        component={() => (
          <RequireAuth roles={["owner"]}>
            <Users />
          </RequireAuth>
        )}
        path="/users"
      />
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
