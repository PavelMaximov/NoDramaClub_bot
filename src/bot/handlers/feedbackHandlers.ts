import type { BotContext } from "../context";
import { feedbacksRepo } from "../../db/repositories/feedbacksRepo";
import { config } from "../../config";

const COOLDOWN_HOURS = 2; 

export async function feedbackStart(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  // антиспам по истории
  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const sent = feedbacksRepo.countSince(userId, since);

  if (sent >= 1) {
    await ctx.reply(
      `Ты уже отправлял сообщение недавно.\n` +
      `Можно отправлять не чаще чем 1 раз в ${COOLDOWN_HOURS} часов.\n\n` +
      `Если это срочно — напиши админу по другому каналу.`
    );
    return;
  }

  ctx.session.feedbackDraft = { type: "feedback" };

  await ctx.reply(
    "Напиши своё предложение/правку одним сообщением (до 800 символов).\n\n" +
      "Важно: бессмысленный спам → бан.\n" +
      "Отмена: /cancel"
  );
}

export async function feedbackText(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const draft = ctx.session.feedbackDraft;
  if (!draft) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  if (text.trim() === "/cancel") {
    ctx.session.feedbackDraft = undefined;
    await ctx.reply("Ок, отменил.");
    return;
  }

  const msg = text.trim().slice(0, 800);
  if (msg.length < 5) {
    await ctx.reply("Слишком коротко. Напиши конкретнее или /cancel");
    return;
  }

  
  const id = feedbacksRepo.create(userId, msg);
  const u = ctx.from!;
const who = u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(" ");

  // отправили админам
  const adminText =
    `💡 Feedback #${id}\n` +
    `От user_id: ${userId}\n\n` +
    `От: ${who} (id:${u.id})\n\n` +
    msg;

  await Promise.all(
    config.adminIds.map((adminId) => ctx.telegram.sendMessage(adminId, adminText))
  );

  ctx.session.feedbackDraft = undefined;
  await ctx.reply("Отправлено ✅ Спасибо. Если нужно — мы уточним.");
}
