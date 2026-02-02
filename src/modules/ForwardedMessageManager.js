// @ts-check
import { WebhookClient } from 'discord.js';
import config from '../../config.json' with { type: "json" };
import logger from '../logger.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export class ForwardedMessageManager extends Map {
  /**
   * @param {import("discord.js").Client} bot 
   * @param {string} dataFolder 
   */
  constructor(bot, dataFolder) {
    super();
    this.loadMessages();
    this.dataFolder = dataFolder;
    this.bot = bot;
    this.webhookClients = new Map();

    process.on('beforeExit', () => {
      this.saveMessages();
    });
  }

  setupMiddleware() {
    this.bot.on("messageCreate", async message => {
      if (message.author.bot) return;

      for (const forwardRule of config.forwards) {
        if (message.guildId === forwardRule.sourceGuildId && message.channelId === forwardRule.sourceChannelId) {
          try {
            let ignoreTripped = false;
            if (forwardRule.ignoreRegex) {
              const regex = new RegExp(forwardRule.ignoreRegex, 'i');
              if (regex.test(message.content)) {
                ignoreTripped = true;
              }
            }

            if (ignoreTripped) {
              // @ts-ignore
              logger.debug(`Message from (${message.id}) ${message.author.tag} in #${message.channel.name} ignored due to ignoreRegex`);
              return;
            }

            let webhookClient = this.webhookClients.get(forwardRule.webhookUrl);
            if (!webhookClient) {
              webhookClient = new WebhookClient({ url: forwardRule.webhookUrl });
              this.webhookClients.set(forwardRule.webhookUrl, webhookClient);
            }

            /**
             * @type {string[]}
             */
            let attachments = [];
            if (message.attachments.size > 0) {
              attachments = message.attachments.map(attachment => attachment.url);
            }

            const sentMessage = await webhookClient.send({
              content: `${!forwardRule.disableUsername ? `**${message.author.username}**:` : null} ${message.content}`,
              files: attachments,
              username: !forwardRule.disableUsername ? message.author.username : undefined,
              avatarURL: !forwardRule.disableAvatar ? message.author.displayAvatarURL() : undefined
            });

            this.set(message.id, sentMessage.id);

            // @ts-ignore
            logger.debug(`Forwarded message from (${message.id}) ${message.author.tag} in #${message.channel.name}`);
          } catch (error) {
            logger.error(`Failed to forward message to webhook`, error);
          }
        }
      }
    });
    this.bot.on("messageUpdate", async (oldMessage, newMessage) => {
      if (this.has(oldMessage.id)) {
        const webhookMessageId = this.get(oldMessage.id);
        const forwardRule = config.forwards.find(
          rule => rule.sourceGuildId === oldMessage.guildId && rule.sourceChannelId === oldMessage.channelId
        );

        let ignoreTripped = false;
        if (forwardRule?.ignoreRegex) {
          const regex = new RegExp(forwardRule.ignoreRegex, 'i');
          if (regex.test(newMessage.content)) {
            ignoreTripped = true;
          }
        }

        if (!forwardRule || ignoreTripped) return;

        try {
          const webhookClient = this.webhookClients.get(forwardRule.webhookUrl);
          if (webhookClient) {
            /**
             * @type {string[]}
             */
            let attachments = [];
            if (newMessage.attachments.size > 0) {
              attachments = newMessage.attachments.map(attachment => attachment.url);
            }

            await webhookClient.editMessage(webhookMessageId, {
              content: `${!forwardRule.disableUsername ? `**${newMessage.author.username}**:` : null} ${newMessage.content}`,
              files: attachments,
              username: !forwardRule.disableUsername ? newMessage.author.username : undefined,
              avatarURL: !forwardRule.disableAvatar ? newMessage.author.displayAvatarURL() : undefined
            });

            logger.debug(`Updated webhook message (${webhookMessageId}) corresponding to original message (${oldMessage.id})`);
          }
        } catch (error) {
          logger.error(`Failed to update webhook message`, error);
        }
      }
    });

    this.bot.on('messageDelete', async message => {
      if (this.has(message.id)) {
        const webhookMessageId = this.get(message.id);
        const forwardRule = config.forwards.find(
          rule => rule.sourceGuildId === message.guildId && rule.sourceChannelId === message.channelId
        );

        let ignoreTripped = false;
        if (forwardRule?.ignoreRegex && message.content) {
          const regex = new RegExp(forwardRule.ignoreRegex, 'i');
          if (regex.test(message.content)) {
            ignoreTripped = true;
          }
        }

        if (!forwardRule || ignoreTripped) return;

        try {
          const webhookClient = this.webhookClients.get(forwardRule.webhookUrl);
          if (webhookClient) {
            await webhookClient.deleteMessage(webhookMessageId);
            this.delete(message.id);
            logger.debug(`Deleted webhook message (${webhookMessageId}) corresponding to original message (${message.id})`);
          }
        } catch (error) {
          logger.error(`Failed to delete webhook message`, error);
        }
      }
    });
    
  }

  /**
   * @param {string} key
   * @param {number} value
   */
  set(key, value) {
    super.set(key, value);
    this.saveMessages();
    return this;
  }

  /**
   * @param {string} key
   */
  delete(key) {
    const deleted = super.delete(key);
    this.saveMessages();
    return deleted;
  }

  saveMessages() {
    try {
      writeFileSync(this.dataFolder, JSON.stringify([...this]));
      logger.info("Messages saved!");
    } catch (error) {
      logger.error('Failed to save messages to disk', error);
    }
  }

  loadMessages() {
    try {
      if (existsSync(this.dataFolder)) {
        const data = readFileSync(this.dataFolder, 'utf8');
        const loadedData = JSON.parse(data);
        for (const [key, value] of loadedData) {
          super.set(key, value);
        }
        logger.info(`Loaded forwarded messages from ${this.dataFolder}.`);
      }
    } catch (error) {
      logger.error(`Failed to load forwarded messages from ${this.dataFolder}`, error);
    }
  }
}