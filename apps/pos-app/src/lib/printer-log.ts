type PrinterLogData = Record<string, unknown>;

const PRINTER_LOG_PREFIX = "[PRINTER]";

const describeError = (error: unknown): string => {
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

export const formatPrinterLog = (
	event: string,
	data?: PrinterLogData,
): string => {
	if (!data || Object.keys(data).length === 0) {
		return `${PRINTER_LOG_PREFIX} ${event}`;
	}

	return `${PRINTER_LOG_PREFIX} ${event} ${JSON.stringify(data)}`;
};

export const formatPrinterErrorLog = (
	event: string,
	error: unknown,
	data?: PrinterLogData,
): string => {
	return formatPrinterLog(event, {
		...(data ?? {}),
		error: describeError(error),
	});
};

export const logPrinterInfo = (event: string, data?: PrinterLogData): void => {
	console.info(formatPrinterLog(event, data));
};

export const logPrinterWarn = (event: string, data?: PrinterLogData): void => {
	console.warn(formatPrinterLog(event, data));
};

export const logPrinterError = (
	event: string,
	error: unknown,
	data?: PrinterLogData,
): void => {
	console.error(formatPrinterErrorLog(event, error, data));
};
