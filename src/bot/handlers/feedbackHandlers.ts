import type { BotContext } from "../context";
import { feedbacksRepo } from "../../db/repositories/feedbacksRepo";
import { config } from "../../config";
import { getSession } from "../sessionHelpers";

const COOLDOWN_HOURS = 2; 

export async function feedbackStart(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  // антиспам по истории
  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const sent = feedbacksRepo.countSince(userId, since);

  if (sent >= 1) {
    await ctx.reply(
      `Ти вже відправляв повідомлення нещодавно.\n` +
      `Можна відправляти не частіше ніж 1 раз на ${COOLDOWN_HOURS} годин.\n\n` +
      `Якщо це терміново — напиши адміністратору іншим каналом.`
    );
    return;
  }

  getSession(ctx).feedbackDraft = { type: "feedback" };

  await ctx.reply(
    "Напиши свою пропозицію/правку одним повідомленням (до 800 символів).\n\n" +
      "Важливо: безглуздий спам → бан.\n" +
      "Скасування: /cancel"
  );
}

export async function feedbackText(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const draft = getSession(ctx).feedbackDraft;
  if (!draft) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  if (text.trim() === "/cancel") {
    getSession(ctx).feedbackDraft = undefined;
    await ctx.reply("Ок, відмінив.");
    return;
  }

  const msg = text.trim().slice(0, 800);
  if (msg.length < 5) {
    await ctx.reply("Занадто коротко. Напиши конкретніше або /cancel");
    return;
  }

  
  const id = feedbacksRepo.create(userId, msg);
  const u = ctx.from!;
const who = u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(" ");

  // отправили админам
  const adminText =
    `💡 Feedback #${id}\n` +
    `Від user_id: ${userId}\n\n` +
    `Від: ${who} (id:${u.id})\n\n` +
    msg;

  await Promise.all(
    config.adminIds.map((adminId) => ctx.telegram.sendMessage(adminId, adminText))
  );

  getSession(ctx).feedbackDraft = undefined;
  await ctx.reply("Відправлено ✅ Дякуємо. Якщо потрібно — ми уточнимо.");
}
