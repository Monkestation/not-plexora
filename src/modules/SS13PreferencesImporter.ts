import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	Colors,
	EmbedBuilder,
	Events,
	type GuildMember,
	type Interaction,
	type Message,
	MessageFlags,
	type NonThreadGuildBasedChannel,
} from "discord.js";
import type { AroxelpClient } from "../Aroxelp";
import { parseByondKey, safeAccess, sleep } from "../other";
import BaseModule from "./BaseModule";
import Plexora from "./Plexora";

type Config = {
	/** Message sent when a new channel created under the TicketCategoryChannelID category is made */
	Instructions: string;
	/** Message sent if a user does not have a Discord link record (Plexora reliant) */
	MissingLinkMessage: string;
	/** Category ID that ticketsbot (or a similar ticket system) uses to create new tickets under. This module will listen for new channels here and send instructions. */
	TicketCategoryChannelID: string;
	/** Folder on disk that is the root of player saves on the ss13 server */
	PlayerDataFolder: string;
	/** Admins that can approve import requests */
	AdminRoleIDs: string[];
	/** Server ID in Plexoras config */
	PlexoraServerID: string;
};

// playerdata folder is alphabet, then inside those folders are player usernames that start with that letter.
// player username folders contain the preferences.json file that users will upload
// ex: player_data/f/flleeppyy/preferences.json

/**
It needs to be able to process the character file, read each character and their loadout

Then it needs to send a prompt asking an admin (specified in config via a role they have), to approve or deny the character import after reviewing.
it will have an approve or deny component.

i am typing all of this because otherwise my braimn will FUCKING IMPLODE and lose track of what im supposed to be doing.

note: server does validation so plese ignore the lack of checking "dur is this a REAL character save? UHuhfd"
*/
export default class SS13PreferencesImporter extends BaseModule<Config> {
	static dependsOn = [Plexora];

	static requiredConfigKeys: (keyof Config)[] = ["TicketCategoryChannelID", "PlayerDataFolder", "PlexoraServerID"];

	constructor(bot: AroxelpClient) {
		super(bot);

		if (!existsSync(this.config.PlayerDataFolder)) {
			throw new Error(`Player data folder ${this.config.PlayerDataFolder} does not exist.`);
		}
		this.onMessageCreate = this.onMessageCreate.bind(this);
		this.onInteraction = this.onInteraction.bind(this);
		this.onChannelCreate = this.onChannelCreate.bind(this);
		bot.on(Events.MessageCreate, this.onMessageCreate);
		bot.on(Events.InteractionCreate, this.onInteraction);
		bot.on(Events.ChannelCreate, this.onChannelCreate);
	}

	async onChannelCreate(channel: NonThreadGuildBasedChannel) {
		if (channel.parentId !== this.config.TicketCategoryChannelID) {
			return;
		}

		if (!channel.isTextBased()) {
			return;
		}

		await sleep(1000);

		if (this.config.Instructions)
			await channel.send({
				embeds: [new EmbedBuilder().setTitle("Preference Importer - How To").setDescription(this.config.Instructions)],
			});
	}

	async onInteraction(interaction: Interaction) {
		return this.wrapInteractionHandler(async (interaction) => {
			if (!interaction.isButton() || !interaction.channel || interaction.channel.isDMBased() || !interaction.inGuild()) return;

			if (interaction.channel.parentId !== this.config.TicketCategoryChannelID) {
				return;
			}

			const [action, messageId] = interaction.customId.split(":");
			if (!messageId) {
				this.logger.warn(`Received interaction with invalid customId format: ${interaction.customId}`);
				return;
			}

			await this.handleCharacterImportInteraction(interaction, action, messageId);
		}, this.logger)(interaction);
	}

