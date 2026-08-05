import { Events, GatewayIntentBits, type GuildMember, type PartialGuildMember } from "discord.js";
import type { AroxelpClient } from "../Aroxelp";
import BaseModule from "./BaseModule";

type PrisonConfig = {
	guildId: string;
	/** Roles that will get you put into the role prison */
	blacklistRole: string;
	/** List of roles that are exempt from being removed */
	whitelistRoles: string[];
};
type Config = {
	/** Configuration for the prison */
	prisons: PrisonConfig[];
	/** How often to check members for blacklist role, in minutes. Default is 10. */
	checkIntervalMinutes?: number;
};

/**
 * This module forces anyone with a specific role(s) (blacklistRoles) into a "Prison"
 * Preventing them from owning ANY roles. Useful if you have onboarding setup.
 * There's a role whitelist so you can allow certain roles to be exempt from the prison.
 */
export default class RolePrison extends BaseModule<Config> {
	static requiredConfigKeys = ["prisons.*.guildId", "prisons.*.blacklistRole", "prisons.*.whitelistRoles", "prisons"];
	static intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];

	constructor(bot: AroxelpClient) {
		super(bot);

		bot.on(Events.GuildMemberUpdate, this.onMemberUpdate.bind(this));
		bot.once(Events.ClientReady, this.checkAllMembers.bind(this));
		setInterval(this.checkAllMembers.bind(this), (this.config.checkIntervalMinutes || 10) * 60 * 1000); // every 10 minutes  by default
	}

	async checkAllMembers() {
		this.logger.info("Checking all guild members for blacklist roles...");
		for (const prisonConfig of this.config.prisons) {
			const guild = await this.bot.guilds.fetch(prisonConfig.guildId);
			if (!guild) {
				this.logger.warn(`Guild with ID ${prisonConfig.guildId} not found.`);
				continue;
			}
			const blacklistRole = await guild.roles.fetch(prisonConfig.blacklistRole, { force: true });
			if (!blacklistRole) {
				this.logger.warn(`Could not resolve blacklist role with ID '${prisonConfig.blacklistRole}'`);
				continue;
			}
			for (const [id, member] of blacklistRole.members) {
				try {
					await this.onMemberUpdate(member, member);
				} catch (error) {
					this.logger.error(
						`Failed to call onMemberUpdate with user ${id} for config with guild ID ${prisonConfig.guildId}`,
						error,
					);
				}
			}
		}
	}

	async onMemberUpdate(_oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
		const prisonConfig = this.config.prisons.find((prison) => prison.guildId === newMember.guild.id);
		if (!prisonConfig) return;

		const hasBlacklistRole = newMember.roles.cache.some((role) => prisonConfig.blacklistRole === role.id);
		if (!hasBlacklistRole) return;

		await this.removeRolesFromMember(newMember, prisonConfig);
	}

	async removeRolesFromMember(member: GuildMember, prisonConfig: PrisonConfig) {
		const rolesToRemove = member.roles.cache
			.filter((role) => !prisonConfig.whitelistRoles.includes(role.id) && role.id !== prisonConfig.blacklistRole)
			.filter((role) => role.editable);
		if (rolesToRemove.size > 0) {
			try {
				await member.roles.remove(rolesToRemove);
				this.logger.info(`Removed roles from ${member.user.tag} in guild ${member.guild.name} due to blacklist role.`);
			} catch (error) {
				this.logger.error(`Failed to remove roles from ${member.user.tag} in guild ${member.guild.name}`, error);
			}
		}
	}
}
