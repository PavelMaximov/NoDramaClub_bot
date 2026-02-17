import type { BotContext } from "../context";
import { config } from "../../config";
import { getSession } from "../sessionHelpers";
import { userMenu } from "../keyboards/userMenu";

// антиспам в памяти (на рестарт обнуляется — для MVP норм)
const lastSupportAt = new Map<number, number>();
const COOLDOWN_MS = 5 * 60 * 1000;

function formatCooldown(msLeft: number) {
  const min = Math.ceil(msLeft / 60000);
  return `${min} хв`;
}

function getUserLabel(ctx: BotContext) {
  const u = ctx.from;
  if (!u) return "unknown";
  if (u.username) return `@${u.username}`;
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || `id:${u.id}`;
}

async function safeDm(ctx: BotContext, userId: number, text: string) {
  try {
    await ctx.telegram.sendMessage(userId, text);
    return true;
  } catch {
    return false;
  }
}


export async function supportStart(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  getSession(ctx).supportDraft = { active: true };

  try {
    await ctx.reply(
      "Опиши свою проблему одним повідомленням.\n" +
        "Наприклад: на якому кроці анкети зависло і що ти натискав.\n\n" +
        "Увага: беззмістовний спам — бан.\n" +
        "Скасувати: /cancel"
    );
    await ctx.reply("Меню:", userMenu.main());
  } catch (e) {
    console.error("SUPPORT_START_REPLY_ERROR:", e);
  }
}

/**
 * Пользователь прислал текст саппорта (в ЛС)
 */
export async function supportText(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const draft = getSession(ctx).supportDraft;
  if (!draft?.active) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const trimmed = text.trim();

  if (trimmed === "/cancel") {
  getSession(ctx).supportDraft = undefined;
  await ctx.reply("Ок, скасовано ✅", userMenu.main());
  return;
}

  if (trimmed.length < 5) {
    await ctx.reply("Занадто коротко. Напиши детальніше або /cancel");
    return;
  }

  // антиспам
  const now = Date.now();
  const last = lastSupportAt.get(userId) ?? 0;
  const diff = now - last;
  if (diff < COOLDOWN_MS) {
    const left = COOLDOWN_MS - diff;
    await ctx.reply(
      `Занадто часто. Спробуй ще раз через ${formatCooldown(left)}.\n` +
        "Якщо це терміново — напиши одним повідомленням все одразу."
    );
    // draft оставим активным, чтобы юзер мог позже отправить
    return;
  }

  lastSupportAt.set(userId, now);
  getSession(ctx).supportDraft = undefined;

  const label = getUserLabel(ctx);

  const adminMsg =
    "🆘 Повідомлення адміну\n\n" +
    `Від: ${label} (id:${userId})\n\n` +
    `Текст:\n${trimmed.slice(0, 1500)}`;

  // Отправляем админам + кнопка "Відповісти"
  await Promise.all(
    config.adminIds.map((adminId) =>
      ctx.telegram.sendMessage(adminId, adminMsg, {
        reply_markup: {
          inline_keyboard: [[{ text: "Відповісти", callback_data: `support:reply:${userId}` }]],
        },
      })
    )
  );

  await ctx.reply("Дякую! Повідомлення відправлено адміну ✅");
  await ctx.reply("Меню:", userMenu.main());
}

/**
 * Админ нажал кнопку "Відповісти" под саппорт-сообщением
 */
export async function supportAdminReplyStart(ctx: BotContext, targetUserId: number) {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  // включаем режим ответа
  getSession(ctx).supportAdminDraft = { active: true, targetUserId };

  await ctx.reply(
    "Напиши відповідь користувачу одним повідомленням.\n" +
      "Скасувати: /cancel"
  );
}

/**
 * Админ прислал текст ответа (в ЛС боту)
 */
export async function supportAdminText(ctx: BotContext) {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  const draft = getSession(ctx).supportAdminDraft;
  if (!draft?.active) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const trimmed = text.trim();

  if (trimmed === "/cancel") {
    getSession(ctx).supportAdminDraft = undefined;
    await ctx.reply("Ок, скасовано ✅");
    return;
  }

  if (trimmed.length < 2) {
    await ctx.reply("Занадто коротко. Напиши детальніше або /cancel");
    return;
  }

  const ok = await safeDm(
    ctx,
    draft.targetUserId,
    "✉️ Відповідь від адміністратора:\n\n" + trimmed.slice(0, 2000)
  );

  getSession(ctx).supportAdminDraft = undefined;

  if (ok) {
    await ctx.reply("Відправлено ✅");
  } else {
    await ctx.reply(
      "Не зміг відправити повідомлення користувачу.\n" +
        "Можливо, він не відкривав бота або заблокував його."
    );
  }
}


