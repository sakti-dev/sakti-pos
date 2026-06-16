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
