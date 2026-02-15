import type { BotContext } from "../context";
import { contactRequestsRepo } from "../../db/repositories/contactRequestsRepo";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { getSession } from "../sessionHelpers";

/**
 * Пытаемся получить @username и имя через Telegram API.
 * Может падать, если бот не имеет “чата” с пользователем (например, он не запускал бота).
 * Поэтому всегда делаем fallback.
 */
async function getUserIdentity(ctx: BotContext, userId: number) {
  let username: string | null = null;
  let fullName: string | null = null;

  try {
    const chat: any = await ctx.telegram.getChat(userId);
    if (chat?.username) username = `@${chat.username}`;
    const fn = chat?.first_name ?? "";
    const ln = chat?.last_name ?? "";
    const name = `${fn} ${ln}`.trim();
    if (name) fullName = name;
  } catch {
    // ignore
  }

  const profile = profilesRepo.get(userId);
  const displayName = (profile as any)?.display_name ?? null;

  return {
    id: userId,
    username, // @xxx или null
    fullName, // "First Last" или null
    displayName, // имя из анкеты или null
    label:
      username ??
      displayName ??
      fullName ??
      `id:${userId}`,
  };
}

function userLink(userId: number) {
  // Открытие профиля/чата в клиенте Telegram (в личке админа/юзера)
  return `tg://user?id=${userId}`;
}

export async function contactRequestStart(ctx: BotContext, targetUserId: number) {
  const fromUserId = ctx.from?.id;
  if (!fromUserId) return;

  const fromProfile = profilesRepo.get(fromUserId);
  const toProfile = profilesRepo.get(targetUserId);

  if (fromUserId === targetUserId) {
    await ctx.answerCbQuery("Нельзя отправить запрос самому себе");
    return;
  }

  if (!fromProfile || fromProfile.state !== "approved") {
    await ctx.answerCbQuery("Сначала нужно, чтобы твоя анкета была одобрена");
    await ctx.reply("Чтобы отправлять запросы, нужна одобренная анкета. /start → Заполнить анкету");
    return;
  }

  if (!toProfile || toProfile.state !== "approved") {
    await ctx.answerCbQuery("Анкета сейчас недоступна");
    return;
  }

  // лимит: 10 запросов за последние 24 часа
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sent = contactRequestsRepo.countSentSince(fromUserId, since);
  const LIMIT = 10;

  if (sent >= LIMIT) {
    await ctx.answerCbQuery("Лимит запросов на сегодня исчерпан");
    await ctx.reply(`Лимит: ${LIMIT} запросов за 24 часа. Попробуй позже.`);
    return;
  }

  await ctx.answerCbQuery();

  // Запоминаем в сессии, что ждём текст
  getSession(ctx).contactDraft = { toUserId: targetUserId };

  await ctx.reply(
    "Напиши короткое сообщение для запроса (до 300 символов).\n" +
      "Отправь обычным текстом одним сообщением.\n\n" +
      "Отмена: /cancel"
  );
}

export async function contactDraftText(ctx: BotContext) {
  const fromUserId = ctx.from?.id;
  if (!fromUserId) return;

  const draft = getSession(ctx).contactDraft;
  if (!draft) return;

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  if (text === "/cancel") {
    getSession(ctx).contactDraft = undefined;
    await ctx.reply("Ок, отменил.");
    return;
  }

  const message = text.trim().slice(0, 300);
  if (message.length < 2) {
    await ctx.reply("Сообщение слишком короткое. Попробуй ещё раз или /cancel");
    return;
  }

  // Создаём запрос в БД
  const requestId = contactRequestsRepo.create(fromUserId, draft.toUserId, message);

  // Кто отправил (для получателя)
  const fromIdentity = await getUserIdentity(ctx, fromUserId);
  const fromProfile = profilesRepo.get(fromUserId) as any;

  const metaParts: string[] = [];
  if (fromProfile?.city_main) metaParts.push(`Город: ${fromProfile.city_main}`);
  if (fromProfile?.age) metaParts.push(`Возраст: ${fromProfile.age}`);
  const metaLine = metaParts.length ? `\n${metaParts.join(" • ")}` : "";

  // Отправляем владельцу анкеты запрос с кнопками (В ЛИЧКУ, не в группу)
  await ctx.telegram.sendMessage(
    draft.toUserId,
    "Новый запрос на контакт 💌\n\n" +
      `От: ${fromIdentity.label}${metaLine}\n\n` +
      `Сообщение:\n${message}\n\n` +
      "Принять?",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Принять", callback_data: `contact:accept:${requestId}` },
            { text: "❌ Отклонить", callback_data: `contact:decline:${requestId}` },
          ],
        ],
      },
    }
  );

 getSession(ctx).contactDraft = undefined;
  await ctx.reply("Запрос отправлен ✅ Ждём ответ.");
}

