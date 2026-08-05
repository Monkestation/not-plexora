import Knex from "knex";
import type { AroxelpClient } from "../Aroxelp";
import BaseModule from "./BaseModule";

export type SS13PlayerData = {
	ckey: string;
	byond_key: string;
	firstseen: Date;
	firstseen_round_id: number;
	lastseen: Date;
	lastseen_round_id: number;
	ip: number;
	computerid: string;
	lastadminrank: string;
	accountjoindate: string;
	flags: number;
	antag_tokens?: number;
	metacoins?: number;
	patreon_key?: string;
	patreon_rank?: string;
	twitch_rank?: string;
	twitch_user?: string;
};

// ID - connectionUrl
type Config = Record<string, string>;

export default class SS13Database extends BaseModule<Config> {
	knex: Record<string, Knex.Knex>;
	constructor(bot: AroxelpClient) {
		super(bot);
		this.knex = {};
		for (const dbId in this.config) {
			const url = new URL(this.config[dbId]);

			this.knex[dbId] = Knex({
				client: url.protocol.slice(0, -1), // mysql2, pg, or something else. if you host your ss13 db on sqlite im concerned.
				connection: {
					host: url.hostname,
					port: url.port ? Number(url.port) : undefined,
					user: decodeURIComponent(url.username),
					password: decodeURIComponent(url.password),
					database: url.pathname.slice(1),

					supportBigNumbers: true,
					bigNumberStrings: true,
				},
			});
		}
	}

	getORM(dbId: string) {
		return this.knex[dbId];
	}

	async getPlayerInfo(ckey: string, dbId: string) {
		const knexInstance = this.knex[dbId];
		if (!knexInstance) {
			this.logger.error(`No database configuration found for ID: ${dbId}`);
			return null;
		}

		try {
			const result = await knexInstance("players").select("*").where({ ckey }).first();

			if (!result) {
				return null;
			}

			return result;
		} catch (error) {
			this.logger.error(`Error fetching player info for ckey: ${ckey} from database ID: ${dbId}`, error);
			return null;
		}
	}

	async getPlayerInfoByDiscordId(discordId: string, dbId: string) {
		const knexInstance = this.knex[dbId];
		if (!knexInstance) {
			this.logger.error(`No database configuration found for ID: ${dbId}`);
			return null;
		}

		try {
			const linkRecord = await knexInstance("discord_links").select("*").where({ discord_id: discordId }).first();

			if (!linkRecord) {
				return null;
			}

			const ckey = linkRecord.ckey;
			const result = await knexInstance("players").select("*").where({ ckey }).first();

			if (!result) {
				return null;
			}

			return result;
		} catch (error) {
			this.logger.error(`Error fetching player info for discordId: ${discordId} from database ID: ${dbId}`, error);
			return null;
		}
	}
}
