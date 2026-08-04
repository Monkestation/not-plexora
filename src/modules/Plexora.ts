// Implements a few APIs from plexora, some modules will rely on this.

import type { AroxelpClient } from "../Aroxelp";
import BaseModule from "./BaseModule";
import { SS13PlayerData } from "./SS13Database";

type Config = {
	apiUrl: string;
	apiKey: string;
};

export enum PlexoraLookupResponseEnum {
	// Not really possible to return lol
	PLEXORA_DOWN = -1,
	PLEXORA_CKEYPOLL_FAILED = 0,
	PLEXORA_CKEYPOLL_NOTLINKED,
	PLEXORA_CKEYPOLL_RECORDNOTVALID,
	PLEXORA_CKEYPOLL_LINKED,
	PLEXORA_CKEYPOLL_LINKED_ABSENT,
	PLEXORA_CKEYPOLL_LINKED_BANNED,
	PLEXORA_CKEYPOLL_LINKED_DELETED,
}

export type PlexoraLookupResult = {
	polling_response: PlexoraLookupResponseEnum;
	ckey?: string;
	discord_id?: string;
	discord_username?: string;
	discord_displayname?: string;
	has_requiredrole?: boolean;
	requiredrole_name?: string;
};

export type PlexoraDiscordLink = {
	id: number;
	ckey: string;
	discord_id: string;
	timestamp: Date;
	one_time_token: string;
	valid: boolean;
}

export enum PatreonRank {
	NO_RANK = "None",
	UNSUBBED = "UNSUBBED",
	THANKS_RANK = "9641441",
	ASSISTANT_RANK = "9641458",
	COMMAND_RANK = "9641523",
	TRAITOR_RANK = "9641531",
	NUKIE_RANK = "10901851",
	OLD_NUKIE_RANK = "9641543",
	NUKIE_PREMIUM_RANK = "23202435",
	ANOTHER_PREMIUM_RANK = "24353493",
}


export type PlexoraPlayerInfo = {
	discordLinks: PlexoraDiscordLink[];
	playerInfos: Record<string, SS13PlayerData>
}
export type PlexoraPlayerInfoResult = {
	players: Record<string, PlexoraPlayerInfo>
}

export default class Plexora extends BaseModule<Config> {
	requiredConfigKeys?: (keyof Config)[] = ["apiUrl", "apiKey"] as const;

	constructor(bot: AroxelpClient) {
		super(bot);
		this.checkAlive().then((alive) => {
			if (alive) {
				this.logger.info("Plexora API is alive");
			} else {
				this.logger.error("Failed to connect to Plexora API, some modules may not work");
			}
		});
	}

	async lookupCkey(serverId: string, discordId?: string, ckey?: string): Promise<PlexoraLookupResult | null> {
		if (!discordId && !ckey) {
			throw new Error("At least one of discordId or ckey must be provided");
		}
		const url = new URL("/lookupckey", this.config.apiUrl).toString();

		const body = JSON.stringify({
			discord_id: discordId,
			ckey,
		});

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Basic ${this.config.apiKey}`,
					"x-server-id": serverId,
				},
				body,
			});

			if (!response.ok) {
				throw new Error(`Plexora API returned status ${response.status}: ${await response.text()}`);
			}

			const data = (await response.json()) as PlexoraLookupResult;
			return data;
		} catch (error) {
			this.logger.error(`Error looking up ckey from Plexora API`, error);
			return null;
		}
	}

	async kickByCkey({
		server_id,
		ckey,
		kicked_by,
		reason,
		clear_prefs_cache,
	}: {
		server_id: string;
		ckey: string;
		kicked_by: string;
		reason?: string;
		clear_prefs_cache?: boolean;
	}) {
		const url = new URL("/byondserver_kick", this.config.apiUrl).toString();

		const body = JSON.stringify({
			id: server_id,
			ckey,
			admin_ckey: kicked_by,
			reason,
			clear_prefs_cache,
		});

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Basic ${this.config.apiKey}`,
				},
				body,
			});

			if (!response.ok) {
				throw new Error(`Plexora API returned status ${response.status}: ${await response.text()}`);
			}
		} catch (error) {
			this.logger.error(`Error kicking ckey from Plexora API`, error);
		}
	}

	async checkAlive() {
		const url = new URL("/api/servers/stats", this.config.apiUrl).toString();
		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Basic ${this.config.apiKey}`,
				},
			});

			return response.ok;
		} catch (error) {
			this.logger.error(`Error checking Plexora API alive endpoint`, error);
			return false;
		}
	}

	// Groups is a list of plexora server group IDs to check databases for.
	async getPlayerInfo(ckey: string | string[], groups?: string[]): Promise<PlexoraPlayerInfoResult | undefined> {
		const url = new URL(`/getplayerinfo`, this.config.apiUrl);
		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Basic ${this.config.apiKey}`,
				},
				body: JSON.stringify({
					ckey,
					groups
				})
			});

			const data = (await response.json()) as PlexoraPlayerInfoResult;
			return data
		} catch (error) {
			this.logger.error(`Error getting player info from Plexora`, error);
			return;
		}
	}
}
