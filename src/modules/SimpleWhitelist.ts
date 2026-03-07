import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ChannelType,
	Events,
	type GuildMember,
	type Interaction,
	type Message,
	MessageFlags,
	type NonThreadGuildBasedChannel,
	OverwriteType,
	PermissionsBitField,
	type TextChannel,
} from "discord.js";
import type { AroxelpClient } from "../Aroxelp";
import { sleep } from "../other";
import BaseModule from "./BaseModule";

type Config = {
	/** Category ID that ticketsbot (or a similar ticket system) uses to create new tickets under. */
	TicketCategoryChannelID: string;
	/** Admins that can approve whitelist requests */
	AdminRoleIDs: string[];
	/** The role to give the user when approved by an admin */
	WhitelistedRoleID: string;
	/** Channel ID that should be ignored when scanning for tickets n shit. */
	CreationChannelID: string;
	/** Array of IDs (users, users with roles) that should be ignored when checking permissions */
	ChannelCheckIgnoreIDs: string[];
};

/**
 * SimpleWhitelist
 * This module is similar to the SS13PreferncesImporter in the sense that
 * it relies on category/channel creation based ticket bot, that uses
 * permission overrides so we can see who made the ticket. No, there's no
 * API ticketsbot exposes that we can use for this, we just have to use Discord Permissions
 */
export default class SimpleWhitelist extends BaseModule<Config> {
	static requiredConfigKeys?: (keyof Config)[] = ["TicketCategoryChannelID", "WhitelistedRoleID"];

	constructor(bot: AroxelpClient) {
		super(bot);

		this.onInteraction = this.onInteraction.bind(this);
		this.onChannelCreate = this.onChannelCreate.bind(this);
		this.onReady = this.onReady.bind(this);
		bot.on(Events.InteractionCreate, this.onInteraction);
		bot.on(Events.ChannelCreate, this.onChannelCreate);
		void this.onReady();
	}

	async onReady() {
		try {
			const categoryChannel = await this.bot.channels.fetch(this.config.TicketCategoryChannelID, {
				force: true,
			});

			if (categoryChannel?.type !== ChannelType.GuildCategory) {
				this.logger.error("Configured TicketCategoryChannelID is NOT a category channel!");
				return;
			}

			for (const [id, _channel] of categoryChannel.children.cache) {
				if (id === this.config.CreationChannelID || !_channel.isTextBased() || _channel.type !== ChannelType.GuildText) {
					continue;
				}

				const channel = _channel as TextChannel;

				const perms = channel.permissionsFor(this.bot.user!);
				if (!perms?.has(PermissionsBitField.Flags.ManageChannels)) {
					this.logger.error(`Missing permission to edit topic in channel ${channel.name} (${channel.id})`);
					continue;
				}

				if (!perms.has(PermissionsBitField.Flags.SendMessages)) {
					this.logger.error(`Missing permission to send messages in channel ${channel.name} (${channel.id})`);
					continue;
				}

				const topic = channel.topic ?? "";

				// snowflake wrapped in () - look at the edit() call in onChannelCreate
				const match = topic.match(/\((\d{17,20})\)/);

				if (!match) {
					await this.onChannelCreate(channel);
					continue;
				}

				const messageId = match[1];

				try {
					const msg = await channel.messages.fetch(messageId);

					// do it exist?
					if (!msg || msg.author.id !== this.bot.user?.id) {
						await this.onChannelCreate(channel);
					}
				} catch {
					// it double dont
					await this.onChannelCreate(channel);
				}
			}
		} catch (error) {
			this.logger.error(error);
		}
	}

	async onChannelCreate(channel: TextChannel | NonThreadGuildBasedChannel) {
		if (channel.parentId !== this.config.TicketCategoryChannelID) {
			return;
		}

		if (!channel.isTextBased() || channel.isVoiceBased() || channel.type === ChannelType.GuildNews) {
			return;
		}

		await sleep(5000);

		const permissionOverwrites = channel.permissionOverwrites.cache;
		const channelMembers = [];

		for (const [id, override] of permissionOverwrites) {
			if (override.type === OverwriteType.Member) {
				const member = await channel.guild.members.fetch(id).catch(() => null);
				if (!member) {
					this.logger.warn(`Could not fetch member with ID ${id} for channel ${channel.id}`);
					continue;
				}
				channelMembers.push(member);
			}
		}

		const targetMember = channelMembers
			.filter((member) => member.id !== channel.guild.ownerId)
			.filter((member) => !this.config.ChannelCheckIgnoreIDs.includes(member.id))
			.filter((member) => {
				for (const roleId of member.roles.cache.keys()) {
					if (this.config.ChannelCheckIgnoreIDs.includes(roleId)) return false;
				}
				return true;
			})
			.sort((a, b) => a.roles.cache.size - b.roles.cache.size)[0];

		if (!targetMember) {
			this.logger.warn(`Could not find target member for channel ${channel.id}`);
			return;
		}

		if (targetMember.roles.cache.has(this.config.WhitelistedRoleID)) {
			const msg = await channel.send({
				content: `User <@${targetMember.id}> is already whitelisted.`,
				flags: MessageFlags.SuppressNotifications,
				allowedMentions: {
					users: [],
					roles: [],
				},
			});
			await this.applyWatermark(channel, msg);
			return;
		}

		const promptMessage = await this.sendApprovePromptMessage(channel, targetMember);
		await this.applyWatermark(channel, promptMessage);
	}

