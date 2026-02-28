// Compiled typescript from https://github.com/aandrewww/winston-transport-sentry-node/
/** biome-ignore-all lint/complexity/useLiteralKeys: <eee> */
// simply to avoid package conflicts since it requires @sentry/node v8.

import { captureException, captureMessage, flush, getCurrentScope, init } from "@sentry/node";
import { LEVEL } from "triple-beam";
import TransportStream from "winston-transport";

var SentrySeverity;
((SentrySeverity) => {
	SentrySeverity["Debug"] = "debug";
	SentrySeverity["Log"] = "log";
	SentrySeverity["Info"] = "info";
	SentrySeverity["Warning"] = "warning";
	SentrySeverity["Error"] = "error";
	SentrySeverity["Fatal"] = "fatal";
	// biome-ignore lint/suspicious/noAssignInExpressions: SHUT
})(SentrySeverity || (SentrySeverity = {}));

const DEFAULT_LEVELS_MAP = {
	silly: SentrySeverity["Debug"],
	verbose: SentrySeverity["Debug"],
	info: SentrySeverity["Info"],
	debug: SentrySeverity["Debug"],
	warn: SentrySeverity["Warning"],
	error: SentrySeverity["Error"],
};

class ExtendedError extends Error {
	constructor(info) {
		super(info.message);

		this.name = info.name || "Error";
		if (info.stack && typeof info.stack === "string") {
			this.stack = info.stack;
		}
	}
}

export default class SentryTransport extends TransportStream {
	silent = false;

	levelsMap = {};

	constructor(opts) {
		super(opts);

		this.levelsMap = this.setLevelsMap(opts?.levelsMap);
		this.silent = opts?.silent || false;

		if (!opts || !opts.skipSentryInit) {
			init(SentryTransport.withDefaults(opts?.sentry || {}));
		}
	}

	log(info, callback) {
		setImmediate(() => {
			this.emit("logged", info);
		});

		if (this.silent) return callback();

		const { message, tags, user, ...meta } = info;
		const winstonLevel = info[LEVEL];

		const sentryLevel = this.levelsMap[winstonLevel];

		const scope = getCurrentScope();
		scope.clear();

		if (tags !== undefined && SentryTransport.isObject(tags)) {
			scope.setTags(tags);
		}

		scope.setExtras(meta);

		if (user !== undefined && SentryTransport.isObject(user)) {
			scope.setUser(user);
		}

		// TODO: add fingerprints
		// scope.setFingerprint(['{{ default }}', path]); // fingerprint should be an array

		// scope.clear();

		// TODO: add breadcrumbs
		// Sentry.addBreadcrumb({
		//   message: 'My Breadcrumb',
		//   // ...
		// });

		// Capturing Errors / Exceptions
		if (SentryTransport.shouldLogException(sentryLevel)) {
			const error = Object.values(info).find((value) => value instanceof Error) ?? new ExtendedError(info);
			captureException(error, { tags, level: sentryLevel });

			return callback();
		}

		// Capturing Messages
		captureMessage(message, sentryLevel);
		return callback();
	}

	end(...args) {
		flush().then(() => {
			super.end(...args);
		});
		return this;
	}

	get sentry() {
		return Sentry;
	}

	setLevelsMap = (options) => {
		if (!options) {
			return DEFAULT_LEVELS_MAP;
		}

		const customLevelsMap = Object.keys(options).reduce((acc, winstonSeverity) => {
			acc[winstonSeverity] = options[winstonSeverity];
			return acc;
		}, {});

		return {
			...DEFAULT_LEVELS_MAP,
			...customLevelsMap,
		};
	};

	static withDefaults(options) {
		return {
			...options,
			dsn: options?.dsn || process.env.SENTRY_DSN || "",
			serverName: options?.serverName || "winston-transport-sentry-node",
			environment: options?.environment || process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
			debug: options?.debug || !!process.env.SENTRY_DEBUG || false,
			sampleRate: options?.sampleRate || 1.0,
			maxBreadcrumbs: options?.maxBreadcrumbs || 100,
		};
	}

	// private normalizeMessage(msg: any) {
	//   return msg && msg.message ? msg.message : msg;
	// }

	static isObject(obj) {
		const type = typeof obj;
		return type === "function" || (type === "object" && !!obj);
	}

	static shouldLogException(level) {
		return level === SentrySeverity.Fatal || level === SentrySeverity.Error;
	}
}
