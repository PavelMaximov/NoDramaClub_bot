import type { BotContext } from "../context";
import { contactRequestsRepo } from "../../db/repositories/contactRequestsRepo";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { getSession } from "../sessionHelpers";

/**

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
    username,
    fullName,
    displayName,
    label: username ?? displayName ?? fullName ?? `id:${userId}`,
  };
}

function userLink(userId: number) {
  return `tg://user?id=${userId}`;
}

/**
 * 
 */
async function safeDm(ctx: BotContext, userId: number, text: string, extra?: any) {
  try {
    await ctx.telegram.sendMessage(userId, text, extra);
    return true;
  } catch {
    return false;
  }
}

/**

 */
export async function contactRequestStart(ctx: BotContext, targetUserId: number) {
  const fromUserId = ctx.from?.id;
  if (!fromUserId) return;

  const fromProfile = profilesRepo.get(fromUserId);
  const toProfile = profilesRepo.get(targetUserId);

  if (fromUserId === targetUserId) {
    await ctx.answerCbQuery("Не можна надіслати запит самому собі", { show_alert: true });
    return;
  }

  if (!fromProfile || fromProfile.state !== "approved") {
    await ctx.answerCbQuery("Потрібна затверджена анкета", { show_alert: true });

    // Попробуем написать в личку инструкцию (без спама в группе)
    await safeDm(
      ctx,
      fromUserId,
      "Щоб надсилати запити контакту, потрібна затверджена анкета.\n" +
        "Зайди в бота і заповни анкету: /start"
    );
    return;
  }

  if (!toProfile || toProfile.state !== "approved") {
    await ctx.answerCbQuery("Анкета зараз недоступна", { show_alert: true });
    return;
  }

  // лимит: 10 запросов за последние 24 часа
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sent = contactRequestsRepo.countSentSince(fromUserId, since);
  const LIMIT = 15;

  if (sent >= LIMIT) {
    await ctx.answerCbQuery("Ліміт запитів на сьогодні вичерпано", { show_alert: true });
    await safeDm(ctx, fromUserId, `Ліміт: ${LIMIT} запитів за 24 години. Спробуй пізніше.`);
    return;
  }

  // ✅ создаём запрос сразу (без шага “введи сообщение”)
  const defaultMessage = "Привет! Хочу познакомиться 🙂";
  const requestId = contactRequestsRepo.create(fromUserId, targetUserId, defaultMessage);

  // Кто отправил (для получателя)
  const fromIdentity = await getUserIdentity(ctx, fromUserId);
  const metaParts: string[] = [];
  if ((fromProfile as any)?.city_main) metaParts.push(`Місто: ${(fromProfile as any).city_main}`);
  if ((fromProfile as any)?.age) metaParts.push(`Вік: ${(fromProfile as any).age}`);
  const metaLine = metaParts.length ? `\n${metaParts.join(" • ")}` : "";

  // 1) Пишем получателю в ЛИЧКУ
  const deliveredToTarget = await safeDm(
    ctx,
    targetUserId,
    "Новий запит на контакт 💌\n\n" +
      `Від: ${fromIdentity.label}${metaLine}\n\n` +
      "Прийняти?",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Прийняти", callback_data: `contact:accept:${requestId}` },
            { text: "❌ Відхилити", callback_data: `contact:decline:${requestId}` },
          ],
        ],
      },
    }
  );

  // 2) Пишем отправителю в ЛИЧКУ (без сообщений в группе)
  if (deliveredToTarget) {
    const deliveredToSender = await safeDm(
      ctx,
      fromUserId,
      "Запрос отправлен ✅ Ждём ответ."
    );

    // Если отправитель не запускал бота/заблокировал — покажем alert
    if (!deliveredToSender) {
      await ctx.answerCbQuery(
        "Запит надіслано. Щоб отримувати відповіді — відкрий бота в особистих повідомленнях і натисни /start",
        { show_alert: true }
      );
    } else {
      await ctx.answerCbQuery("Запит надіслано ✅");
    }
  } else {
    // Получатель не доступен в личке (не запускал бота/заблокировал)
    await ctx.answerCbQuery(
      "Не вдалося надіслати запит: користувач не доступний у личці бота",
      { show_alert: true }
    );
    await safeDm(
      ctx,
      fromUserId,
      "Не вдалося надіслати запит: користувач не доступний у личці бота.\n" +
        "Так буває, якщо він не запускав бота або заблокував його."
    );
  }
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
    await ctx.reply("Повідомлення занадто коротке. Спробуй ще раз або /cancel");
    return;
  }

  const requestId = contactRequestsRepo.create(fromUserId, draft.toUserId, message);

  const fromIdentity = await getUserIdentity(ctx, fromUserId);
  const fromProfile = profilesRepo.get(fromUserId) as any;

  const metaParts: string[] = [];
  if (fromProfile?.city_main) metaParts.push(`Город: ${fromProfile.city_main}`);
  if (fromProfile?.age) metaParts.push(`Возраст: ${fromProfile.age}`);
  const metaLine = metaParts.length ? `\n${metaParts.join(" • ")}` : "";

  await ctx.telegram.sendMessage(
    draft.toUserId,
    "Новий запит на контакт 💌\n\n" +
      `Від: ${fromIdentity.label}${metaLine}\n\n` +
      `Повідомлення:\n${message}\n\n` +
      "Прийняти?",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Прийняти", callback_data: `contact:accept:${requestId}` },
            { text: "❌ Відхилити", callback_data: `contact:decline:${requestId}` },
          ],
        ],
      },
    }
  );

  getSession(ctx).contactDraft = undefined;
  await ctx.reply("Запит надіслано ✅ Ждём відповідь.");
}

