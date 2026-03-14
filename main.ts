/**
 * main.ts — Deno Deploy entry point.
 */

import { webhookCallback } from "grammy";
import { bot } from "./src/bot/core.ts";
import "./src/bot/handlers.ts";
import { CONFIG, WEBHOOK_PATH } from "./src/config.ts";

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/healthz") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // Webhook endpoint
  if (pathname === WEBHOOK_PATH) {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    try {
      return await webhookCallback(bot, "std/http", {
        secretToken: CONFIG.WEBHOOK_SECRET || undefined,
      })(req);
    } catch (err) {
      console.error("[webhook] ❌ grammY error:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
}

console.log(`[startup] Bot ready. Webhook path: ${WEBHOOK_PATH}`);
Deno.serve(handler);
