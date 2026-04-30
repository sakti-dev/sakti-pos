import { Router, Route, Navigate, useNavigate } from "@solidjs/router";
import { Show, createEffect, JSX } from "solid-js";
import { isAuthenticated, currentUserRole } from "./lib/auth";
import "./index.css";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import POS from "./pages/POS";
import MenuManagement from "./pages/MenuManagement";
import OrderHistory from "./pages/OrderHistory";
import Users from "./pages/Users";
import Settings from "./pages/Settings";

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
        when={
          !props.roles || props.roles.includes(currentUserRole() ?? "")
        }
        fallback={
          <div class="flex items-center justify-center min-h-screen text-muted-foreground">
            Akses ditolak
          </div>
        }
      >
        {props.children}
      </Show>
    </Show>
  );
}

function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={() => <Navigate href="/pos" />} />
      <Route path="/login" component={Login} />
      <Route
        path="/pos"
        component={() => (
          <RequireAuth>
            <POS />
          </RequireAuth>
        )}
      />
      <Route
        path="/menu"
        component={() => (
          <RequireAuth roles={["owner", "manager"]}>
            <MenuManagement />
          </RequireAuth>
        )}
      />
      <Route
        path="/orders"
        component={() => (
          <RequireAuth>
            <OrderHistory />
          </RequireAuth>
        )}
      />
      <Route
        path="/users"
        component={() => (
          <RequireAuth roles={["owner"]}>
            <Users />
          </RequireAuth>
        )}
      />
      <Route
        path="/settings"
        component={() => (
          <RequireAuth>
            <Settings />
          </RequireAuth>
        )}
      />
    </Router>
  );
}

export default App;