	async onMessageCreate(message: Message) {
		if (message.channel.isDMBased() || message.author.bot) {
			return;
		}

		if (message.channel.parentId !== this.config.TicketCategoryChannelID) {
			return;
		}

		const userRecord = await this.bot.getModule(Plexora).lookupCkey(this.config.PlexoraServerID, message.author.id);
		if (!userRecord || !userRecord.ckey) {
			this.logger.warn(
				`User ${message.author.tag} (${message.author.id}) does not have a linked ckey, cannot process preferences import.`,
			);
			message.reply(this.config.MissingLinkMessage || "You do not have a linked ckey, preference import will not work.");
			return;
		}
		if (!message.attachments.size) {
			this.logger.debug(`Message ${message.id} does not have any attachments, ignoring.`);
			return;
		}
		for (const attachment of message.attachments.values()) {
			this.logger.debug(
				`Processing attachment ${attachment.url} with content type ${attachment.contentType} and size ${attachment.size} bytes`,
			);
			if (!attachment.contentType?.startsWith("application/json")) {
				this.logger.warn(`Attachment ${attachment.url} is not a JSON file, skipping`);
				continue;
			}

			if (attachment.size > 2_000_000) {
				this.logger.warn(`Attachment ${attachment.url} is larger than 2mb, skipping`);
				await message.channel.send({
					content: `Attachment ${attachment.url} is larger than 2mb, please upload a smaller file.`,
				});
				continue;
			}

			const response = await fetch(attachment.url);
			const data = await response.json();

			if (!data || typeof data !== "object" || Array.isArray(data)) {
				this.logger.warn(`Attachment ${attachment.url} does not contain a valid JSON object, skipping`);
				continue;
			}

			const embeds = [this.processPreferencesForNeatEmbed(data, userRecord.ckey)];

			if (await this.checkExistingPreferences(userRecord.ckey)) {
				embeds.push(
					new EmbedBuilder()
						.setTitle("Preferences Warning")
						.setDescription(
							`The ckey *${userRecord.ckey}* already has a pre-existent preferences.json file (This is fine if you haven't done anything related to your savefile on the server).\nIf this is accepted, the old one will be renamed to preferences.json.bak, along with the previous copy uploaded here. Proceed with caution.`,
						)
						.setColor(Colors.Orange),
				);
			}

			await message.reply({
				embeds,
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setCustomId(`approve:${message.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
						new ButtonBuilder().setCustomId(`deny:${message.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
					),
				],
			});

			return;
		}

		const mimeBlacklist = ["image/", "video/", "audio/"];
		if (message.attachments.some((attachment) => mimeBlacklist.some((prefix) => attachment.contentType?.startsWith(prefix)))) {
			return;
		}
		// if we got here, it means we didn't find any valid attachments but the user attached something.
		await message.react("❓");
		await message.react("📎");
	}

	processPreferencesForNeatEmbed(preferences: any, ckey: string) {
		const version = preferences.version || "Unknown";
		const characters = Object.entries(preferences)
			.filter(([k, v]) => k.startsWith("character") && typeof v === "object")
			.map(([_, v]) => v);

		const antags = Array.isArray(preferences.be_special) ? preferences.be_special.join(", ") : "None";

		const headshots = characters
			.filter((c) => (c as any).headshot || (c as any).silicon_headshot)
			.map((c) => `${(c as any).real_name || "Unknown"}: ${(c as any).headshot} - ${(c as any).silicon_headshot}`)
			.join("\n");

		const embed = new EmbedBuilder()
			.setTitle(`SS13 Preferences Import for ${ckey}`)
			.setDescription(
				`Savefile Version: ${version}\n` +
				`**Character Count:** ${characters.length}\n` +
				`**Enabled antags:** ${antags}\n` +
				// ourgh
				`**Character names (Real):** ${characters.map((e) => (e as { real_name?: string }).real_name ?? "Unknown").join(", ")}` +
				`\n\n**Characters with Headshot:**\n${headshots}`,
			)
			.setColor(0x860069);

		return embed;
	}

