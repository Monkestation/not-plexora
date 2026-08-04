import type { AroxelpClient } from "../Aroxelp";
import BaseModule from "./BaseModule";
import type { PlexoraDiscordLink } from "./Plexora";
import SS13Database, { type SS13PlayerData } from "./SS13Database";

type ServerConfig = {
	guildId: string;
	databaseIds: string[];
	// Map of Patreon tier IDs to Discord role IDs
	syncs: Record<string, string>;
};

type Config = {
	servers: ServerConfig[];
};

export default class PatreonRoleSyncer extends BaseModule<Config> {
	static dependsOn = [SS13Database];
	static requiredConfigKeys: string[] = ["servers", "servers.*.syncs", "servers.*.guildId", "servers.*.databaseIds"];

	constructor(bot: AroxelpClient) {
		super(bot);
		bot.once("ready", async (client) => {
			setInterval(this.syncRoles.bind(this), 10 * 60 * 1000); // every 10 minutes
			void this.syncRoles();
			for (const server of this.config.servers) {
				const guild = await client.guilds.fetch(server.guildId).catch(() => null);
				if (!guild) {
					this.logger.error(`Could not resolve guild ${server.guildId}`);
					continue;
				}

				for (const rankId in server.syncs) {
					const roleId = server.syncs[rankId];
					const role = await guild.roles.fetch(roleId).catch(() => null);
					if (!role) {
						this.logger.error(`Could not resolve role ID ${roleId} for rank ${rankId}`);
						continue;
					}
					if (!role.editable) {
						this.logger.error(
							`Role ${roleId} is resolvable but not assignable! Ensure the bot has the Manage Roles permission and that its highest role is above the roles you want it to assign.`,
						);
					}
				}
			}
		});
	}

	async syncRoles() {
		for (const server of this.config.servers) {
			const guild = await this.bot.guilds.fetch(server.guildId).catch(() => null);
			if (!guild)
				// lets not waste our time.
				continue;
			const playerDataMap = new Map<string, { discordLink: PlexoraDiscordLink; gameData: SS13PlayerData }>();
			for (const databaseId of server.databaseIds) {
				const ORM = this.bot.getModule(SS13Database).getORM(databaseId);
				const discordLinks = await ORM<PlexoraDiscordLink>("discord_links")
					.select("*")
					.where("valid", 1)
					.andWhereNot("discord_id", null);
				if (discordLinks.length === 0)
					// bruh?
					continue;
				const players = await ORM<SS13PlayerData>("player")
					.select("*")
					.whereIn(
						"ckey",
						discordLinks.map((p) => p.ckey),
					);
				const discordLinkMap = new Map(discordLinks.map((link) => [link.ckey, link]));
				for (const player of players) {
					const discordLink = discordLinkMap.get(player.ckey);
					// this isnt neccessary but i dont wanna remove the code because i changed the above statements earlier.
					if (!discordLink || !discordLink.valid || discordLink.discord_id == null) continue;
					playerDataMap.set(player.ckey, {
						discordLink,
						gameData: player,
					});
				}
			}
			if (playerDataMap.size === 0)
				// surprising
				continue;
			await guild.members
				// i only want unique discord IDs
				.fetch({ user: [...new Set(Array.from(playerDataMap.values()).map((p) => p.discordLink.discord_id))] })
				.catch(() => null);
			for (const [ckey, playerData] of playerDataMap) {
				const member = await guild.members.fetch(playerData.discordLink.discord_id).catch(() => null);
				if (!member) continue;
				if (!playerData.gameData.patreon_rank || ["None", "", "UNSUBBED"].includes(playerData.gameData.patreon_rank)) {
					try {
						const rolesToRemove = Object.values(server.syncs).filter((roleId) => member.roles.cache.has(roleId));
						if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
					} catch (error) {
						this.logger.error(`Error removing role(s) from ${ckey} (${member.id})`, error);
					}
					continue;
				}
				if (!(playerData.gameData.patreon_rank in server.syncs)) {
					continue;
				}
				const rankRoleId = server.syncs[playerData.gameData.patreon_rank];
				const rankId = playerData.gameData.patreon_rank;
				const resolvedRole = await guild.roles.fetch(rankRoleId).catch(() => null);
				if (!resolvedRole) {
					this.logger.warn(`Error resolving discord role ${rankRoleId} for rank ${rankId} for user ${ckey} (${member.id})`);
					continue;
				}
				try {
					// remove the old roles
					const rolesToRemove = Object.values(server.syncs).filter(
						(roleId) => roleId !== rankRoleId && member.roles.cache.has(roleId),
					);
					if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);

					if (member.roles.resolve(resolvedRole.id)) continue;

					await member.roles.add(resolvedRole);
				} catch (error) {
					this.logger.error(
						`Error assigning discord role ${rankRoleId} for rank ${rankId} for user ${ckey} (${member.id})`,
						error,
					);
				}
			}
		}
	}
}
