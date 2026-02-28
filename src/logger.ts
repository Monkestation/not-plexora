import { join as pathJoin } from "node:path";
import * as Sentry from "@sentry/node";
import { configDotenv } from "dotenv";
import winston from "winston";
import { getFilenameFriendlyUTCDate, sleep } from "./other.js";
// @ts-expect-error imma be real, im not converting that shit to ts
import SentryTransport from "./WinstonSentryTransport.js";

configDotenv({
	quiet: true,
});

const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		tracesSampleRate: 1.0,
	});
}

if (process.env.DEBUG) {
	console.warn(
		`Debug mode enabled${process.env.SENTRY_DSN && !process.env.SENTRY_DEBUG ? "; Sentry debug can be enabled with SENTRY_DEBUG env." : ""}`,
	);
}

const logPath = pathJoin(process.cwd(), "logs", `${IS_PRODUCTION ? "prod" : "dev"}_${getFilenameFriendlyUTCDate()}.json`);
console.log(`"Logging (JSON Lines) to ${logPath}"`);
const transports = [];

// Determine log level based on environment and debug mode
let transportLogLevel: string;
if (IS_PRODUCTION) {
	transportLogLevel = process.env.DEBUG ? "silly" : "info";
} else {
	transportLogLevel = "silly";
}

transports.push(
	new winston.transports.File({
		filename: logPath,
		format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
		level: transportLogLevel,
		handleExceptions: true,
	}),
);

if (process.env.SENTRY_DSN) {
	transports.push(
		new SentryTransport({
			sentry: {
				dsn: process.env.SENTRY_DSN,
			},
			level: "error", // just errors
			exceptionLevels: ["error"],
		}),
	);
}

if (process.env.LOGGER_PRETTY) {
	const { inspect } = await import("node:util");

	transports.push(
		new winston.transports.Console({
			level: transportLogLevel,
			format: winston.format.combine(
				winston.format.colorize({
					message: true,
					colors: {
						info: "blue",
					},
					level: true,
				}),
				winston.format.timestamp(),
				winston.format.printf((info) => {
					let message = info.message;
					if (typeof message === "object") {
						message = inspect(message, { depth: null, colors: true });
					}
					const childName = info.module ? ` [M:${info.module}]` : "";
					return `[${info.timestamp}]${childName} ${info.level}: ${message}${info.stack ? `\n${info.stack}` : ""}`;
				}),
			),
		}),
	);
} else {
	transports.push(
		new winston.transports.Console({
			level: transportLogLevel,
			format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
		}),
	);
}

const logger = winston.createLogger({ transports });

const flush = async () => {
	const promises = logger.transports.map((transport) => {
		return new Promise((resolve) => {
			// @ts-expect-error yes it does
			if (transport._stream?.end) {
				// @ts-expect-error yes it does
				transport._stream.end(resolve);
			} else if (transport.close) {
				transport.close();
				resolve(void 0);
			} else {
				resolve(void 0);
			}
		});
	});
	await Promise.all(promises);
};

// now THIS will make developers cry
// @ts-expect-error shut
globalThis._oldExit = process.exit;
// @ts-expect-error shut
process.exit = async (...args) => {
	// Ample amount of time for anything to do it's thing.
	await sleep(500);
	await flush();
	// @ts-expect-error shut
	globalThis._oldExit(...args);
};

export default logger;