	async applyWatermark(channel: TextChannel, message: Message) {
		const topic = channel.topic ?? "";

		const watermarkRegex = /\(\d{17,20}\)/;

		let newTopic: string;

		if (watermarkRegex.test(topic)) {
			newTopic = topic.replace(watermarkRegex, `(${message.id})`);
		} else {
			const separator = topic.length > 0 ? " | " : "";
			newTopic = `${topic}${separator}Dont touch this: (${message.id})`;
		}

		await channel.edit({
			topic: newTopic,
		});
	}

	async sendApprovePromptMessage(channel: TextChannel, targetMember: GuildMember) {
		return await channel.send({
			content: `Whitelist request for <@${targetMember.id}>. Admins can approve or deny this request by clicking the buttons below.\nOn approval, will give role: <@&${this.config.WhitelistedRoleID}>`,
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setCustomId(`approve-whitelist:${channel.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
					new ButtonBuilder().setCustomId(`deny-whitelist:${channel.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
				),
			],
			flags: MessageFlags.SuppressNotifications,
			allowedMentions: {
				users: [],
				roles: [],
			},
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

			if (action === "approve-whitelist" || action === "deny-whitelist") {
				await this.handleApprove(interaction, action);
			}
		}, this.logger)(interaction);
	}

	async handleApprove(interaction: ButtonInteraction, action: string) {
		if (!interaction.guild)
			return await interaction.reply({
				content: "This interaction can only be used within a server.",
				flags: MessageFlags.Ephemeral,
			});

		const approvalMessage = await interaction.message.fetch();
		const approvingMember = await interaction.guild.members.fetch(interaction.user.id);
		if (!this.canApproveWhitelistRequest(approvingMember)) {
			return await interaction.reply({
				content: "You don't have permission to approve/deny this whitelist request.",
				flags: MessageFlags.Ephemeral,
			});
		}

		if (action === "approve-whitelist") {
			const targetUserId = approvalMessage.content.match(/<@!?(\d+)>/)?.[1];
			if (!targetUserId) {
				this.logger.warn(`Could not find target user ID in message: ${approvalMessage.content}`);
				return await interaction.reply({
					content: "Could not find the user to approve in the message.",
					flags: MessageFlags.Ephemeral,
				});
			}

			const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
			if (!targetMember) {
				this.logger.warn(`Could not fetch target member with ID ${targetUserId}`);
				return await interaction.reply({
					content: `<@${approvingMember.id}> Could not find the user to approve in the server.`,
				});
			}

			await interaction.message.edit({
				components: [],
			});
			if (targetMember.roles.cache.has(this.config.WhitelistedRoleID)) {
				return await interaction.reply({
					content: `<@${approvingMember.id}> This user already has the whitelisted role.`,
				});
			}

			await targetMember.roles.add(
				this.config.WhitelistedRoleID,
				`Whitelisted by ${approvingMember.user.tag} (${approvingMember.id})`,
			);
			await interaction.reply({
				content: `<@${approvingMember.id}> has approved whitelist request for <@${targetUserId}>`,
			});
		} else if (action === "deny-whitelist") {
			await interaction.reply({
				content: `Whitelist request has been denied by <@${approvingMember.id}>.`,
				allowedMentions: {
					users: [],
					roles: [],
				},
			});
			await interaction.message.edit({
				components: [],
			});
		}
	}

	canApproveWhitelistRequest(member: GuildMember) {
		return (
			member.permissions.has("Administrator") ||
			member.permissions.has("ManageRoles") ||
			this.config.AdminRoleIDs.some((roleId) => member.roles.cache.has(roleId))
		);
	}
}
