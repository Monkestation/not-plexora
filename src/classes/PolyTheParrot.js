import { MessageFlags, WebhookClient } from "discord.js";
import fsp from "node:fs/promises";
import { pickRandomInArray, randomBetween } from "../other.js";
import path from "node:path";

export default class PolyTheParrot {
  /**
   * Poly the parrot.
   * @param {string} webhook Discord webhook url
   * @param {import("node:fs").PathLike} filepath Path to phrases file
   * @param {number} minMinutes Min ranodm minutes
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
    this.lastPhrase = null;
  }

  async pickAndSend() {
    const phrases = await this.getPhrases();
    this.lastPhrase = pickRandomInArray(phrases);
    await this.webhook.send({
      content: this.lastPhrase,
      flags: [MessageFlags.SuppressEmbeds, MessageFlags.SuppressNotifications],
    });
    this.nextTimeout = setTimeout(
      this.pickAndSend,
      randomBetween(this.MIN_MS, this.MAX_MS)
    );
  }

  async getPhrases() {
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
      return parsedNpc.phrases;
    } catch (error) {
      return [`Failed to read file\n\`\`\`\n${error}\`\`\``];
    }
  }
}
