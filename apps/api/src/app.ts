import { logger } from "@bogeychan/elysia-logger";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { authRoutes } from "./auth/routes";
import { merchantsRoutes } from "./merchants/routes";
import { outletsRoutes } from "./outlets/routes";
import { registersRoutes } from "./registers/routes";
import { staffRoutes } from "./staff/routes";
import { syncRoutes } from "./sync/routes";

export default new Elysia({ adapter: CloudflareAdapter })
  .use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      maxAge: 86_400,
    })
  )
  .use(
    logger({
      autoLogging: {
        ignore(ctx) {
          return ctx.request.method === "OPTIONS";
        },
      },
    })
  )
  .use(authRoutes)
  .use(merchantsRoutes)
  .use(outletsRoutes)
  .use(registersRoutes)
  .use(staffRoutes)
  .use(syncRoutes)
  .get("/", () => "Sakti POS API v1")
  .compile();
