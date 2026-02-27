import type { Client } from "discord.js";
import config from "../../config.json" with { type: "json" };
import type { AroxelpClient } from "../Aroxelp";

// coconut.jpg i dont understand why i need this
export interface CallableBaseModule {
	new (bot: AroxelpClient): BaseModule;
}

/**
 * This is the base module for all modules, all modules classes should extend this.
 */
export default class BaseModule<Config = object | null> {
	config: Config;
	bot: Client;
	constructor(bot: Client) {
		this.config = config.modules[this.constructor.name as keyof typeof config.modules] as unknown as Config;
		this.bot = bot;
	}
}
