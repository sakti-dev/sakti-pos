/* @refresh reload */
import { render } from "solid-js/web";
import { AuthProvider } from "./providers/AuthProvider";
import "./styles/index.css";
import AppRoutes from "./routes.tsx";

const root = document.getElementById("root");

render(
  () => (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  ),
  root!
);
