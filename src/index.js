import { Client, GatewayIntentBits, WebhookClient } from 'discord.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import config from '../config.json' with { type: "json" };
import path from 'path';
import logger from './logger.js';
import PolyTheParrot from './classes/PolyTheParrot.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const webhookClients = new Map();
const DATA_FOLDER = path.join(import.meta.dirname, "..", 'data');
const FORWARDED_MESSAGES_FILE = `${DATA_FOLDER}/forwardedMessages.json`;

if (!existsSync(DATA_FOLDER)) {
  mkdirSync(DATA_FOLDER);
}

class ForwardedMessageManager extends Map {
  constructor(dataFolder) {
    super();
    this.loadMessages();
    this.dataFolder = dataFolder;
  }

  set(key, value) {
    super.set(key, value);
    this.saveMessages();
    return this;
  }

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

const forwardedMessages = new ForwardedMessageManager(FORWARDED_MESSAGES_FILE);

if (config.poly) {
  const poly = new PolyTheParrot(config.poly.webhookUrl, config.poly.filepath, config.poly.minIntervalMinutes, config.poly.maxIntervalMinutes)
  poly.pickAndSend();
}

client.once('clientReady', () => {
  logger.info(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
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
          logger.debug(`Message from (${message.id}) ${message.author.tag} in #${message.channel.name} ignored due to ignoreRegex`);
          return;
        }
        
        let webhookClient = webhookClients.get(forwardRule.webhookUrl);
        if (!webhookClient) {
          webhookClient = new WebhookClient({ url: forwardRule.webhookUrl });
          webhookClients.set(forwardRule.webhookUrl, webhookClient);
        }

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

        forwardedMessages.set(message.id, sentMessage.id);

        logger.debug(`Forwarded message from (${message.id}) ${message.author.tag} in #${message.channel.name}`);
      } catch (error) {
        logger.error(`Failed to forward message to webhook`, error);
      }
    }
  }
});

client.on('messageDelete', async message => {
  if (forwardedMessages.has(message.id)) {
    const webhookMessageId = forwardedMessages.get(message.id);
    const forwardRule = config.forwards.find(
      rule => rule.sourceGuildId === message.guildId && rule.sourceChannelId === message.channelId
    );

    let ignoreTripped = false;
    if (forwardRule.ignoreRegex) {
      const regex = new RegExp(forwardRule.ignoreRegex, 'i');
      if (regex.test(message.content)) {
        ignoreTripped = true;
      }
    }

    if (!forwardRule || ignoreTripped) return;

    try {
      const webhookClient = webhookClients.get(forwardRule.webhookUrl);
      if (webhookClient) {
        await webhookClient.deleteMessage(webhookMessageId);
        forwardedMessages.delete(message.id);
        logger.debug(`Deleted webhook message (${webhookMessageId}) corresponding to original message (${message.id})`);
      }
    } catch (error) {
      logger.error(`Failed to delete webhook message`, error);
    }
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (forwardedMessages.has(oldMessage.id)) {
    const webhookMessageId = forwardedMessages.get(oldMessage.id);
    const forwardRule = config.forwards.find(
      rule => rule.sourceGuildId === oldMessage.guildId && rule.sourceChannelId === oldMessage.channelId
    );

    let ignoreTripped = false;
    if (forwardRule.ignoreRegex) {
      const regex = new RegExp(forwardRule.ignoreRegex, 'i');
      if (regex.test(newMessage.content)) {
        ignoreTripped = true;
      }
    }

    if (!forwardRule || ignoreTripped) return;

    try {
      const webhookClient = webhookClients.get(forwardRule.webhookUrl);
      if (webhookClient) {
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

client.login(config.token);

process.on('beforeExit', () => {
  forwardedMessages.saveMessages();
});

client.on('error', error => {
  logger.error('Discord client error', error);
});

process.on('unhandledRejection', error => {
  logger.error('Unhandled promise rejection', error);
});