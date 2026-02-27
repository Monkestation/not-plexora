import { type Client, EmbedBuilder, Events, type Message } from "discord.js";
import logger from "../logger";
import BaseModule from "./BaseModule";

type Config = {
	TicketCategoryChannelID: string;
	PlayerDataFolder: string;
	AdminRoleIDs: string[];
};

// playerdata folder is alphabet, then inside those folders are player usernames that start with that letter.
// player username folders contain the preferences.json file that users will upload
// ex: player_data/f/flleeppyy/preferences.json

/**
It needs to be able to process the character file, read each character and their loadout

Then it needs to send a prompt asking an admin (specified in config via a role they have), to approve or deny the character import after reviewing.
it will have an approve or deny component. 

i am typing all of this because otherwise my braimn will FUCKING IMPLODE and lose track of what im supposed to be doing.
*/
export default class SS13PreferencesImporter extends BaseModule<Config> {
	constructor(bot: Client) {
		super(bot);
		bot.on(Events.MessageCreate, (message: Message) => this.onMessageCreate(message));
		// add event listener for components interactions, uhhh use the footer of embed which will contain ID of mesage with 
	}

	async onMessageCreate(message: Message) {
		if (message.channel.isDMBased()) return;

		if (message.channel.parentId !== this.config.TicketCategoryChannelID) return;

		if (!message.member?.roles.cache.some((role) => this.config.AdminRoleIDs.includes(role.id))) return;

		for (const attachment of message.attachments.values()) {
			if (attachment.contentType !== "application/json") continue;

			const response = await fetch(attachment.url);
			const data = await response.json();

			if (Object.keys(data).length === 0 || (typeof data === "object" && !Array.isArray(data))) {
				logger.warn(`Attachment ${attachment.url} does not contain a valid JSON object, skipping`);
				continue;
			}

			const embed = this.processPreferencesForNeatEmbed(data);

			return;
		}
	}

	processPreferencesForNeatEmbed(preferences: any) {
		const characters = [];
		const version = preferences.version || "Unknown";

		for (const key of Object.keys(preferences)) {
			if (key.startsWith("character")) {
				characters.push(preferences[key]);
			}
		}

		const embed = new EmbedBuilder()
			.setTitle("SS13 Preferences Import")
			.setDescription(
				`Savefile Version: ${version}\nCharacter Count: ${characters.length}\nEnabled antags: ${preferences.be_special.join(", ")}\nCharacter names (Human): ${characters.map((e) => e.human_name).join(", ")}`,
			)
			.setColor(0x860069);

		return embed;
	}
}
