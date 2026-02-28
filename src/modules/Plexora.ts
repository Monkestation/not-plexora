// Implements a few APIs from plexora, some modules will rely on this.

import type { AroxelpClient } from "../Aroxelp";
import BaseModule from "./BaseModule";

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
export class Plexora extends BaseModule<Config> {
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
}
