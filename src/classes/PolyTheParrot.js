import { MessageFlags, WebhookClient } from "discord.js";
import fsp from "node:fs/promises";
import { getTimeText, pickRandomInArray, randomBetween } from "../other.js";
import path from "node:path";
import logger from "../logger.js";

export default class PolyTheParrot {
  /**
   * Poly the parrot.
   * @param {string} webhook Discord webhook url
   * @param {import("node:fs").PathLike} filepath Path to phrases file
   * @param {number} minMinutes Min random minutes
   * @param {number} maxMinutes Max random minutes
   */
  constructor(webhook, filepath, minMinutes, maxMinutes) {
    this.webhook = new WebhookClient(
      {
        url: webhook,
      },
      {
        allowedMentions: {
          parse: []
        },
      }
    );

    this.filepath = filepath;
    this.MIN_MS = minMinutes * 60 * 1000;
    this.MAX_MS = maxMinutes * 60 * 1000;

    this.lastUsedPhrases = new Map(); // phrase -> timestamp
    this.REPEAT_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 hours
    this.FILTERS_REGEX = [
      /^.* has signed up as .*$/i,
      /nigger|nigga|ligger|ligga|tranny|troons|troon|faggot|retarded|retard|tardoid|tard|ret@rd|t@rd|nigg@|fag|f@g|f@ggot|pussy|pussi|ligger|ligga|nigg|minor|hitler|third reich|nazi|natzee/i
    ];
  }

  async pickAndSend() {
    const phrases = await this.getFilteredPhrases();
    const nextTrigger = this.resetTimer()

    if (phrases.length === 0) {
      logger.warn("no valid available phrases.");
      return;
    }

    const phrase = pickRandomInArray(phrases);
    this.lastUsedPhrases.set(phrase, Date.now());

    try {
      await this.webhook.send({
        content: phrase,
        flags: [MessageFlags.SuppressEmbeds, MessageFlags.SuppressNotifications],
      });
      logger.info(
        `Sent phrase '${phrase}' - Next in ${getTimeText(nextTrigger / 1000, "extended")} (${new Date(Date.now() + nextTrigger).toISOString()})`
      );
    } catch (error) {
      logger.error(error);
    }
  }

  resetTimer(e = randomBetween(this.MIN_MS, this.MAX_MS)) {
    clearTimeout(this.nextTimeout);
    this.nextTimeout = setTimeout(() => this.pickAndSend(), e);
    return e;
  }

  async getFilteredPhrases() {
    try {
      const npcFile = await fsp.readFile(path.resolve(this.filepath), "utf8");
      /**
       * @type {{
       *  phrases: string[];
       *  roundssurived: number;
       *  longestsurvival: number;
       *  longestdeathstreak: number;
       * }}
       */
      const parsedNpc = JSON.parse(npcFile);

      const now = Date.now();

      const filtered = parsedNpc.phrases.filter((phrase) => {
        const lastUsed = this.lastUsedPhrases.get(phrase);
        const tooSoon = lastUsed && now - lastUsed < this.REPEAT_INTERVAL_MS;
        let matchesFilter = false;
        for (const filter of this.FILTERS_REGEX) {
          matchesFilter = filter.test(phrase);
        }
        if (matchesFilter) {
          logger.warn(`Phrase '${phrase}' triggered filter`);
        }
        return !tooSoon && !matchesFilter;
      });

      return filtered;
    } catch (error) {
      logger.error(error);
      return [`Failed to read file\n\`\`\`\n${error}\`\`\``];
    }
  }
}
