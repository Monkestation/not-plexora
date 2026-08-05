/** biome-ignore-all lint/suspicious/noExplicitAny: *explodes you* */

import fs from "node:fs";
import path from "node:path";
import { type BitFieldResolvable, Colors, EmbedBuilder, type GatewayIntentsString, type Interaction } from "discord.js";
import type { AroxelpClient } from "../Aroxelp";
import logger from "../logger";
import { hasPath } from "../other";

type InteractionExecutor<T extends Interaction> = (interaction: T) => Promise<void>;

/**
 * This is the base module for all modules, all modules classes should extend this.
 */
export default class BaseModule<Config = object | null> {
	config: Config;
	bot: AroxelpClient;
	/* If specified in a class, the type must be specified as well */
	static requiredConfigKeys?: string[] = [];

	static dependsOn?: readonly (typeof BaseModule<any>)[];

	static intents?: BitFieldResolvable<GatewayIntentsString, number>;
	/** Returns an array of config errors if present */
	static configValidator?: (config: any) => string[];
	logger: typeof logger;

	constructor(bot: AroxelpClient) {
		this.config = bot.config.modules[this.constructor.name as keyof typeof bot.config.modules] as unknown as Config;
		this.bot = bot;
		this.logger = logger.child({ module: this.constructor.name });
	}

	/** Runs after construction, before the next module is loaded and the bot is logged in. */
	setup?: () => Promise<void>;

	wrapInteractionHandler<T extends Interaction>(executor: InteractionExecutor<T>, logger: { error: (msg: string) => void }) {
		return async (interaction: T) => {
			try {
				await executor(interaction);
			} catch (error) {
				const err = error as Error;

				logger.error(
					`Interaction Error
User: ${interaction.user?.tag ?? "unknown"}
Guild: ${interaction.guildId ?? "DM"}
Interaction: ${interaction.id}

${err.message}
${err.stack ?? ""}`,
				);
				try {
					if (interaction.isRepliable()) {
						if (!interaction.deferred && !interaction.replied) {
							await interaction.deferReply({ ephemeral: true });
						}

						await interaction.followUp({
							embeds: [
								new EmbedBuilder()
									.setTitle("Error")
									.setDescription(`An error occurred while processing this interaction.\n\n**${err.message}**`)
									.setColor(Colors.Red),
							],
							ephemeral: true,
						});
					}
				} catch {
					// swallow secondary errors
				}
			}
		};
	}

	async getDataFolderPath() {
		// create the folder based on the name of the class
		const folderPath = `${path.join(import.meta.url, "..", "..", "data")}/${this.constructor.name}`;

		await fs.promises.mkdir(folderPath, { recursive: true });
		return folderPath;
	}

	static baseValidator(config: any) {
		const reasons = [];
		if (!BaseModule.requiredConfigKeys) {
			return;
		}

		for (const key of BaseModule.requiredConfigKeys) {
			if (!hasPath(config, key)) {
				reasons.push(`Missing required config key: ${key}`);
			}
		}
		return reasons;
	}
}
