import { Client, GatewayIntentBits, WebhookClient } from 'discord.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import config from '../config.json' with { type: "json" };
import path from 'path';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const webhookClients = new Map();
const DATA_FOLDER = path.join(import.meta.dirname, 'data');
const FORWARDED_MESSAGES_FILE = `${DATA_FOLDER}/forwardedMessages.json`;

if (!existsSync(DATA_FOLDER)) {
  mkdirSync(DATA_FOLDER);
}

let forwardedMessages = new Map();
try {
  if (existsSync(FORWARDED_MESSAGES_FILE)) {
    const data = readFileSync(FORWARDED_MESSAGES_FILE, 'utf8');
    forwardedMessages = new Map(JSON.parse(data));
    console.log('Loaded forwarded messages from disk.');
  }
} catch (error) {
  console.error('Failed to load forwarded messages from disk:', error);
}

const saveMessages = () => {
  try {
    writeFileSync(FORWARDED_MESSAGES_FILE, JSON.stringify([...forwardedMessages]));
    console.debug('Saved forwarded messages to disk.');
  } catch (error) {
    console.error('Failed to save forwarded messages to disk:', error);
  }
};

// this wiww make evewy devewopew cwy
forwardedMessages._set = forwardedMessages.set
forwardedMessages.set = (...args) => {
  saveMessages();
  return forwardedMessages._set(...args);
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  for (const forwardRule of config.forwards) {
    if (message.guildId === forwardRule.sourceGuildId && message.channelId === forwardRule.sourceChannelId) {
      try {
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

        console.debug(`Forwarded message from (${message.id}) ${message.author.tag} in #${message.channel.name}`);
      } catch (error) {
        console.error(`Failed to forward message to webhook:`, error);
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

    if (forwardRule) {
      try {
        const webhookClient = webhookClients.get(forwardRule.webhookUrl);
        if (webhookClient) {
          await webhookClient.deleteMessage(webhookMessageId);
          forwardedMessages.delete(message.id);
          console.debug(`Deleted webhook message (${webhookMessageId}) corresponding to original message (${message.id})`);
        }
      } catch (error) {
        console.error(`Failed to delete webhook message:`, error);
      }
    }
  }
});

client.login(config.token);

process.on('beforeExit', () => {
  saveMessages();
});