import { Elysia } from "elysia";
import { protectedRegisterRoutes } from "./protected-routes";
import { publicRegisterRoutes } from "./public-routes";

export const registersRoutes = new Elysia()
  .use(publicRegisterRoutes)
  .use(protectedRegisterRoutes);
