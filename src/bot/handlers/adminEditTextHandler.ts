import type { BotContext } from "../context";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { config } from "../../config";

export async function handleAdminEditText(ctx: BotContext) {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  // работаем только для админов
  if (!config.adminIds.includes(adminId)) return;

  const draft = ctx.session.adminEditDraft;
  if (!draft) return; // админ сейчас не в режиме правок

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  // даём админам отменять режим
  if (text.trim() === "/cancel") {
    ctx.session.adminEditDraft = undefined;
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
    "Нужны правки по анкете 📝\n\n" +
      "Что исправить:\n" +
      feedback +
      "\n\n" +
      "Выбери «✏️ Изменить анкету», затем отправь на модерацию снова."
  );

  ctx.session.adminEditDraft = undefined;

  await ctx.reply("Отправил пользователю список правок ✅");
}
