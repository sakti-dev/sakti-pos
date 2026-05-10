export class ForbiddenRequestError extends Error {
  status = 403;

  constructor() {
    super("Forbidden");
    this.name = "ForbiddenRequestError";
  }

  toResponse() {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
}

export function throwIfFalse(condition: boolean, error: Error): void {
  if (!condition) {
    throw error;
  }
}
