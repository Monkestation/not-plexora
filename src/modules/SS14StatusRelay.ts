import { Events, Message } from "discord.js";
import type { AroxelpClient } from "../Aroxelp.js";
import BaseModule from "./BaseModule.js";

type RelayConfig = {
	sourceChannelId: string;
	apiEndpoint: string;
	apiKey: string;
	includeRegex: string;
	subtitle: string;
};

type Config = RelayConfig[];

export default class SS14StatusRelay extends BaseModule<Config> {
	constructor(bot: AroxelpClient) {
		super(bot);
		this.bot.on(Events.MessageCreate, async (message) => this.handleMessage(message));
	}

	async handleMessage(message: Message) {
		if (message.author.bot || !message.inGuild()) {
			return;
		};

		for (const relayConfig of this.config) {

			if (message.channelId !== relayConfig.sourceChannelId)
				continue;

			try {
				const { content: parsedContent, subtitle: parsedSubtitle } = this.parseSubtitle(message.content);
				const relayedMessage = parsedContent;
				if (relayConfig.includeRegex) {
					const regex = new RegExp(relayConfig.includeRegex, "i");
					if (!regex.test(message.content)) {
						continue;
					}
				}

				this.logger.info(`Relaying message from ${message.author.username} to SS14: "${relayedMessage}" ${parsedSubtitle ? `with subtitle: "${parsedSubtitle}"` : ""}`);

				const response = await fetch(relayConfig.apiEndpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `SS14Token ${relayConfig.apiKey}`,
					},
					body: JSON.stringify({
						subtitle: parsedSubtitle || relayConfig.subtitle || `System Status Update`,
						message: relayedMessage,
						source_url: message.url,
						source: ` | #${message.channel.name} - From: @${message.author.username}`
					})
				});

				if (!response.ok) {
					this.logger.error(`SS14 server returned ${response.status}: ${await response.text()}`);
					await this.reactionReport(message, false);
				} else {
					await this.reactionReport(message, true);
				}
			} catch (error) {
				this.logger.error(`Failed to relay message to SS14`, error);
				await this.reactionReport(message, false);
			}
		}
	}

	async reactionReport(message: Message, good: boolean) {
		const reaction = await message.react(good ? "🟢" : "🔴");
		setTimeout(() => void reaction.remove(), 2000);
	}
	// all this just so i can do [[HYPERLINK BLOCKED]]

	private parseSubtitle(content: string): { content: string; subtitle?: string } {
		const trimmed = content.trim();
		if (!trimmed) {
			return { content: "" };
		}

		const initialBracket = this.extractBracketedText(trimmed, 0);
		if (initialBracket) {
			return {
				content: this.stripLeadingTag(trimmed.slice(initialBracket.end).trimStart()),
				subtitle: initialBracket.value,
			};
		}

		const tagMatch = trimmed.match(/^<[^>]+>\s*/);
		if (tagMatch) {
			const afterTag = trimmed.slice(tagMatch[0].length);
			const afterTagBracket = this.extractBracketedText(afterTag, 0);

			if (afterTagBracket) {
				return {
					content: this.stripLeadingTag(afterTag.slice(afterTagBracket.end).trimStart()),
					subtitle: afterTagBracket.value,
				};
			}

			return { content: afterTag.trimStart() };
		}

		return { content };
	}

	private extractBracketedText(content: string, startIndex: number): { value: string; end: number } | undefined {
		if (content[startIndex] !== "[") {
			return undefined;
		}

		let depth = 0;
		for (let index = startIndex; index < content.length; index++) {
			const character = content[index];
			if (character === "[") {
				depth++;
			} else if (character === "]") {
				depth--;
				if (depth === 0) {
					return {
						value: content.slice(startIndex + 1, index),
						end: index + 1,
					};
				}
			}
		}

		return undefined;
	}

	private stripLeadingTag(content: string): string {
		const tagMatch = content.match(/^<[^>]+>\s*/);
		return tagMatch ? content.slice(tagMatch[0].length) : content;
	}
}
