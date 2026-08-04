import { ChannelType, Events, type GuildChannel, type Message, type TextChannel } from "discord.js";
import type { AroxelpClient } from "../Aroxelp.js";
import BaseModule from "./BaseModule.js";
import SS13Database from "./SS13Database.js";

type Config = {
	myConfigOption: string;
	myArrayOfOptions: string[];
	myObjectArray: {
		thing1: boolean;
		thing2: string;
	}[]
};

export default class Template extends BaseModule<Config> {
	static requiredConfigKeys = ["myConfigOption", "myObjectArray", "myObjectArray.*.thing1"];
	static dependsOn = [SS13Database]; // If you need to use another module's functions, you can use this.bot.getModule(ModuleClass) to get the current instance of it.

	// If a config validator is specified, requiredConfigKeys will be ignored!

	static configValidator = (config: Config) => {
		const errors = [];
		// You can also use the base validator in conjunction! but you will probably get duplicate or similar errors depending on your parsing.
		// errors.push(...(Template.baseValidator(config) || []))
		if (!["expectedOption", "expectedOption2"].includes(config.myConfigOption)) {
			errors.push("myConfigOption must be one of: expectedOption, expectedOption2");
		}

		return errors;
	};

	constructor(bot: AroxelpClient) {
		super(bot);
		bot.on(Events.ChannelCreate, (channel: GuildChannel) => this.onChannelCreate(channel));
	}

	async onChannelCreate(_channel: GuildChannel) {
		// do some funky stuff here
	}
}
