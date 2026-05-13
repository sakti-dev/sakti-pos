import {
  debug as pluginDebug,
  error as pluginError,
  info as pluginInfo,
  warn as pluginWarn,
} from "@tauri-apps/plugin-log";
import { describeError } from "~/lib/utils";

type LogLevel = "debug" | "error" | "info" | "warn";

const LOG_VALUE_NEEDS_QUOTES_PATTERN = /[\s"=]/;
const INTERNAL_CONTEXT_KEYS = new Set(["domain", "module", "prefix", "scope"]);

export type LogDomain =
  | "ASSET"
  | "AUTH"
  | "DB"
  | "PHOTO"
  | "POS"
  | "PRINTER"
  | "SETTINGS"
  | "SYNC"
  | "UI";

export type LogContext = Record<string, unknown> & {
  domain?: LogDomain;
  module?: string;
  scope?: string;
};

export interface Logger {
  child(context: LogContext): Logger;
  debug(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
}

const emitPluginLog = async (level: LogLevel, line: string): Promise<void> => {
  if (level === "error") {
    await pluginError(line);
    return;
  }
  if (level === "warn") {
    await pluginWarn(line);
    return;
  }
  if (level === "debug") {
    await pluginDebug(line);
    return;
  }
  await pluginInfo(line);
};

const emit = (level: LogLevel, line: string): void => {
  emitPluginLog(level, line).catch(() => {
    // The logger is used in browser tests and early startup where Tauri IPC may
    // not be available yet. Keep logging non-fatal.
  });
};

const toSnakeCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s:]+/g, "_")
    .toLowerCase();

const toAction = (message: string): string =>
  toSnakeCase(message).toUpperCase();

const toDomain = (context: LogContext): LogDomain => {
  if (context.domain !== undefined) {
    return context.domain;
  }

  const module = String(context.module ?? "ui").toLowerCase();
  const scope = context.scope == null ? "" : String(context.scope);
  const candidates = `${module}:${scope.toLowerCase()}`;

  if (candidates.includes("auth") || candidates.includes("login")) {
    return "AUTH";
  }
  if (candidates.includes("db")) {
    return "DB";
  }
  if (candidates.includes("sync")) {
    return "SYNC";
  }
  if (candidates.includes("photo") || candidates.includes("image")) {
    return "PHOTO";
  }
  if (candidates.includes("asset")) {
    return "ASSET";
  }
  if (candidates.includes("printer")) {
    return "PRINTER";
  }
  if (candidates.includes("pos")) {
    return "POS";
  }
  if (candidates.includes("settings")) {
    return "SETTINGS";
  }
  return "UI";
};

const formatValue = (value: unknown): string => {
  if (typeof value === "string") {
    return LOG_VALUE_NEEDS_QUOTES_PATTERN.test(value)
      ? JSON.stringify(value)
      : value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value == null
  ) {
    return String(value);
  }
  return JSON.stringify(value);
};

const formatContext = (
  defaultContext: LogContext,
  context?: LogContext,
  error?: unknown
): string => {
  const merged = {
    ...defaultContext,
    ...(context ?? {}),
  };

  if (error !== undefined) {
    merged.error = describeError(error);
  }

  const entries = Object.entries(merged).filter(
    ([key]) => !INTERNAL_CONTEXT_KEYS.has(key)
  );
  if (entries.length === 0) {
    return "";
  }

  return ` ${entries
    .map(([key, value]) => `${toSnakeCase(key)}=${formatValue(value)}`)
    .join(" ")}`;
};

const createBaseLogger = (defaultContext: LogContext = {}): Logger => {
  const log = (
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): void => {
    emit(
      level,
      `[JS] [${toDomain(defaultContext)}:${toAction(message)}] ${message}${formatContext(defaultContext, context, error)}`
    );
  };

  return {
    child(context: LogContext): Logger {
      return createBaseLogger({ ...defaultContext, ...context });
    },
    debug(message: string, context?: LogContext): void {
      log("debug", message, context);
    },
    error(message: string, error?: unknown, context?: LogContext): void {
      log("error", message, context, error);
    },
    info(message: string, context?: LogContext): void {
      log("info", message, context);
    },
    warn(message: string, context?: LogContext): void {
      log("warn", message, context);
    },
  };
};

export const createLogger = (context: LogContext = {}): Logger =>
  createBaseLogger(context);

export const createDomainLogger = (
  domain: LogDomain,
  context: Omit<LogContext, "domain"> = {}
): Logger => createBaseLogger({ ...context, domain });

export const logger = createLogger();
