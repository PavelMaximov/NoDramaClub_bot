import type { BotContext } from "../context";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { config } from "../../config";
import { getSession } from "../sessionHelpers";

export async function handleAdminEditText(ctx: BotContext) {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  // работаем только для админов
  if (!config.adminIds.includes(adminId)) return;

  const draft = getSession(ctx).adminEditDraft;
  if (!draft) return; // админ сейчас не в режиме правок

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  // даём админам отменять режим
  if (text.trim() === "/cancel") {
    getSession(ctx).adminEditDraft = undefined;
    await ctx.reply("Ок, отменил режим правок.");
    return;
  }

  const feedback = text.trim().slice(0, 800);
  if (feedback.length < 2) {
    await ctx.reply("Слишком коротко. Напиши конкретнее или /cancel");
    return;
  }

  // ставим статус "pending_edit"
  profilesRepo.patch(draft.targetUserId, { state: "pending_edit" });

  // отправляем пользователю конкретные правки
  await ctx.telegram.sendMessage(
    draft.targetUserId,
    "Потрібні правки по анкеті 📝\n\n" +
      "Що виправити:\n" +
      feedback +
      "\n\n" +
      "Вибери «✏️ Змінити анкету», потім надішли на модерацію знову."
  );

  getSession(ctx).adminEditDraft = undefined;

  await ctx.reply("Отправил пользователю список правок ✅");
}
