import { existsSync, mkdirSync, type PathLike, readdirSync } from "node:fs";
import { Client, GatewayIntentBits } from "discord.js";
import config from "../config.json" with { type: "json" };
import { DATA_FOLDER, MODULES_DIRECTORY, moduleFiletypeRegex } from "./constants";
import logger from "./logger";
import type BaseModule from "./modules/BaseModule";
import type { CallableBaseModule } from "./modules/BaseModule";

export class AroxelpClient extends Client {
	modules = new Map<string, BaseModule>();
	config: typeof config;
	constructor() {
		super({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
		});
		// Yes i know how fucking useless this is but, shut up.
		this.config = config;
	}

	public init() {
		try {
			if (!existsSync(DATA_FOLDER)) {
				mkdirSync(DATA_FOLDER);
			}

			void this.login(this.config.token);

			this.once("clientReady", async () => {
				await this.loadModules(MODULES_DIRECTORY);
				logger.info(`Logged in as ${this.user?.tag} in ${this.guilds.cache.size}`);
				logger.info(`${this.modules.size} modules loaded`);
			});

			this.on("error", (error) => {
				logger.error("Discord client error", error);
			});
		} catch (error) {
			logger.error(`An error occured while initializing Aroxelp`, error);
		}
	}

	async loadModules(directory: PathLike) {
		const files = readdirSync(directory, {
			withFileTypes: true,
			encoding: "utf8",
		});
		for (const file of files) {
			if (
				file.name.startsWith("_") ||
				file.name.endsWith(".map") ||
				!moduleFiletypeRegex.test(file.name) ||
				file.name.includes("BaseModule")
			)
				continue;

			let moduleToLoad: CallableBaseModule;

			// Tries to load the module
			try {
				const importedModule: Record<string, CallableBaseModule> = await import(`file://${directory}/${file.name}`);
				moduleToLoad = importedModule[Object.keys(importedModule)[0]];
			} catch (error) {
				logger.warn(`Module ${file.name} failed to load, see stack trace below:`);
				throw new Error(`${error}`);
			}

			const name = file.name.split(moduleFiletypeRegex)[0];
			if (!this.config.modules[moduleToLoad.name as keyof typeof config.modules]) {
				logger.warn(`No config entry for module '${name}', skipping...`);
				continue;
			}

			// goop. goopdyscoop. goopscoopwoop. 'v')b do not delete this comment it holds the entire code together
			// Loads the module
			const module = new moduleToLoad(this);
			this.modules.set(name.toLowerCase(), module);
		}
	}
}
