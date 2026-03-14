/**
 * src/bot/handlers.ts — Unified grammY handlers for both production and development.
 */

import { InlineKeyboard } from "grammy";
import { parseInput, ContactInputError } from "../utils/phone.ts";
import { CONFIG } from "../config.ts";
import { bot } from "./core.ts";

const getHelpText = (username: string) => `
*Бот для контактов* — просто отправьте номер телефона в чат, и я создам карточку контакта.

*Примеры:*
• \`+79991234567\`
• \`89991234567\`
• \`9991234567\` (для RU)
• \`+79991234567 --name "Иван"\` (с именем)

*Инлайн-режим (в любом чате):*
• \`@${username} +79991234567\`

*Флаги (опционально):*
  \`--name\`    Полное имя
  \`--region\`  Код страны (RU, FR и др.)

*Примечание:* Бот создает карточку контакта и дает ссылку на профиль.
`.trim();

// /start
bot.command("start", async (ctx) => {
  const helpText = getHelpText(ctx.me.username);
  await ctx.reply(
    `👋 Привет! Я помогаю конвертировать номера телефонов в карточки контактов Telegram.\n\n${helpText}`,
    { parse_mode: "Markdown" }
  );
});

// /help
bot.command("help", async (ctx) => {
  await ctx.reply(getHelpText(ctx.me.username), { parse_mode: "Markdown" });
});

// /contact
bot.command("contact", async (ctx) => {
  const payload = String(ctx.match ?? "").trim();

  if (!payload) {
    await ctx.reply(
      "Использование: /contact <номер> [--name \"Имя\"] [--region XX]\n\n" +
        "Пример:\n  /contact +79991234567 --name \"Иван\""
    );
    return;
  }

  try {
    const result = parseInput(payload, CONFIG.DEFAULT_REGION);
    const { phone, firstName, lastName, vcard } = result.contact;

    const profileUrl = `https://t.me/${phone}`;
    const inlineKeyboard = new InlineKeyboard().url("👤 Открыть профиль", profileUrl);

    await ctx.replyWithContact(phone, firstName, {
      last_name: lastName || undefined,
      vcard,
      reply_markup: inlineKeyboard,
    });
  } catch (err) {
    if (err instanceof ContactInputError) {
      await ctx.reply(`❌ ${err.message}`);
    } else {
      console.error("[command /contact] Unexpected error:", err);
      await ctx.reply("❌ Произошла непредвиденная ошибка.");
    }
  }
});

// Inline mode
bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query.trim();

  if (!query) {
    const helpText = getHelpText(ctx.me.username);
    const helpTextPlain = helpText.replace(/\*/g, "");
    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: "help",
          title: "Бот для контактов — Использование",
          description: "Нажмите, чтобы узнать, как пользоваться ботом",
          input_message_content: {
            message_text: helpTextPlain,
          },
        },
      ],
      { cache_time: 0, is_personal: true }
    );
    return;
  }

  try {
    const result = parseInput(query, CONFIG.DEFAULT_REGION);
    const { phone, firstName, lastName, vcard } = result.contact;
    const id = btoa(phone + firstName + lastName).slice(0, 64);

    const profileUrl = `https://t.me/${phone}`;
    const inlineKeyboard = new InlineKeyboard().url("👤 Открыть профиль", profileUrl);

    await ctx.answerInlineQuery(
      [
        {
          type: "contact",
          id,
          phone_number: phone,
          first_name: firstName,
          last_name: lastName || undefined,
          vcard,
          reply_markup: inlineKeyboard,
        },
      ],
      { cache_time: 0, is_personal: true }
    );
  } catch (err) {
    const msg = err instanceof ContactInputError ? err.message : "Внутренняя ошибка";
    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: "error",
          title: `❌ Неверный ввод`,
          description: msg,
          input_message_content: {
            message_text: `❌ *Неверный ввод:* ${msg}`,
            parse_mode: "Markdown",
          },
        },
      ],
      { cache_time: 0, is_personal: true }
    );
  }
});

// Fallback message handler
bot.on("message", async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text || text.startsWith("/")) return;

  try {
    const result = parseInput(text, CONFIG.DEFAULT_REGION);
    const { phone, firstName, lastName, vcard } = result.contact;
    const profileUrl = `https://t.me/${phone}`;
    const inlineKeyboard = new InlineKeyboard().url("👤 Открыть профиль", profileUrl);

    await ctx.replyWithContact(phone, firstName, {
      last_name: lastName || undefined,
      vcard,
      reply_markup: inlineKeyboard,
    });
  } catch (err) {
    if (err instanceof ContactInputError) {
      await ctx.reply(
        `❌ ${err.message}\n\n` +
          "Примеры:\n" +
          "  +79991231234\n" +
          "  79991231234\n" +
          "  /help — полное руководство"
      );
    } else {
      console.error("[message] Unexpected error:", err);
      await ctx.reply("❌ Произошла непредвиденная ошибка.");
    }
  }
});

