/**
 * scripts/set_webhook.ts — Register the webhook with Telegram's Bot API.
 *
 * Usage: deno task set-webhook
 *
 * Reads the same env vars as main.ts. Safe to run repeatedly.
 */

// Make this file a module so top-level await is valid in strict TS mode.
export {};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value || !value.trim()) {
    console.error(`[set_webhook] Missing required environment variable: ${name}`);
    Deno.exit(1);
  }
  return value.trim();
}

const BOT_TOKEN = requireEnv("BOT_TOKEN");
const PUBLIC_BASE_URL = requireEnv("PUBLIC_BASE_URL");
const WEBHOOK_PATH_SECRET = requireEnv("WEBHOOK_PATH_SECRET");
const WEBHOOK_SECRET = requireEnv("WEBHOOK_SECRET");

const webhookUrl = `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${WEBHOOK_PATH_SECRET}`;

console.log(`[set_webhook] Registering webhook URL: ${webhookUrl}`);

const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;

const body = JSON.stringify({
  url: webhookUrl,
  secret_token: WEBHOOK_SECRET,
  // Allow all update types the bot uses
  allowed_updates: ["message", "inline_query"],
  drop_pending_updates: true,
});

const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});

const data = await response.json();

if (data.ok) {
  console.log("[set_webhook] ✅ Webhook registered successfully.");
  console.log("[set_webhook] Description:", data.description);
} else {
  console.error("[set_webhook] ❌ Failed to register webhook:");
  console.error(JSON.stringify(data, null, 2));
  Deno.exit(1);
}
