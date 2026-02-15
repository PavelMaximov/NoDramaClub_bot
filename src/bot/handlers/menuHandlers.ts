import type { BotContext } from "../context";
import { userMenu } from "../keyboards/userMenu";
import { getSession } from "../sessionHelpers";

export async function showMainMenu(ctx: BotContext) {
  await ctx.reply("Выбери действие:", userMenu.main());
}

export async function cancelAll(ctx: BotContext) {
  getSession(ctx).contactDraft = undefined;
  getSession(ctx).reportDraft = undefined;

  try {
    if (ctx.scene?.current) await ctx.scene.leave();
  } catch {}

  await ctx.reply("Ок, отменил.", userMenu.main());
}
