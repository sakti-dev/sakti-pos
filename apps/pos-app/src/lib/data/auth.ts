import type { PinUser } from "~/pages/auth/pin/types";

/* ── PIN login accounts ─────────────────────────────────────────── */

export const pinUsers: readonly PinUser[] = [
  {
    id: 1,
    name: "Yos Bb",
    role: "Manager",
    pin: "123456",
    initials: "YB",
    venue: "Tantri Cafe",
  },
  {
    id: 2,
    name: "Rina Sari",
    role: "Kasir",
    pin: "654321",
    initials: "RS",
    venue: "Tantri Cafe",
  },
  {
    id: 3,
    name: "Ahmad Fauzi",
    role: "Kasir",
    pin: "111111",
    initials: "AF",
    venue: "Tantri Cafe",
  },
];
