/* @refresh reload */
import { QueryClientProvider } from "@tanstack/solid-query";
import { render } from "solid-js/web";
import {
  queryClient,
  SyncClientProvider,
} from "./providers/sync-client-provider";
import "./styles/index.css";
import AppRoutes from "./routes.tsx";

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
