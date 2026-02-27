import fsp from "node:fs/promises";
import path from "node:path";
import { type Client, MessageFlags, WebhookClient } from "discord.js";
import logger from "../logger.js";
import { getTimeText, pickRandomInArray, randomBetween } from "../other.js";
import BaseModule from "./BaseModule.js";

type Config = {
	filepath: string;
	webhookUrl: string;
	minIntervalMinutes: number;
	maxIntervalMinutes: number;
	filter: string;
};

export default class PolyTheParrot extends BaseModule<Config> {
	webhook: WebhookClient;
	MIN_MS: number;
	MAX_MS: number;
	lastUsedPhrases: Map<string, number> = new Map(); // phrase -> timestamp
	REPEAT_INTERVAL_MS: number;
	FILTERS_REGEX: (RegExp | string)[];
	nextTimeout: string | number | NodeJS.Timeout | undefined;
	sendAttempts: number = 0;
	sendWindowStart: number = 0;
	isRateLimited: boolean = false;

	constructor(bot: Client) {
		super(bot);
		this.webhook = new WebhookClient(
			{
				url: this.config.webhookUrl,
			},
			{
				allowedMentions: {
					parse: [],
				},
			},
		);

		if (this.config.minIntervalMinutes === undefined || this.config.maxIntervalMinutes === undefined) {
			logger.warn("minIntervalMinutes or maxIntervalMinutes not set in config, defaulting to 5 and 20");
		}
		this.MIN_MS = (this.config.minIntervalMinutes ?? 5) * 60 * 1000;
		this.MAX_MS = (this.config.maxIntervalMinutes ?? 20) * 60 * 1000;

		this.REPEAT_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 hours
		this.FILTERS_REGEX = [
			/has signed up as/i,
			/Crystal hyperstructure integrity faltering/i,
			/returning to safe operating parameters/i,
			/CRYSTAL DELAMINATION IMMINENT/i,
			/Integrity: /i,
			/node has been researched/i,
			this.config.filter,
		];
		this.pickAndSend();
	}

	async pickAndSend() {
		if (this.isRateLimited) {
			logger.warn("Rate limited - skipping send");
			return;
		}

		const now = Date.now();
		if (now - this.sendWindowStart > 1000) {
			this.sendAttempts = 0;
			this.sendWindowStart = now;
		}

		this.sendAttempts++;

		if (this.sendAttempts > 4) {
			this.isRateLimited = true;
			logger.warn("Rate limit exceeded - pausing for 5 minutes");
			setTimeout(
				() => {
					this.isRateLimited = false;
					this.sendAttempts = 0;
				},
				5 * 60 * 1000,
			);
			return;
		}

		const phrases = await this.getFilteredPhrases();
		const nextTrigger = this.resetTimer();

		if (phrases.length === 0) {
			logger.warn("no valid available phrases.");
			return;
		}

		const phrase = pickRandomInArray(phrases);
		this.lastUsedPhrases.set(phrase, Date.now());

		try {
			await this.webhook.send({
				content: phrase,
				flags: [MessageFlags.SuppressEmbeds, MessageFlags.SuppressNotifications],
			});
			logger.info(
				`Sent phrase '${phrase}' - Next in ${getTimeText(nextTrigger / 1000, "extended")} (${new Date(Date.now() + nextTrigger).toISOString()})`,
			);
		} catch (error) {
			logger.error(error);
		}
	}

	resetTimer(e = randomBetween(this.MIN_MS, this.MAX_MS)) {
		clearTimeout(this.nextTimeout);
		this.nextTimeout = setTimeout(() => this.pickAndSend(), e);
		return e;
	}

	async getFilteredPhrases() {
		try {
			const npcFile = await fsp.readFile(path.resolve(this.config.filepath), "utf8");
			const parsedNpc = JSON.parse(npcFile) as {
				phrases: string[];
				roundssurived: number;
				longestsurvival: number;
				longestdeathstreak: number;
			};

			const now = Date.now();

			const activeFilters = this.FILTERS_REGEX.filter(Boolean).map((e) => new RegExp(e));

			const filtered = parsedNpc.phrases.filter((phrase: string) => {
				const lastUsed = this.lastUsedPhrases.get(phrase);
				const tooSoon = lastUsed && now - lastUsed < this.REPEAT_INTERVAL_MS;

				const matchesFilter = activeFilters.some((filter) => filter.test(phrase));

				if (matchesFilter) {
					logger.warn(`Phrase '${phrase}' triggered filter`);
				}

				return !tooSoon && !matchesFilter;
			});

			return filtered;
		} catch (error) {
			logger.error(error);
			return [`Failed to read file\n\`\`\`\n${error}\`\`\``];
		}
	}
}
