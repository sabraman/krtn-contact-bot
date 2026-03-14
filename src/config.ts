/**
 * config.ts — Centralized configuration and environment variable validation.
 */

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value || !value.trim()) {
    console.error(`[config] Missing required environment variable: ${name}`);
    Deno.exit(1);
  }
  return value.trim();
}

export const CONFIG = {
  BOT_TOKEN: requireEnv("BOT_TOKEN"),
  PUBLIC_BASE_URL: requireEnv("PUBLIC_BASE_URL"),
  WEBHOOK_PATH_SECRET: requireEnv("WEBHOOK_PATH_SECRET"),
  WEBHOOK_SECRET: Deno.env.get("WEBHOOK_SECRET"),
  DEFAULT_REGION: Deno.env.get("DEFAULT_REGION"),
} as const;

export const WEBHOOK_PATH = `/${CONFIG.WEBHOOK_PATH_SECRET}`;
