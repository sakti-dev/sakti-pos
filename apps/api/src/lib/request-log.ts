import { Elysia } from "elysia";

const requestStartTime = new WeakMap<Request, number>();

/**
 * Single-line JSON request logging.
 *
 * `console.log` is the only output path workerd forwards to the dev process,
 * which `apps/api/scripts/dev` tees into `logs/api.log` for agent reference.
 * The previous pino-based logger's stream never actually arrived there.
 */
export const requestLog = new Elysia({ name: "request-log" })
  .request(({ request }) => {
    requestStartTime.set(request, performance.now());
  })
  .afterResponse(({ request, set }) => {
    if (request.method === "OPTIONS") {
      return;
    }

    const started = requestStartTime.get(request) ?? performance.now();
    console.log(
      JSON.stringify({
        lvl: "info",
        origin: "API",
        msg: "request",
        method: request.method,
        path: new URL(request.url).pathname,
        status: set.status ?? 200,
        ms: Math.round(performance.now() - started),
      })
    );
  })
  .error(({ error, request, set }) => {
    if (request.method === "OPTIONS") {
      return;
    }

    console.log(
      JSON.stringify({
        lvl: "error",
        origin: "API",
        msg: "request",
        method: request.method,
        path: new URL(request.url).pathname,
        name: error instanceof Error ? error.name : "UnknownError",
        status: set.status ?? 500,
      })
    );
  })
  .as("global");
