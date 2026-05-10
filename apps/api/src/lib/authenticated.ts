import { Elysia } from "elysia";
import { getSessionFromRequest } from "./session";

export const authenticated = new Elysia({ name: "authenticated" })
  .resolve(async ({ request, status }) => {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return status(401, { error: "Unauthorized" });
    }

    return { session };
  })
  .as("global");
