import { cors } from "@elysia/cors";
import { Elysia } from "elysia";
import { WebStandardAdapter } from "elysia/adapter/web-standard";
import { assetsRoutes } from "./assets/routes";
import { authRoutes } from "./auth/routes";
import { requestLog } from "./lib/request-log";
import { merchantsRoutes } from "./merchants/routes";
import { outletsRoutes } from "./outlets/routes";
import { paymentSettingsRoutes } from "./payment-settings/routes";
import { registersRoutes } from "./registers/routes";
import { staffRoutes } from "./staff/routes";
import { startupRoutes } from "./startup/routes";
import { syncRoutes } from "./sync/routes";

const app = new Elysia({ adapter: WebStandardAdapter })
  .use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      maxAge: 86_400,
    })
  )
  .use(requestLog)
  .use(authRoutes)
  .use(assetsRoutes)
  .use(merchantsRoutes)
  .use(outletsRoutes)
  .use(paymentSettingsRoutes)
  .use(registersRoutes)
  .use(startupRoutes)
  .use(staffRoutes)
  .use(syncRoutes)
  .get("/", () => "Sakti POS API v1");

export type App = typeof app;

export default app.compile();
