// @ts-check
import config from '../../config.json' with { type: "json" };
import { ChannelType, Events } from "discord.js";
import logger from '../logger.js';

export class TicketChannelRenamer {
  /**
   * @param {import("discord.js").Client} bot
   */
  constructor(bot) {
    this.bot = bot;

    this.ticketRegex = /ticket-\d*/gi;
    if (!config?.TicketChannelRenamer)
      return;
    this.rules = config?.TicketChannelRenamer ?? [];

    bot.on(Events.ChannelCreate, (channel) => this.onChannelCreate(channel));
  }

  /**
   * @param {import("discord.js").GuildChannel} _channel
   */
  async onChannelCreate(_channel) {
    if (_channel.type !== ChannelType.GuildText) return;

    /**
     * @type {import("discord.js").TextChannel}
     */
    // @ts-ignore
    const channel = _channel;
    if (!this.ticketRegex.test(channel.name)) return;

    // wait for 2 messages, or until timeout (30s)
    const messages = await this.waitForMessages(channel, 2, 30_000);
    if (!messages) return;

    const msgs = [...messages.values()].slice(0, 2);
    if (!msgs.every(m => m.author.bot)) return;

    const rule = this.findMatchingRule(msgs);
    if (!rule) return;

    const newName = `${channel.name}-${rule.append}`;
    if (newName === channel.name) return;

    try {
      await channel.setName(newName, "TicketChannelRenamer: config rule match");
    } catch (err) {
      logger.error("TicketChannelRenamer rename failed:", err);
    }
  }

  /**
   * @param {import("discord.js").TextChannel} channel
   * @param {number} count
   * @param {number} timeout
   */
  async waitForMessages(channel, count, timeout) {
    try {
      const collected = await channel.awaitMessages({
        max: count,
        time: timeout,
        errors: ["time"]
      });
      return collected;
    } catch {
      return null;
    }
  }

  /**
  * @param {import("discord.js").Message[]} msgs
  */
  findMatchingRule(msgs) {
    if (!this.rules)
      return null
    for (const rule of this.rules) {
      if (!rule.embedfind?.field || !rule.embedfind?.find || !rule.append)
        continue;

      const fieldName = rule.embedfind.field.toLowerCase();
      const valueRegex = new RegExp(rule.embedfind.find, "i");

      for (const msg of msgs) {
        for (const embed of msg.embeds) {
          const field = embed.fields?.find(
            f => f.name.toLowerCase() === fieldName
          );
          if (!field) continue;

          if (valueRegex.test(field.value)) {
            return rule;
          }
        }
      }
    }

    return null;
  }
}
