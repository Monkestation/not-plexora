import { Events, Message } from "discord.js";
import type { AroxelpClient } from "../Aroxelp.js";
import BaseModule from "./BaseModule.js";

type RelayConfig = {
	sourceGuildId: string;
	sourceChannelId: string;
	apiEndpoint: string;
	apiKey: string;
	includeRegex: string;
};

type Config = RelayConfig[];

export default class SS14StatusRelay extends BaseModule<Config> {
	constructor(bot: AroxelpClient) {
		super(bot);
		this.bot = bot;
		this.bot.on(Events.MessageCreate, async (message) => this.handleMessage(message));
	}

	async handleMessage(message: Message) {
		if (message.author.bot) return;

		for (const relayConfig of this.config) {
			if (message.guildId === relayConfig.sourceGuildId && message.channelId === relayConfig.sourceChannelId) {
				try {
					var relayedMessage = message.content;
					if (relayConfig.includeRegex) {
						const regex = new RegExp(relayConfig.includeRegex, "i");
						if (!regex.test(relayedMessage)) {
							continue;
						} else {
							relayedMessage = relayedMessage.replace(regex, "");
						}
					}

					console.log(relayedMessage);

					const body = JSON.stringify({
						subtitle: "System Status Update",
						message: relayedMessage,
					});

					const response = await fetch(relayConfig.apiEndpoint, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `SS14Token ${relayConfig.apiKey}`,
						},
						body,
					});

					if (!response.ok) {
						this.logger.error(`SS14 server returned ${response.status}: ${await response.text()}`);
					}
				} catch (error) {
					this.logger.error(`Failed to relay message to SS14`, error);
				}
			}
		}
	}
}
