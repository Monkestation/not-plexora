// @ts-check

import { Client, GatewayIntentBits } from 'discord.js';
import {  existsSync, mkdirSync } from 'fs';
import config from '../config.json' with { type: "json" };
import path from 'path';
import logger from './logger.js';
import PolyTheParrot from './classes/PolyTheParrot.js';
import { ForwardedMessageManager } from './classes/ForwardedMessageManager.js';
import { TicketChannelRenamer } from './classes/TicketChannelRenamer.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FOLDER = path.join(import.meta.dirname, "..", 'data');
const FORWARDED_MESSAGES_FILE = `${DATA_FOLDER}/forwardedMessages.json`;

if (!existsSync(DATA_FOLDER)) {
  mkdirSync(DATA_FOLDER);
}

const modules = [];
modules.push(new ForwardedMessageManager(client, FORWARDED_MESSAGES_FILE));
modules.push(new TicketChannelRenamer(client));

if (config.poly) {
  const poly = new PolyTheParrot(config.poly.webhookUrl, config.poly.filepath, config.poly.minIntervalMinutes, config.poly.maxIntervalMinutes)
  modules.push(poly);
  poly.pickAndSend();
}

client.once('clientReady', () => {
  // @ts-ignore
  logger.info(`Logged in as ${client.user.tag}!`);
});

client.login(config.token);

client.on('error', error => {
  logger.error('Discord client error', error);
});

process.on('unhandledRejection', error => {
  logger.error('Unhandled promise rejection', error);
});