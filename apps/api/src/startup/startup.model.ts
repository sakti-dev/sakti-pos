import { t } from "elysia";
import type { Static } from "typebox";

export const StartupRequest = t.Object({
  outletId: t.String(),
});

export const StartupResponse = t.Object({
  ok: t.Boolean(),
  applied: t.Array(t.String()),
});

export type StartupRequest = Static<typeof StartupRequest>;
export type StartupResponse = Static<typeof StartupResponse>;
