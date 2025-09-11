import { Client, GatewayIntentBits, WebhookClient } from 'discord.js';
import config from '../config.json' with { type: "json" };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const webhookClients = new Map();

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

        await webhookClient.send({
          content: `${!forwardRule.disableUsername ? `**${message.author.username}**:` : null} ${message.content}`,
          files: attachments,
          username: !forwardRule.disableUsername ? message.author.username : undefined,
          avatarURL: !forwardRule.disableAvatar ? message.author.displayAvatarURL() : undefined
        });

        console.debug(`Forwarded message from (${message.id}) ${message.author.tag} in #${message.channel.name}`);
      } catch (error) {
        console.error(`Failed to forward message to webhook:`, error);
      }
    }
  }
});

client.login(config.token);
