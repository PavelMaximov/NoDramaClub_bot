import type { BotContext } from "../context";
import { getSession } from "../sessionHelpers";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { config } from "../../config";


async function safeDm(ctx: BotContext, userId: number, text: string, extra?: any) {
  try {
    await ctx.telegram.sendMessage(userId, text, extra);
    return true;
  } catch {
    return false;
  }
}

async function getUserLabel(ctx: BotContext, userId: number) {
  try {
    const chat: any = await ctx.telegram.getChat(userId);
    if (chat?.username) return `@${chat.username}`;
    const name = [chat?.first_name, chat?.last_name].filter(Boolean).join(" ").trim();
    if (name) return name;
  } catch {
    // ignore
  }

  const profile = profilesRepo.get(userId) as any;
  return profile?.display_name ?? `id:${userId}`;
}


export async function reportStart(ctx: BotContext, targetUserId: number) {
  const fromUserId = ctx.from?.id;
  if (!fromUserId) return;

  if (fromUserId === targetUserId) {
    await ctx.answerCbQuery("Нельзя пожаловаться на самого себя", { show_alert: true });
    return;
  }

  const targetProfile = profilesRepo.get(targetUserId);
  if (!targetProfile || targetProfile.state !== "approved") {
    await ctx.answerCbQuery("Анкета сейчас недоступна", { show_alert: true });
    return;
  }

  // сохраняем draft
  getSession(ctx).reportDraft = { targetUserId };

  // Пишем только в ЛС
  const targetLabel = await getUserLabel(ctx, targetUserId);
  const ok = await safeDm(
    ctx,
    fromUserId,
    "🚩 Жалоба на анкету\n\n" +
      `Кого: ${targetLabel}\n\n` +
      "Напиши одним сообщением, что случилось (до 800 символов).\n" +
      "Важно: бессмысленный спам → бан.\n\n" +
      "Отмена: /cancel"
  );

  if (ok) {
    await ctx.answerCbQuery("Напиши жалобу в личке бота");
  } else {
    getSession(ctx).reportDraft = undefined;
    await ctx.answerCbQuery(
      "Не могу написать тебе в личку. Открой бота в ЛС и нажми /start, затем повтори.",
      { show_alert: true }
    );
  }
}


export async function reportDraftText(ctx: BotContext) {
  const fromUserId = ctx.from?.id;
  if (!fromUserId) return;

  const draft = getSession(ctx).reportDraft;
  if (!draft) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  if (text.trim() === "/cancel") {
    getSession(ctx).reportDraft = undefined;
    await ctx.reply("Ок, отменил.");
    return;
  }

  const msg = text.trim().slice(0, 800);
  if (msg.length < 5) {
    await ctx.reply("Слишком коротко. Опиши подробнее или /cancel");
    return;
  }

  const reporterLabel = ctx.from?.username
    ? `@${ctx.from.username}`
    : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || `id:${fromUserId}`;

  const targetLabel = await getUserLabel(ctx, draft.targetUserId);

  // Отправляем админам
  const adminText =
    "🚩 Жалоба\n\n" +
    `От: ${reporterLabel} (id:${fromUserId})\n` +
    `На: ${targetLabel} (id:${draft.targetUserId})\n\n` +
    msg;

  await Promise.all(
    config.adminIds.map((adminId) => ctx.telegram.sendMessage(adminId, adminText))
  );

  getSession(ctx).reportDraft = undefined;
  await ctx.reply("Скарга надіслана ✅ Дякуємо. Ми розберемося.");
}
