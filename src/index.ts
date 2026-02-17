import http from "http";
import { Scenes, session } from "telegraf";
import type { BotContext } from "./bot/context";

import { migrate } from "./db/migrate";
import { createBot } from "./bot/createBot";
import { requireAdmin } from "./bot/middlewares";

import { profileWizard } from "./bot/scenes/profileWizard";

import { userKeyboards } from "./bot/keyboards/userKeyboards";
import { userMenu } from "./bot/keyboards/userMenu";

import { showMainMenu, cancelAll } from "./bot/handlers/menuHandlers";
import { showMyProfile } from "./bot/handlers/profileHandlers";

import {
  bindTopicHandler,
  listTopicsHandler,
} from "./bot/handlers/adminHandlers";
import {
  adminApprove,
  adminReject,
  adminRequestEdit,
} from "./bot/handlers/adminModerationHandlers";

import {
  contactRequestStart,
  contactDraftText,
  contactAccept,
  contactDecline,
} from "./bot/handlers/contactHandlers";

import { reportStart, reportDraftText } from "./bot/handlers/reportHandlers";
import { feedbackStart, feedbackText } from "./bot/handlers/feedbackHandlers";

import { profileDeleteService } from "./services/profileDeleteService";
import { profilesRepo } from "./db/repositories/profilesRepo";
import { photosRepo } from "./db/repositories/photosRepo";
import {
  supportStart,
  supportText,
  supportAdminReplyStart,
  supportAdminText,
} from "./bot/handlers/supportHandlers";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function isGroupChat(ctx: BotContext) {
  const t = ctx.chat?.type;
  return t === "group" || t === "supergroup";
}

