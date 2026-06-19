/** biome-ignore-all lint/performance/noBarrelFile: THIS IS VERY MUCH NEEDED DONT REMOVE IT */
export * from "./cn";
export * from "./date-time";
export * from "./format";
export * from "./logger";

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
