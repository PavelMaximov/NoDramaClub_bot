import { Telegraf } from "telegraf";
import { config } from "../config";
import type { BotContext } from "./context";

export function createBot() {
  const bot = new Telegraf<BotContext>(config.botToken);
  bot.catch((err) => console.error("BOT ERROR:", err));
  return bot;
}
