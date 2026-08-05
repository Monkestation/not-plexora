import { Collection, Events, GatewayIntentBits, GuildMember } from "discord.js";
import type { AroxelpClient } from "../Aroxelp";
import { sleep } from "../other";
import BaseModule from "./BaseModule";
import type { PlexoraDiscordLink } from "./Plexora";
import SS13Database, { type SS13PlayerData } from "./SS13Database";

type ServerConfig = {
	guildId: string;
	databaseIds: string[];
	// Map of Patreon tier IDs to Discord role IDs
	syncs: Record<string, string>;
	skipFirstSync?: boolean;
};

type Config = {
	servers: ServerConfig[];
};

export default class PatreonRoleSyncer extends BaseModule<Config> {
	static dependsOn = [SS13Database];
	static requiredConfigKeys: string[] = ["servers", "servers.*.syncs", "servers.*.guildId", "servers.*.databaseIds"];
	static intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];

	constructor(bot: AroxelpClient) {
		super(bot);
		bot.once(Events.ClientReady, async (client) => {
			await sleep(2_000);
			setInterval(this.syncRoles.bind(this), 120 * 60 * 1000); // every 2 hours
			void this.syncRoles();
			this.logger.info("Checking permissions and validity of roles...");
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
				this.logger.info(`Finished checks for ${server.guildId}`);
			}
		});
	}

	async syncRoles() {
		this.logger.info("Syncing roles for servers.");
		let memberUpdateCount = 0;
		for (const server of this.config.servers) {
			if (server.skipFirstSync) {
				this.logger.info(`Skipping first sync for server ${server.guildId}`);
				continue;
			}
			this.logger.info(`Syncing for server '${server.guildId}'`);
			const guild = await this.bot.guilds.fetch(server.guildId).catch(() => null);
			if (!guild) {
				this.logger.warn(`Guild '${server.guildId}' couldn't be resolved.`);
				continue;
			}
			const playerDataMap = new Map<string, { discordLink: PlexoraDiscordLink; gameData: SS13PlayerData }>();
			for (const databaseId of server.databaseIds) {
				this.logger.debug(`Syncing for server '${server.guildId}'`);

				const ORM = this.bot.getModule(SS13Database).getORM(databaseId);
				const discordLinks = await ORM<PlexoraDiscordLink>("discord_links")
					.select("*")
					.where("valid", 1)
					.andWhereNot("discord_id", null);
				this.logger.debug(`Discord links: ${discordLinks.length}`);
				if (discordLinks.length === 0) {
					this.logger.warn(`No Discord links for database '${databaseId}'`);
					continue;
				}
				const players = await ORM<SS13PlayerData>("player")
					.select("*")
					.whereIn(
						"ckey",
						discordLinks.map((p) => p.ckey),
					);
				this.logger.debug(`Players: ${discordLinks.length}`);

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
			if (playerDataMap.size === 0) {
				this.logger.warn(`Player data map size for ${server.guildId} was 0`);
				return;
			}
			const userArray = [...new Set(Array.from(playerDataMap.values()).map((p) => p.discordLink.discord_id))];
			this.logger.debug(`Fetching guild members: ${userArray.join(" ")}`);

			const CHUNK_SIZE = 100;

			let memberCollection = new Collection<string, GuildMember>();

			for (let i = 0; i < userArray.length; i += CHUNK_SIZE) {
				const chunk = userArray.slice(i, i + CHUNK_SIZE);

				const fetched = await guild.members.fetch({
					user: chunk,
				});

				for (const [id, member] of fetched) {
					memberCollection.set(id, member);
				}
			}
			if (!memberCollection) {
				this.logger.warn(`Member collection for ${server.guildId} was null`);
				continue;
			}
			this.logger.debug(`Fetched ${memberCollection.size} members for guild ${server.guildId}`);
			this.logger.debug("Looping through player data map");
			for (const [ckey, playerData] of playerDataMap) {
				this.logger.debug(`Fetching discord member data for ${ckey}`);
				const member = memberCollection.get(playerData.discordLink.discord_id);
				if (!member) {
					this.logger.debug(`No member for ckey ${ckey} with discordid '${playerData.discordLink.discord_id}'`);
					continue;
				}
				if (!playerData.gameData.patreon_rank || ["None", "", "UNSUBBED"].includes(playerData.gameData.patreon_rank)) {
					try {
						const rolesToRemove = Object.values(server.syncs).filter((roleId) => member.roles.cache.has(roleId));
						if (rolesToRemove.length > 0) {
							this.logger.debug(`${member.id} had ${rolesToRemove.length} roles to remove - ${rolesToRemove.join()}`);
							await member.roles.remove(rolesToRemove);
						}
					} catch (error) {
						this.logger.error(`Error removing role(s) from ${ckey} (${member.id})`, error);
					}
					continue;
				}
				if (!(playerData.gameData.patreon_rank in server.syncs)) {
					this.logger.debug(`${playerData.gameData.patreon_rank} not in ${server.guildId} syncs for user ${ckey} (${member.id})`);
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

					if (member.roles.resolve(resolvedRole.id)) {
						this.logger.debug(`User ${ckey} (${member.id}) already had ${rankId}/${rankRoleId}`);
						continue;
					}

					await member.roles.add(resolvedRole);
					memberUpdateCount++;
				} catch (error) {
					this.logger.error(
						`Error assigning discord role ${rankRoleId} for rank ${rankId} for user ${ckey} (${member.id})`,
						error,
					);
				}
			}
		}
		this.logger.info(`Sync finished - updated ${memberUpdateCount} members roles.`);
	}
}