	async handleCharacterImportInteraction(interaction: ButtonInteraction, action: string, messageId: string) {
		if (!interaction.guild) {
			// dude how...
			await interaction.reply({ content: "This interaction can only be used within a server.", flags: MessageFlags.Ephemeral });
			return;
		}
		const member = await interaction.guild.members.fetch(interaction.user.id);
		const canApprove = this.canApproveImport(member);
		const uploadMessage = await interaction.channel?.messages.fetch(messageId);
		const approvalMessage = await interaction.message.fetch();

		if (!canApprove) {
			await interaction.reply({ content: "You do not have permission to perform this action.", flags: MessageFlags.Ephemeral });
			return;
		}

		if (canApprove && uploadMessage?.author.id === interaction.user.id) {
			await interaction.reply({ content: "You cannot approve/deny your own import request.", flags: MessageFlags.Ephemeral });
			return;
		}

		if (!approvalMessage.components.length) {
			await interaction.reply({
				content: "This import has already been handled.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.deferReply();

		if (action === "deny") {
			await approvalMessage.edit({
				components: [],
			});
			await interaction.followUp({
				content: `Character import denied by <@${interaction.user.id}>.`,
				flags: MessageFlags.SuppressNotifications,
			});
			return;
		}
		try {
			const preferencesAttachment = uploadMessage?.attachments.find((attachment) =>
				attachment.contentType?.startsWith("application/json"),
			);

			if (!uploadMessage || !preferencesAttachment) {
				await interaction.followUp({
					content: "Could not find the original message or preferences attachment.",
				});
				await approvalMessage.edit({ components: [] });
				return;
			}

			const response = await fetch(preferencesAttachment.url);
			const data = await response.json();

			const userRecord = await this.bot.getModule(Plexora).lookupCkey(this.config.PlexoraServerID, uploadMessage.author.id);
			if (!userRecord || !userRecord.ckey) {
				this.logger.error(
					`User record for ${uploadMessage.author.tag} (${uploadMessage.author.id}) is missing ckey after approval.`,
				);
				await interaction.followUp({
					content: "An error occurred while processing your import. Please ping @flleeppyy.",
				});
				return;
			}

			await this.bot.getModule(Plexora).kickByCkey({
				server_id: this.config.PlexoraServerID,
				ckey: userRecord.ckey,
				kicked_by: `Plexora`,
				reason: `Preference Import - Approved by ${interaction.user.tag} (${interaction.user.id})`,
				clear_prefs_cache: true,
			});

			let existingPreferencesPath: string | null = null;
			try {
				existingPreferencesPath = await this.backupExistingPreferences(userRecord.ckey);
				await this.writeFileToDisk(userRecord.ckey, data);
			} catch (error) {
				this.logger.error(`Error writing preferences to disk for ckey ${userRecord.ckey}:`, error);
				await interaction.followUp({
					embeds: [
						new EmbedBuilder()
							.setTitle("Error")
							.setDescription(
								`An error occurred while saving your preferences: ${(error as Error).message}\n\`\`\`\n${(error as Error).stack || ""}\n\`\`\``,
							)
							.setColor(Colors.Red),
					],
				});
				return;
			}

			await approvalMessage.edit({ components: [] });
			if (existingPreferencesPath) {
				const existingPreferences = await readFile(existingPreferencesPath);
				await interaction.followUp({
					content: `<@${interaction.user.id}> Approved this character import.\nCharacter import processed successfully. Attached below are your old preferences on the server. If you connected to the server during the current round, you **MUST** wait until the next round, otherwise joining now will overwrite the preferences you just imported. If you havent joined at all this round, then you are free to do so now!`,
					files: [
						new AttachmentBuilder(existingPreferences, {
							name: `${userRecord.ckey}_preferences.old.json`,
						}),
					],
				});
			} else {
				await interaction.followUp({ content: "Character import processed successfully. You may close this ticket." });
			}
		} catch (error) {
			this.logger.error(`Error fetching message ${messageId} for character import approval:`, error);
		}
	}

	canApproveImport(member: GuildMember) {
		return member.permissions.has("Administrator") || this.config.AdminRoleIDs.some((roleId) => member.roles.cache.has(roleId));
	}

	getPreferencesPath(ckey: string) {
		return path.resolve(this.config.PlayerDataFolder, ckey[0].toLowerCase(), parseByondKey(ckey), "preferences.json");
	}

	async backupExistingPreferences(ckey: string) {
		const filePath = this.getPreferencesPath(ckey);
		const userFolder = path.dirname(filePath);
		if (await safeAccess(filePath)) {
			const backupPath = path.resolve(userFolder, "preferences.json.bak");
			await rename(filePath, backupPath);
			return backupPath;
		}
	}

	async writeFileToDisk(ckey: string, data: any) {
		const filePath = this.getPreferencesPath(ckey);
		const userFolder = path.dirname(filePath);
		if (!(await safeAccess(userFolder))) {
			await mkdir(userFolder, { recursive: true });
		}

		await writeFile(filePath, JSON.stringify(data, null, 2));
		this.logger.info(`Wrote preferences for ckey ${ckey} to ${filePath}`);
	}

	async checkExistingPreferences(ckey: string): Promise<boolean> {
		const filePath = this.getPreferencesPath(ckey);
		return await safeAccess(filePath);
	}
}
