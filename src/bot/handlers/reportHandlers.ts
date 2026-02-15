import type { BotContext } from "../context";
import { config } from "../../config";
import { reportsRepo } from "../../db/repositories/reportsRepo";
import { profilesRepo } from "../../db/repositories/profilesRepo";

export async function reportStart(ctx: BotContext, targetUserId: number) {
  const reporterId = ctx.from?.id;
  if (!reporterId) return;

  // жаловаться можно только если у тебя approved анкета (антиспам)
  const reporterProfile = profilesRepo.get(reporterId);
  if (!reporterProfile || reporterProfile.state !== "approved") {
    await ctx.answerCbQuery("Нужна одобренная анкета, чтобы жаловаться");
    await ctx.reply("Чтобы пользоваться жалобами, нужна одобренная анкета. /start → Заполнить анкету");
    return;
  }

  await ctx.answerCbQuery();

  ctx.session.reportDraft = { targetUserId };

  await ctx.reply(
    "Опиши причину жалобы (до 400 символов).\n" +
      "Примеры: скам, реклама, фейк, агрессия.\n\n" +
      "Отмена: /cancel"
  );
}

export async function reportDraftText(ctx: BotContext) {
  const reporterId = ctx.from?.id;
  if (!reporterId) return;

  const draft = ctx.session.reportDraft;
  if (!draft) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  if (text === "/cancel") {
    ctx.session.reportDraft = undefined;
    await ctx.reply("Ок, отменил жалобу.");
    return;
  }

  const reason = text.trim().slice(0, 400);
  if (reason.length < 3) {
    await ctx.reply("Слишком коротко. Попробуй ещё раз или /cancel");
    return;
  }

  const reportId = reportsRepo.create(reporterId, draft.targetUserId, reason);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count24h = reportsRepo.countForTargetSince(draft.targetUserId, since);

  const msg =
    `🚩 Новая жалоба #${reportId}\n` +
    `На user_id: ${draft.targetUserId}\n` +
    `От: ${reporterId}\n` +
    `За 24ч жалоб на этого пользователя: ${count24h}\n\n` +
    `Причина:\n${reason}`;

  await Promise.all(config.adminIds.map((adminId) => ctx.telegram.sendMessage(adminId, msg)));

  ctx.session.reportDraft = undefined;
  await ctx.reply("Жалоба отправлена ✅ Спасибо. Мы проверим.");
}