export async function contactAccept(ctx: BotContext, requestId: number) {
  const me = ctx.from?.id;
  if (!me) return;

  const req = contactRequestsRepo.get(requestId);
  if (!req) {
    await ctx.answerCbQuery("Запит не знайдено", { show_alert: true });
    return;
  }

  if (req.to_user_id !== me) {
    await ctx.answerCbQuery("Це не ваш запит", { show_alert: true });
    return;
  }

  if (req.status !== "pending") {
    await ctx.answerCbQuery("Запит уже оброблено", { show_alert: true });
    return;
  }

  contactRequestsRepo.setStatus(requestId, "accepted");
  await ctx.answerCbQuery("Прийнято");

  const fromIdentity = await getUserIdentity(ctx, req.from_user_id);
  const toIdentity = await getUserIdentity(ctx, req.to_user_id);

  const toLink = userLink(req.to_user_id);
  const fromLink = userLink(req.from_user_id);

  await ctx.telegram.sendMessage(
    req.from_user_id,
    "Запит прийнято ✅\n\n" +
      "Контакт для зв'язку:\n" +
      (toIdentity.username ? `Нік: ${toIdentity.username}\n` : "") +
      (toIdentity.fullName ? `Ім'я: ${toIdentity.fullName}\n` : "") +
      (!toIdentity.username ? "Ніка немає. Відкрий профіль кнопкою нижче.\n" : ""),
    { reply_markup: { inline_keyboard: [[{ text: "Відкрити профіль", url: toLink }]] } }
  );

  await ctx.telegram.sendMessage(
    req.to_user_id,
    "Ви прийняли запит ✅\n\n" +
      "Контакт для зв'язку:\n" +
      (fromIdentity.username ? `Нік: ${fromIdentity.username}\n` : "") +
      (fromIdentity.fullName ? `Ім'я: ${fromIdentity.fullName}\n` : "") +
      (!fromIdentity.username ? "Ніка немає. Відкрий профіль кнопкою нижче.\n" : ""),
    { reply_markup: { inline_keyboard: [[{ text: "Відкрити профіль", url: fromLink }]] } }
  );

  await safeEditCallbackMessage(ctx, "✅ Запит прийнято. Контакт надіслано обоїм.");
}

export async function contactDecline(ctx: BotContext, requestId: number) {
  const me = ctx.from?.id;
  if (!me) return;

  const req = contactRequestsRepo.get(requestId);
  if (!req) {
    await ctx.answerCbQuery("Запит не знайдено", { show_alert: true });
    return;
  }

  if (req.to_user_id !== me) {
    await ctx.answerCbQuery("Це не ваш запит", { show_alert: true });
    return;
  }

  if (req.status !== "pending") {
    await ctx.answerCbQuery("Запит уже оброблено", { show_alert: true });
    return;
  }

  contactRequestsRepo.setStatus(requestId, "declined");
  await ctx.answerCbQuery("Відхилено");

  await ctx.telegram.sendMessage(req.from_user_id, "Запит відхилено ❌");
  await safeEditCallbackMessage(ctx, "❌ Запит відхилено.");
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
