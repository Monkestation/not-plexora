import fs from "node:fs";
import { EmbedBuilder } from "@discordjs/builders";
import type { AroxelpClient } from "../Aroxelp";
import BaseModule from "./BaseModule";

/*

create a module named TwitchLiveNotification using 'https://api.ivr.fi/v2/twitch/user?id=&login=', it returns json

the config should include an array of Streams, whcih are objects, and contain the discord channel id the nottification is sent to, an optional array of roleIDs to ping when live, and a message to send when the user is live.if the message is specified, it should replace the "channelusername is live"
when you send a message, it should be "${role pings} {channelusername} is live!" by default and an embed showing the channel name as the author or small title, and the tiel being the stream title, and an embed of the stream preview.

when the stream ends, change the embed message to say "{username} was live" unless specified as a config Option.
keep track of the last time a stream was live and other relevant information using a json file in case the bot dies or restarts. The module should check the Twitch API at a configurable interval (defaulting to every 2 minutes) to see if any of the specified streams are live, and send notifications accordingly.
*/

// Our types

type StreamNotificationConfig = {
	twitchUsername: string;
	discordChannelId: string;
	roleIdsToPing?: string[];
	liveMessage?: string; // Optional custom message when the user is live
	offlineMessage?: string; // Optional custom message when the user goes offline
};

type Config = {
	streams: StreamNotificationConfig[];
	checkIntervalMinutes?: number; // Optional interval for checking streams, defaulting to 2 minutes
};

// i dont know what to put here.
type StreamStatus = {
	lastMessage;
};
export class TwitchLiveNotifier extends BaseModule<Config> {
	// used to recover our last message we sent if a streamer was live.
	private lastStreamStatus: Record<string, StreamStatus> = {}; // Track the last known status of streams
	static requiredConfigKeys?: string[] = ["streams.*.twitchUsername", "streams.*.discordChannelId"];

	constructor(bot: AroxelpClient) {
		super(bot);
		this.loadLastStreamStatus();
		const interval = (this.config.checkIntervalMinutes ?? 2) * 60 * 1000;
		setInterval(() => this.checkStreams(), interval);
		this.checkStreams();
	}

	private async loadLastStreamStatus() {
		try {
			const data = await fs.promises.readFile("lastStreamStatus.json", "utf-8");
			this.lastStreamStatus = JSON.parse(data);
		} catch (error) {
			this.logger.warn("Could not load last stream status, starting fresh.");
		}
	}

	private async saveLastStreamStatus() {
		try {
			await fs.promises.writeFile("lastStreamStatus.json", JSON.stringify(this.lastStreamStatus), "utf-8");
		} catch (error) {
			this.logger.error("Could not save last stream status.", error);
		}
	}

	private async checkStreams() {
		for (const stream of this.config.streams) {
			try {
				const response = await fetch(`https://api.ivr.fi/v2/twitch/user?id=&login=${stream.twitchUsername}`);
				const data: TwitchUserResponse = await response.json();
				const isLive = data[0]?.stream?.type === "live";

				if (isLive && !this.lastStreamStatus[stream.twitchUsername]) {
					this.sendLiveNotification(stream, data[0]);
				} else if (!isLive && this.lastStreamStatus[stream.twitchUsername]) {
					this.sendOfflineNotification(stream, data[0]);
				}
			} catch (error) {
				this.logger.error(`Error checking stream ${stream.twitchUsername}: ${error}`);
			}
		}
		this.saveLastStreamStatus();
	}

	private async sendLiveNotification(stream: StreamNotificationConfig, twitchData: TwitchUser) {
		const channel = await this.bot.channels.fetch(stream.discordChannelId);
		if (!channel || !channel.isTextBased() || channel.isDMBased() || !twitchData.stream) return;

		const rolePings = stream.roleIdsToPing?.map((id) => `<@&${id}>`).join(" ") ?? "";
		const messageContent = stream.liveMessage ?? `${rolePings} ${twitchData.displayName} is live!`;

		const thumbnailUrl = await this.getPreviewThumbnailUrl(twitchData.login, PreviewSize.SD);
		const embed = new EmbedBuilder()
			.setAuthor({ name: twitchData.displayName, iconURL: twitchData.logo ?? undefined })
			.setTitle(twitchData.stream.title)
			.setImage(thumbnailUrl)
			.setColor(0x91_46_ff); // Twitch purple

		await channel.send({ content: messageContent, embeds: [embed] });
	}

	// check if we sent a live notification for this stream, if so, edit the message to say the stream is offline, otherwise do nothing
	private async sendOfflineNotification(stream: StreamNotificationConfig, twitchData: TwitchUser) {
		const channel = await this.bot.channels.fetch(stream.discordChannelId);
		if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

		const messageContent = stream.offlineMessage ?? `${twitchData.displayName} was live.`;
		// todo check if we previously sent a message for this streamer.
	}

	async getPreviewThumbnailUrl(username: string, size: PreviewSize) {
		return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${username.trim().toLowerCase()}-${size}.jpg`;
	}
}

enum PreviewSize {
	MICRO = "320x180",
	LOW = "640x360",
	SD = "852x480",
	HD = "1280x720",
}

// Ivr types

type TwitchUserResponse = TwitchUser[];

interface TwitchUser {
	banned: boolean;
	displayName: string;
	login: string;
	id: string;
	bio: string;
	follows: number | null;
	followers: number;
	profileViewCount: number | null;
	chatColor: string | null;
	logo: string | null;
	banner: string | null;
	verifiedBot: boolean | null;
	createdAt: string;
	updatedAt: string;
	emotePrefix: string | null;

	roles: TwitchUserRoles;
	badges: TwitchBadge[];
	chatterCount: number;
	chatSettings: TwitchChatSettings;

	stream: TwitchStream | null;
	lastBroadcast: TwitchLastBroadcast | null;

	panels: TwitchPanel[];
}

interface TwitchUserRoles {
	isPreAffiliate: boolean | null;
	isAffiliate: boolean | null;
	isPartner: boolean | null;
	isStaff: boolean | null;
}

interface TwitchBadge {
	setID: string;
	title: string;
	description: string;
	version: string;
}

interface TwitchChatSettings {
	chatDelayMs: number;
	followersOnlyDurationMinutes: number;
	slowModeDurationSeconds: number;
	blockLinks: boolean;
	isSubscribersOnlyModeEnabled: boolean;
	isEmoteOnlyModeEnabled: boolean;
	isFastSubsModeEnabled: boolean;
	isUniqueChatModeEnabled: boolean;
	requireVerifiedAccount: boolean;
	rules: string[];
}

interface TwitchStream {
	title: string;
	id: string;
	createdAt: string;
	type: "live" | string;
	viewersCount: number;
	game: TwitchGame | null;
}

interface TwitchGame {
	displayName: string;
}

interface TwitchLastBroadcast {
	startedAt: string;
	title: string;
}

interface TwitchPanel {
	id: string;
}
