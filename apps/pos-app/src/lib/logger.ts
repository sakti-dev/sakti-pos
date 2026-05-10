type LogLevel = "debug" | "error" | "info" | "warn";

export type LogContext = Record<string, unknown>;

export interface Logger {
	child(context: LogContext): Logger;
	debug(message: string, context?: LogContext): void;
	error(message: string, error?: unknown, context?: LogContext): void;
	info(message: string, context?: LogContext): void;
	warn(message: string, context?: LogContext): void;
}

const normalizeError = (error: unknown): string => {
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
};

const emit = (level: LogLevel, line: string): void => {
	if (level === "error") {
		console.error(line);
		return;
	}
	if (level === "warn") {
		console.warn(line);
		return;
	}
	if (level === "debug") {
		console.debug(line);
		return;
	}
	console.info(line);
};

const formatContext = (
	defaultContext: LogContext,
	context?: LogContext,
	error?: unknown,
): string => {
	const merged = {
		...defaultContext,
		...(context ?? {}),
	};

	if (error !== undefined) {
		merged.error = normalizeError(error);
	}

	if (Object.keys(merged).length === 0) {
		return "";
	}

	return ` ${JSON.stringify(merged)}`;
};

const createBaseLogger = (defaultContext: LogContext = {}): Logger => {
	const log = (
		level: LogLevel,
		message: string,
		context?: LogContext,
		error?: unknown,
	): void => {
		emit(
			level,
			`[${level.toUpperCase()}] ${message}${formatContext(defaultContext, context, error)}`,
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

export const logger = createLogger();
