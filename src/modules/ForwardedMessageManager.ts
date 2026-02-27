import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Client, WebhookClient } from "discord.js";
import { DATA_FOLDER } from "../constants.js";
import logger from "../logger.js";
import BaseModule from "./BaseModule.js";

// Yes i know theres two classes, no i couldn't figure out how to mixin two classes into one.

type ForwardConfig = {
	sourceGuildId: string;
	sourceChannelId: string;
	webhookUrl: string;
	disableAvatar: boolean;
	disableUsername: boolean;
	ignoreRegex: string;
};

type Config = {
	forwards: ForwardConfig[];
};

class ForwardedMessageManagerMap extends Map {
	module: ForwardedMessageManager;
	dataFolder: string;
	constructor(module: ForwardedMessageManager) {
		super();
		this.module = module;
		this.dataFolder = path.join(DATA_FOLDER, "forwardedMessages.json");
		this.loadMessages();
	}

	set(key: string, value: string) {
		super.set(key, value);
		this.saveMessages();
		return this;
	}

	delete(key: string) {
		const deleted = super.delete(key);
		this.saveMessages();
		return deleted;
	}

	saveMessages() {
		try {
			writeFileSync(this.dataFolder, JSON.stringify([...this]));
			logger.info("Messages saved!");
		} catch (error) {
			logger.error("Failed to save messages to disk", error);
		}
	}

	loadMessages() {
		try {
			if (existsSync(this.dataFolder)) {
				const data = readFileSync(this.dataFolder, "utf8");
				const loadedData = JSON.parse(data);
				for (const [key, value] of loadedData) {
					super.set(key, value);
				}
				logger.info(`Loaded forwarded messages from ${this.dataFolder}.`);
			}
		} catch (error) {
			logger.error(`Failed to load forwarded messages from ${this.dataFolder}`, error);
		}
	}
}

export default class ForwardedMessageManager extends BaseModule<Config> {
	forwards: ForwardedMessageManagerMap;
	webhookClients: Map<string, WebhookClient>;
	constructor(bot: Client) {
		super(bot);
		this.bot = bot;
		this.webhookClients = new Map();
		this.forwards = new ForwardedMessageManagerMap(this);

		process.on("beforeExit", () => {
			this.forwards.saveMessages();
		});
	}

	setupMiddleware() {
		this.bot.on("messageCreate", async (message) => {
			if (message.author.bot) return;

			for (const forwardRule of this.config.forwards) {
				if (message.guildId === forwardRule.sourceGuildId && message.channelId === forwardRule.sourceChannelId) {
					try {
						let ignoreTripped = false;
						if (forwardRule.ignoreRegex) {
							const regex = new RegExp(forwardRule.ignoreRegex, "i");
							if (regex.test(message.content)) {
								ignoreTripped = true;
							}
						}

						if (ignoreTripped) {
							logger.debug(
								// @ts-expect-error
								`Message from (${message.id}) ${message.author.tag} in #${message.channel.name} ignored due to ignoreRegex`,
							);
							return;
						}

						let webhookClient = this.webhookClients.get(forwardRule.webhookUrl);
						if (!webhookClient) {
							webhookClient = new WebhookClient({
								url: forwardRule.webhookUrl,
							});
							this.webhookClients.set(forwardRule.webhookUrl, webhookClient);
						}

						let attachments: string[] = [];
						if (message.attachments.size > 0) {
							attachments = message.attachments.map((attachment) => attachment.url);
						}

						const sentMessage = await webhookClient.send({
							content: `${!forwardRule.disableUsername ? `**${message.author.username}**:` : null} ${message.content}`,
							files: attachments,
							username: !forwardRule.disableUsername ? message.author.username : undefined,
							avatarURL: !forwardRule.disableAvatar ? message.author.displayAvatarURL() : undefined,
						});

						this.forwards.set(message.id, sentMessage.id);

						logger.debug(
							// @ts-expect-error
							`Forwarded message from (${message.id}) ${message.author.tag} in #${message.channel.name}`,
						);
					} catch (error) {
						logger.error(`Failed to forward message to webhook`, error);
					}
				}
			}
		});
		this.bot.on("messageUpdate", async (oldMessage, newMessage) => {
			if (this.forwards.has(oldMessage.id)) {
				const webhookMessageId = this.forwards.get(oldMessage.id);
				const forwardRule = this.config.forwards.find(
					(rule) => rule.sourceGuildId === oldMessage.guildId && rule.sourceChannelId === oldMessage.channelId,
				);

				let ignoreTripped = false;
				if (forwardRule?.ignoreRegex) {
					const regex = new RegExp(forwardRule.ignoreRegex, "i");
					if (regex.test(newMessage.content)) {
						ignoreTripped = true;
					}
				}

				if (!forwardRule || ignoreTripped) return;

				try {
					const webhookClient = this.webhookClients.get(forwardRule.webhookUrl);
					if (webhookClient) {
						let attachments: string[] = [];
						if (newMessage.attachments.size > 0) {
							attachments = newMessage.attachments.map((attachment) => attachment.url);
						}

						await webhookClient.editMessage(webhookMessageId, {
							content: `${!forwardRule.disableUsername ? `**${newMessage.author.username}**:` : null} ${newMessage.content}`,
							files: attachments,
						});

						logger.debug(`Updated webhook message (${webhookMessageId}) corresponding to original message (${oldMessage.id})`);
					}
				} catch (error) {
					logger.error(`Failed to update webhook message`, error);
				}
			}
		});

		this.bot.on("messageDelete", async (message) => {
			if (this.forwards.has(message.id)) {
				const webhookMessageId = this.forwards.get(message.id);
				const forwardRule = this.config.forwards.find(
					(rule) => rule.sourceGuildId === message.guildId && rule.sourceChannelId === message.channelId,
				);

				let ignoreTripped = false;
				if (forwardRule?.ignoreRegex && message.content) {
					const regex = new RegExp(forwardRule.ignoreRegex, "i");
					if (regex.test(message.content)) {
						ignoreTripped = true;
					}
				}

				if (!forwardRule || ignoreTripped) return;

				try {
					const webhookClient = this.webhookClients.get(forwardRule.webhookUrl);
					if (webhookClient) {
						await webhookClient.deleteMessage(webhookMessageId);
						this.forwards.delete(message.id);
						logger.debug(`Deleted webhook message (${webhookMessageId}) corresponding to original message (${message.id})`);
					}
				} catch (error) {
					logger.error(`Failed to delete webhook message`, error);
				}
			}
		});
	}
}
