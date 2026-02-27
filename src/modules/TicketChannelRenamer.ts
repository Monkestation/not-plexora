import { ChannelType, type Client, Events, type GuildChannel, type Message, type TextChannel } from "discord.js";
import logger from "../logger.js";
import BaseModule from "./BaseModule.js";

type Rule = {
	parentCategory: string;
	embedFind: {
		field: string;
		find: string;
	};
	append: string;
};

type Config = {
	rules: Rule[];
};

export default class TicketChannelRenamer extends BaseModule<Config> {
	ticketRegex: RegExp;
	constructor(bot: Client) {
		super(bot);
		this.ticketRegex = /ticket-\d*/gi;

		bot.on(Events.ChannelCreate, (channel: GuildChannel) => this.onChannelCreate(channel));
	}

	async onChannelCreate(_channel: GuildChannel) {
		if (_channel.type !== ChannelType.GuildText) return;

		const channel = _channel as TextChannel;
		if (!this.ticketRegex.test(channel.name)) return;

		// wait for 2 messages, or until timeout (30s)
		const messages = await this.waitForMessages(channel, 2, 30_000);
		if (!messages) return;

		const msgs = [...messages.values()].slice(0, 2).filter((m) => m.author.bot);

		const rule = this.findMatchingRule(msgs);
		if (!rule) return;

		const newName = `${channel.name}-${rule.append}`;
		if (newName === channel.name) return;

		try {
			await channel.setName(newName, "TicketChannelRenamer: config rule match");
		} catch (err) {
			logger.error("TicketChannelRenamer rename failed:", err);
		}
	}

	async waitForMessages(channel: TextChannel, count: number, timeout: number) {
		try {
			const collected = await channel.awaitMessages({
				max: count,
				time: timeout,
				errors: ["time"],
			});
			return collected;
		} catch {
			return null;
		}
	}

	/**
	 * @param {import("discord.js").Message[]} msgs
	 */
	findMatchingRule(msgs: Message[]) {
		for (const rule of this.config.rules) {
			if (!rule.embedFind?.field || !rule.embedFind?.find || !rule.append) continue;
			const channel = msgs[0].channel as TextChannel;

			if (rule.parentCategory && channel.parentId !== rule.parentCategory) continue;
			const fieldName = rule.embedFind.field.toLowerCase();
			const valueRegex = new RegExp(rule.embedFind.find, "i");

			for (const msg of msgs) {
				for (const embed of msg.embeds) {
					const field = embed.fields?.find((f) => f.name.toLowerCase() === fieldName);
					if (!field) continue;

					if (valueRegex.test(field.value)) {
						return rule;
					}
				}
			}
		}

		return null;
	}
}
