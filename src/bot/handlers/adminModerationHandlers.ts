import type { BotContext } from "../context";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { inviteService } from "../../services/inviteService";
import { profilePostService } from "../../services/profilePostService";
import { userKeyboards } from "../keyboards/userKeyboards";
import { getSession } from "../sessionHelpers";
import { adminEditKeyboard } from "../keyboards/adminKeyboards";

export async function adminApprove(ctx: BotContext, userId: number) {
  profilesRepo.patch(userId, { state: "approved" });

  await profilePostService.postApprovedProfile(ctx.telegram, userId);

  const link = await inviteService.createOneTimeInviteLink(ctx.telegram);

  await ctx.telegram.sendMessage(
    userId,
    "Анкета схвалена ✅\n\n" +
      "Натисни кнопку нижче, щоб увійти в чат.\n" +
      "Посилання одноразове і діє обмежений час.",
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
    "Анкета відхилена ❌\n" +
      "Будь ласка, онови анкету знову і додай більше інформації без посилань/реклами.",
  );

  await ctx.answerCbQuery("Rejected");
  await tryEditAdminMessage(ctx, "❌ Отклонено. Пользователь уведомлён.");
}

export async function adminRequestEdit(ctx: BotContext, userId: number) {
  // помечаем как "нужны правки"
  profilesRepo.patch(userId, { state: "pending_edit" });

  // показываем админу кнопки выбора этапа
  await ctx.reply(
    "Оберіть, що саме потрібно виправити в анкеті:",
    adminEditKeyboard.chooseFields(userId)
  );

  await ctx.answerCbQuery("Edit menu");
  await tryEditAdminMessage(ctx, "✏️ Запрошено правки.\nОбери, що виправити (кнопками нижче).");
}

export async function adminRequestEditStart(ctx: BotContext, userId: number) {
  // сохраняем в сессии админа, что ждём текст правок
  getSession(ctx).adminEditDraft = { targetUserId: userId };

  await ctx.answerCbQuery("Напиши, що виправити");
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
