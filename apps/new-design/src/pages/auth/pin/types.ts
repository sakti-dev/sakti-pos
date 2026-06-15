export interface PinUser {
  readonly id: number;
  readonly initials: string;
  readonly name: string;
  readonly pin: string;
  readonly role: string;
  readonly venue: string;
}

export const MAX_PIN = 6;
export const MAX_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 30_000;
export const DIGIT_RE = /^\d$/;

export const SAMPLE_USERS: readonly PinUser[] = [
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
] as const;
