import type { BotContext } from "../context";
import { userMenu } from "../keyboards/userMenu";

export async function showMainMenu(ctx: BotContext) {
  await ctx.reply("Выбери действие:", userMenu.main());
}

export async function cancelAll(ctx: BotContext) {
  ctx.session.contactDraft = undefined;
  ctx.session.reportDraft = undefined;

  try {
    if (ctx.scene?.current) await ctx.scene.leave();
  } catch {}

  await ctx.reply("Ок, отменил.", userMenu.main());
}