async function main() {
  // 0) миграции БД
  migrate();

  // 1) создаём бота
  const bot = createBot();

  // Глобальный лог ошибок telegraf
  bot.catch((err) => {
    console.error("BOT ERROR:", err);
  });

  // Debug лог апдейтов
  bot.use(async (ctx, next) => {
    console.log("UPDATE:", ctx.updateType, {
      text: (ctx.message as any)?.text,
      chatId: ctx.chat?.id,
      fromId: ctx.from?.id,
      username: ctx.from?.username ? `@${ctx.from.username}` : undefined,
      callback: (ctx.callbackQuery as any)?.data,
      chatType: ctx.chat?.type,
    });
    return next();
  });

  // 2) Session + Stage (до любых ctx.scene.*)
  const stage = new Scenes.Stage<BotContext>([profileWizard]);
  bot.use(session());
  bot.use(stage.middleware());

  // 3) Чистка service-сообщений в супергруппе
  bot.on("message", async (ctx, next) => {
    if (!isGroupChat(ctx)) return next();

    const msg: any = ctx.message;

    const isService =
      (Array.isArray(msg?.new_chat_members) &&
        msg.new_chat_members.length > 0) ||
      !!msg?.left_chat_member ||
      !!msg?.new_chat_title ||
      !!msg?.new_chat_photo ||
      !!msg?.delete_chat_photo ||
      !!msg?.group_chat_created ||
      !!msg?.supergroup_chat_created ||
      !!msg?.channel_chat_created ||
      !!msg?.migrate_to_chat_id ||
      !!msg?.migrate_from_chat_id ||
      !!msg?.pinned_message ||
      !!msg?.message_auto_delete_timer_changed;

    if (!isService) return next();

    try {
      await ctx.deleteMessage();
    } catch (e) {
      console.warn("Failed to delete service message:", {
        chatId: ctx.chat?.id,
        messageId: msg?.message_id,
        error: (e as any)?.description || e,
      });
    }
  });

  // 4) /start (поддержка deep-link start=feedback)
  bot.start(async (ctx) => {
    const text = (ctx.message as any)?.text as string | undefined;
    const payload = text?.split(" ")?.[1];

    if (payload === "feedback") {
      await feedbackStart(ctx);
      return;
    }

    await ctx.reply(
      "Привіт! Тут можна знайти знайомства за допомогою анкет.\n" +
        "Заповни анкету, дочекайся модерації та спілкуйся через запити.",
      userMenu.main(),
    );
  });

  bot.command("menu", showMainMenu);
  bot.command("cancel", cancelAll);

  // Админские команды
  bot.command("bind_topic", requireAdmin as any, bindTopicHandler);
  bot.command("topics", requireAdmin as any, listTopicsHandler);

  // 5) HEARS (кнопки меню)
  bot.hears("✅ Заповнити анкету", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const profile = profilesRepo.get(userId);
    const photoCount = photosRepo.count(userId);

    if (profile && profile.state !== "inactive" && photoCount >= 2) {
      await ctx.reply(
        `У тебе вже є анкета (${photoCount} фото).\nЩо хочеш зробити?`,
        userKeyboards.editOrNew(),
      );
      return;
    }

    await ctx.scene.enter("PROFILE_WIZARD", { mode: "new" });
  });

  bot.hears("🧾 Моя анкета", async (ctx) => showMyProfile(ctx));

  bot.hears("✏️ Змінити анкету", async (ctx) => {
    await ctx.scene.enter("PROFILE_WIZARD", { mode: "edit" });
  });

  bot.hears("🗑 Видалити анкету", async (ctx) => {
    await ctx.reply(
      "Точно видалити анкету? Пости в топіку також будуть видалені.",
      userKeyboards.deleteConfirm(),
    );
  });

  bot.hears("🔎 Поиск", async (ctx) => {
    await ctx.reply("Вибери місто для пошуку:", userKeyboards.cityMain());
  });

  bot.hears("📜 Правила", async (ctx) => {
    await ctx.reply(
      "Правила:\n" +
        "1) Без реклами та посилань\n" +
        "2) Без образливих висловлювань\n" +
        "3) Контакт лише через запити\n" +
        "4) Фейки/скам — бан\n\n" +
        "Порушення можна повідомити за допомогою кнопки 🚩 під анкетою..",
    );
    await ctx.reply("Меню:", userMenu.main());
  });

  bot.hears("🆘 Написати адміну", async (ctx) => {
    await supportStart(ctx);
  });

  // 6) INLINE ACTIONS (анкета)
  bot.action("profile:start", async (ctx) => {
    await ctx.answerCbQuery();

    const userId = ctx.from?.id;
    if (!userId) return;

    const profile = profilesRepo.get(userId);
    const photoCount = photosRepo.count(userId);

    if (profile && profile.state !== "inactive" && photoCount >= 2) {
      await ctx.reply(
        `У тебе вже є анкета (${photoCount} фото).\nЩо хочеш зробити?`,
        userKeyboards.editOrNew(),
      );
      return;
    }

    await ctx.scene.enter("PROFILE_WIZARD", { mode: "new" });
  });

  bot.action("profile:edit", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter("PROFILE_WIZARD", { mode: "edit" });
  });

  bot.action("profile:new", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter("PROFILE_WIZARD", { mode: "new" });
  });

  bot.action("profile:me", async (ctx) => {
    await ctx.answerCbQuery();
    await showMyProfile(ctx);
  });

  bot.action("profile:delete", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Точно видалити анкету? Пости в топіку також будуть видалені.",
      userKeyboards.deleteConfirm(),
    );
  });

  bot.action("profile:delete:no", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Ок, не видаляю.", userMenu.main());
  });

  bot.action("profile:delete:yes", async (ctx) => {
    await ctx.answerCbQuery();

    const userId = ctx.from?.id;
    if (!userId) return;

    await profileDeleteService.deleteProfileAndPosts(ctx.telegram, userId);
    await ctx.reply("Анкета видалена ✅", userMenu.main());
  });

  // 7) INLINE ACTIONS (админ-модерация)
  bot.action(/^admin:approve:(\d+)$/, requireAdmin as any, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = Number((ctx.match as RegExpMatchArray)[1]);
    await adminApprove(ctx, userId);
  });

  bot.action(/^admin:reject:(\d+)$/, requireAdmin as any, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = Number((ctx.match as RegExpMatchArray)[1]);
    await adminReject(ctx, userId);
  });

  bot.action(/^admin:edit:(\d+)$/, requireAdmin as any, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = Number((ctx.match as RegExpMatchArray)[1]);
    await adminRequestEdit(ctx, userId);
  });

  bot.action(
  /^admin:fix:(\d+):(name|status|city|location|age|about|tags|photos|cancel)$/,
  requireAdmin as any,
  async (ctx) => {
    await ctx.answerCbQuery();

    const userId = Number((ctx.match as RegExpMatchArray)[1]);
    const field = (ctx.match as RegExpMatchArray)[2];

    if (field === "cancel") {
      await ctx.reply("Ок, скасовано.");
      return;
    }

    const labelMap: Record<string, string> = {
      name: "Ім’я",
      status: "Статус (у відносинах/без)",
      city: "Місто",
      location: "Місце (район/село)",
      age: "Вік",
      about: "Опис",
      tags: "Інтереси",
      photos: "Фото",
    };

    await ctx.telegram.sendMessage(
      userId,
      "✏️ Потрібні правки в анкеті\n\n" +
        `Пункт: ${labelMap[field]}\n\n` +
        "Натисни кнопку нижче та виправ лише цей пункт.\n" +
        "Після цього відправ анкету на модерацію ще раз ✅",
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Виправити зараз", callback_data: `user:editfield:${field}` }]],
        },
      }
    );

    await ctx.reply(`Користувачу відправлено: ${labelMap[field]}`);
  }
);

