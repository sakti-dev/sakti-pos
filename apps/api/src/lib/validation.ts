export class BadRequestError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }

  toResponse(): Response {
    return Response.json({ error: this.message }, { status: 400 });
  }
}

export class ConflictRequestError extends Error {
  status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictRequestError";
  }

  toResponse(): Response {
    return Response.json({ error: this.message }, { status: 409 });
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_REGEX = /^\d{4,6}$/;
const PAIRING_CODE_REGEX = /^[A-Z0-9]{8}$/;

export function requireNonEmptyString(
  value: string,
  field: string,
  options: { maxLength?: number; minLength?: number } = {}
): string {
  const minLength = options.minLength ?? 1;
  if (value.length < minLength) {
    throw new BadRequestError(`${field} is required`);
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new BadRequestError(`${field} is too long`);
  }

  return value;
}

export function requireEmail(value: string): string {
  requireNonEmptyString(value, "email");
  if (!EMAIL_REGEX.test(value)) {
    throw new BadRequestError("email is invalid");
  }
  return value;
}

export function requirePin(value: string): string {
  if (!PIN_REGEX.test(value)) {
    throw new BadRequestError("pin must be 4 to 6 digits");
  }
  return value;
}

export function requirePairingCode(value: string): string {
  if (!PAIRING_CODE_REGEX.test(value)) {
    throw new BadRequestError(
      "pairingCode must be 8 uppercase letters or digits"
    );
  }
  return value;
}
