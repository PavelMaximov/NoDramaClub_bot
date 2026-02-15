import type { BotContext } from "../context";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { inviteService } from "../../services/inviteService";
import { profilePostService } from "../../services/profilePostService";
import { userKeyboards } from "../keyboards/userKeyboards";

export async function adminApprove(ctx: BotContext, userId: number) {
  profilesRepo.patch(userId, { state: "approved" });

  await profilePostService.postApprovedProfile(ctx.telegram, userId);

  const link = await inviteService.createOneTimeInviteLink(ctx.telegram);

  await ctx.telegram.sendMessage(
    userId,
    "Анкета одобрена ✅\n\n" +
      "Нажми кнопку ниже, чтобы войти в чат.\n" +
      "Ссылка одноразовая и действует ограниченное время.",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Войти в чат", url: link }]],
      },
    },
  );

  await ctx.answerCbQuery("Approved");
  await tryEditAdminMessage(
    ctx,
    "✅ Одобрено. Анкета опубликована. Ссылка отправлена пользователю (join request).",
  );
}

export async function adminReject(ctx: BotContext, userId: number) {
  profilesRepo.patch(userId, { state: "rejected" });

  await ctx.telegram.sendMessage(
    userId,
    "Анкета отклонена ❌\n" +
      "Если хочешь — заполни анкету заново и добавь больше информации без ссылок/рекламы.",
  );

  await ctx.answerCbQuery("Rejected");
  await tryEditAdminMessage(ctx, "❌ Отклонено. Пользователь уведомлён.");
}

export async function adminRequestEdit(ctx: BotContext, userId: number) {
  profilesRepo.patch(userId, { state: "pending_edit" });

  await ctx.telegram.sendMessage(
    userId,
    "Нужны правки по анкете 📝\n" +
      "Пожалуйста, обнови описание/интересы и отправь анкету снова.\n" +
      "Команда: /start → Заполнить анкету.",
      userKeyboards.main(),
  );

  await ctx.answerCbQuery("Edit requested");
  await tryEditAdminMessage(
    ctx,
    "📝 Запрошены правки. Пользователь уведомлён.",
  );
}

export async function adminRequestEditStart(ctx: BotContext, userId: number) {
  // сохраняем в сессии админа, что ждём текст правок
  ctx.session.adminEditDraft = { targetUserId: userId };

  await ctx.answerCbQuery("Напиши, что исправить");
  await ctx.reply(
    "Напиши одним сообщением, что нужно исправить в анкете.\n" +
      "Например: «Добавь больше информации о себе, убери ссылку, замени фото 2 на более чёткое…»\n\n" +
      "Отмена: /cancel"
  );
}

async function tryEditAdminMessage(ctx: BotContext, newText: string) {
  try {
    if ("editMessageText" in ctx) {
      await ctx.editMessageText(newText);
    }
  } catch {
    // ignore
  }
}
