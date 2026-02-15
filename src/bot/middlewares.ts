import type { MiddlewareFn } from "telegraf";
import { config } from "../config";
import type { BotContext } from "./context";

export const requireAdmin: MiddlewareFn<BotContext> = async (ctx, next) => {
  const fromId = ctx.from?.id;
  if (!fromId || !config.adminIds.includes(fromId)) {
    await ctx.reply("Доступ только для админов.");
    return;
  }
  return next();
  };