export async function contactAccept(ctx: BotContext, requestId: number) {
  const me = ctx.from?.id;
  if (!me) return;

  const req = contactRequestsRepo.get(requestId);
  if (!req) {
    await ctx.answerCbQuery("Запрос не найден");
    return;
  }

  // Принимать может только получатель
  if (req.to_user_id !== me) {
    await ctx.answerCbQuery("Это не ваш запрос");
    return;
  }

  if (req.status !== "pending") {
    await ctx.answerCbQuery("Запрос уже обработан");
    return;
  }

  contactRequestsRepo.setStatus(requestId, "accepted");
  await ctx.answerCbQuery("Принято");

  // Каналы связи: @username (если есть) + кнопка на tg://user?id=...
  const fromIdentity = await getUserIdentity(ctx, req.from_user_id);
  const toIdentity = await getUserIdentity(ctx, req.to_user_id);

  const toLink = userLink(req.to_user_id);
  const fromLink = userLink(req.from_user_id);

  // Отправителю (кто просил контакт)
  await ctx.telegram.sendMessage(
    req.from_user_id,
    "Запрос принят ✅\n\n" +
      "Контакт для связи:\n" +
      (toIdentity.username ? `Ник: ${toIdentity.username}\n` : "") +
      (toIdentity.fullName ? `Имя: ${toIdentity.fullName}\n` : "") +
      (!toIdentity.username ? "Ника нет. Открой профиль кнопкой ниже.\n" : ""),
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть профиль", url: toLink }]],
      },
    }
  );

  // Получателю (кто принял)
  await ctx.telegram.sendMessage(
    req.to_user_id,
    "Вы приняли запрос ✅\n\n" +
      "Контакт для связи:\n" +
      (fromIdentity.username ? `Ник: ${fromIdentity.username}\n` : "") +
      (fromIdentity.fullName ? `Имя: ${fromIdentity.fullName}\n` : "") +
      (!fromIdentity.username ? "Ника нет. Открой профиль кнопкой ниже.\n" : ""),
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть профиль", url: fromLink }]],
      },
    }
  );

  await safeEditCallbackMessage(ctx, "✅ Запрос принят. Контакт отправлен обоим.");
}

export async function contactDecline(ctx: BotContext, requestId: number) {
  const me = ctx.from?.id;
  if (!me) return;

  const req = contactRequestsRepo.get(requestId);
  if (!req) {
    await ctx.answerCbQuery("Запрос не найден");
    return;
  }

  if (req.to_user_id !== me) {
    await ctx.answerCbQuery("Это не ваш запрос");
    return;
  }

  if (req.status !== "pending") {
    await ctx.answerCbQuery("Запрос уже обработан");
    return;
  }

  contactRequestsRepo.setStatus(requestId, "declined");
  await ctx.answerCbQuery("Отклонено");

  await ctx.telegram.sendMessage(req.from_user_id, "Запрос отклонён ❌");

  await safeEditCallbackMessage(ctx, "❌ Запрос отклонён.");
}

async function safeEditCallbackMessage(ctx: BotContext, text: string) {
  try {
    if ("editMessageText" in ctx) {
      await ctx.editMessageText(text);
    }
  } catch {
    // ignore
  }
}
