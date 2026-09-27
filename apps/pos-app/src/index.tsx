/* @refresh reload */
import { QueryClientProvider } from "@tanstack/solid-query";
import { render } from "solid-js/web";
import {
  queryClient,
  SyncClientProvider,
} from "./lib/api/sync-client-provider.tsx";
import { loadOutletContext } from "./lib/auth/session";
import "./styles/index.css";
import AppRoutes from "./routes.tsx";

loadOutletContext();

const root = document.getElementById("root");

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <SyncClientProvider>
        <AppRoutes />
      </SyncClientProvider>
    </QueryClientProvider>
  ),
  root!
);