bot.action(
  /^user:editfield:(name|status|city|location|age|about|tags|photos)$/,
  async (ctx) => {
    await ctx.answerCbQuery();
    const field = (ctx.match as RegExpMatchArray)[1];

    // если пользователь уже был в сцене — выходим
    try { await ctx.scene.leave(); } catch {}

    await ctx.scene.enter("PROFILE_WIZARD", { mode: "edit_one", field });
  }
);

  // 8) Контакты
  bot.action(/^contact:request:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const targetUserId = Number((ctx.match as RegExpMatchArray)[1]);
    await contactRequestStart(ctx, targetUserId);
  });

  bot.action(/^contact:accept:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const requestId = Number((ctx.match as RegExpMatchArray)[1]);
    await contactAccept(ctx, requestId);
  });

  bot.action(/^contact:decline:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const requestId = Number((ctx.match as RegExpMatchArray)[1]);
    await contactDecline(ctx, requestId);
  });

  // 9) Жалобы
  bot.action(/^report:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const targetUserId = Number((ctx.match as RegExpMatchArray)[1]);
    await reportStart(ctx, targetUserId);
  });

  // 10) Фидбек
  bot.action("feedback:start", async (ctx) => {
    await ctx.answerCbQuery();
    await feedbackStart(ctx);
  });
  // 11) Саппорт
  bot.action(/^support:reply:(\d+)$/, requireAdmin as any, async (ctx) => {
    await ctx.answerCbQuery();
    const targetUserId = Number((ctx.match as RegExpMatchArray)[1]);
    await supportAdminReplyStart(ctx, targetUserId);
  });

  // 11) Draft тексты (контакт/жалоба/фидбек/админ-правки)
  bot.on("text", async (ctx) => {
    await supportAdminText(ctx);
    await supportText(ctx);
    await contactDraftText(ctx);
    await reportDraftText(ctx);
    await feedbackText(ctx);
  });

  // =========================
  // WEBHOOK SERVER
  // =========================

  const port = Number(process.env.PORT || 8000);
  const webhookDomain = requiredEnv("WEBHOOK_DOMAIN");
  const webhookPath = requiredEnv("WEBHOOK_PATH");
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const server = http.createServer((req, res) => {
    try {
      // healthcheck
      if (
        req.url === "/health" &&
        (req.method === "GET" || req.method === "HEAD")
      ) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(req.method === "HEAD" ? undefined : "ok");
        return;
      }

      // webhook endpoint
      if (req.method === "POST" && req.url === webhookPath) {
        if (webhookSecret) {
          const got = req.headers["x-telegram-bot-api-secret-token"];
          if (got !== webhookSecret) {
            res.writeHead(401, { "Content-Type": "text/plain" });
            res.end("unauthorized");
            return;
          }
        }

        // передаём обработку Telegraf
        return bot.webhookCallback(webhookPath)(req as any, res as any);
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    } catch (e) {
      console.error("HTTP error:", e);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("error");
    }
  });

  server.listen(port, "0.0.0.0", async () => {
    console.log(`HTTP server listening on ${port}`);

    const fullUrl = `${webhookDomain}${webhookPath}`;
    await bot.telegram.setWebhook(
      fullUrl,
      webhookSecret ? { secret_token: webhookSecret } : undefined,
    );

    console.log("Webhook set to:", fullUrl);
  });

  // graceful shutdown
  const shutdown = () => {
    console.log("SIGTERM/SIGINT received. Closing server...");
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
