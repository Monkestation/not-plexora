/** biome-ignore-all lint/suspicious/noExplicitAny: *explodes you* */
import type { AroxelpClient } from "../Aroxelp";
import logger from "../logger";

/**
 * This is the base module for all modules, all modules classes should extend this.
 */
export default class BaseModule<Config = object | null> {
	config: Config;
	bot: AroxelpClient;
	/* If specified in a class, the type must be specified as well */
	static requiredConfigKeys?: string[] = [];

	static dependsOn?: readonly (typeof BaseModule<any>)[];
	logger: typeof logger;

	constructor(bot: AroxelpClient) {
		this.config = bot.config.modules[this.constructor.name as keyof typeof bot.config.modules] as unknown as Config;
		this.bot = bot;
		this.logger = logger.child({ module: this.constructor.name });
	}
}
