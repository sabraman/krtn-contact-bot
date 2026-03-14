/**
 * scripts/poll.ts — Local development helper using long polling.
 */

import "../src/bot/handlers.ts";
import { bot } from "../src/bot/core.ts";
import { CONFIG } from "../src/config.ts";

console.log("[poll] Starting long polling... (Ctrl+C to stop)");
console.log(`[poll] DEFAULT_REGION: ${CONFIG.DEFAULT_REGION ?? "(none)"}`);

await bot.start({
  onStart: (info) => {
    console.log(`[poll] Bot @${info.username} is running via long polling.`);
  },
});
