/* @refresh reload */
import { QueryClientProvider } from "@tanstack/solid-query";
import { render } from "solid-js/web";
import { DrizzleOrderRepository } from "./db/orders";
import {
  queryClient,
  SyncClientProvider,
} from "./lib/api/sync-client-provider.tsx";
import { loadOutletContext } from "./lib/auth/session";
import { setOrderRepository } from "./lib/sales/order-repository";
import "./styles/index.css";
import AppRoutes from "./routes.tsx";

loadOutletContext();
setOrderRepository(new DrizzleOrderRepository());

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
