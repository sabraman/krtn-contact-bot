/**
 * src/bot/core.ts — grammY bot instance and shared configuration.
 */

import { Bot } from "grammy";
import { CONFIG } from "../config.ts";

if (!CONFIG.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is required");
}

export const bot = new Bot(CONFIG.BOT_TOKEN);
