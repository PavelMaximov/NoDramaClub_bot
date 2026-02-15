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

import { bindTopicHandler, listTopicsHandler } from "./bot/handlers/adminHandlers";
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
import { profileDeleteService } from "./services/profileDeleteService";
import { profilesRepo } from "./db/repositories/profilesRepo";
import { photosRepo } from "./db/repositories/photosRepo";
import { adminRequestEditStart } from "./bot/handlers/adminModerationHandlers";
import { handleAdminEditText } from "./bot/handlers/adminEditTextHandler";
import { feedbackStart, feedbackText } from "./bot/handlers/feedbackHandlers";
import http from "http";

function startHealthServer() {
  const port = Number(process.env.PORT || 8000);

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("NoDramaClub bot is running");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health server listening on ${port}`);
  });
}



async function main() {
    startHealthServer();

  migrate();

  const bot = createBot();

  // Глобальный лог ошибок telegraf
  bot.catch((err) => {
    console.error("BOT ERROR:", err);
  });

  // Debug лог апдейтов (можно убрать позже)
  bot.use(async (ctx, next) => {
    console.log("UPDATE:", ctx.updateType, {
      text: (ctx.message as any)?.text,
      chatId: ctx.chat?.id,
      fromId: ctx.from?.id,
      callback: (ctx.callbackQuery as any)?.data,
      chatType: ctx.chat?.type,
    });
    return next();
  });

  // Session + Stage (до любых ctx.scene.*)
  const stage = new Scenes.Stage<BotContext>([profileWizard]);
  bot.use(session());
  bot.use(stage.middleware());


  bot.on("message", async (ctx, next) => {
    const chatType = ctx.chat?.type;

    if (chatType !== "group" && chatType !== "supergroup") {
        return next();
    }

    const msg: any = ctx.message;
    const isService =
      (Array.isArray(msg?.new_chat_members) && msg.new_chat_members.length > 0) ||
      !!msg?.left_chat_member ||
      !!msg?.new_chat_title ||
      !!msg?.new_chat_photo ||
      !!msg?.delete_chat_photo ||
      !!msg?.group_chat_created ||
      !!msg?.supergroup_chat_created ||
      !!msg?.channel_chat_created ||
      !!msg?.migrate_to_chat_id ||
      !!msg?.migrate_from_chat_id ||
      !!msg?.pinned_message;

    if (isService) {
        try {
            await ctx.deleteMessage();
        } catch {}
    }

    return next();
});

  // =========================
  // START + COMMANDS
  // =========================

  bot.start(async (ctx) => {
    const text = (ctx.message as any)?.text as string | undefined;
  const payload = text?.split(" ")?.[1]; 

  if (payload === "feedback") {
    await feedbackStart(ctx);
    return;
  }

    await ctx.reply(
      "Привет! Здесь анкеты и знакомства в безопасном формате.\n" +
        "Заполни анкету, дождись модерации и общайся через запросы.",
      userMenu.main()
    );
    
  });

  bot.command("menu", showMainMenu);
  bot.command("cancel", cancelAll);

  // Админские команды
  bot.command("bind_topic", requireAdmin, bindTopicHandler);
  bot.command("topics", requireAdmin, listTopicsHandler);

  // =========================
  // INLINE ACTIONS
  // =========================

  // Запуск анкеты (inline-кнопка)
  bot.action("profile:start", async (ctx) => {
    await ctx.answerCbQuery();

    const userId = ctx.from?.id;
    if (!userId) return;

    const profile = profilesRepo.get(userId);
    const photoCount = photosRepo.count(userId);

    if (profile && profile.state !== "inactive" && photoCount >= 2) {
      await ctx.reply(
        `У тебя уже есть анкета (${photoCount} фото).\nЧто хочешь сделать?`,
        userKeyboards.editOrNew()
      );
      return;
    }

    await ctx.scene.enter("PROFILE_WIZARD", { mode: "new" });
  });

  // Выбор режима анкеты
  bot.action("profile:edit", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter("PROFILE_WIZARD", { mode: "edit" });
  });

  bot.action("profile:new", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter("PROFILE_WIZARD", { mode: "new" });
  });

  bot.action("profile:cancel", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Ок.", userMenu.main());
  });

  // Моя анкета (inline)
  bot.action("profile:me", async (ctx) => {
    await ctx.answerCbQuery();
    await showMyProfile(ctx);
  });

  // Удаление анкеты (inline)
  bot.action("profile:delete", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Точно удалить анкету? Посты в топике тоже будут удалены.",
      userKeyboards.deleteConfirm()
    );
  });

  bot.action("profile:delete:no", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Ок, не удаляю.", userMenu.main());
  });

  bot.action("profile:delete:yes", async (ctx) => {
    await ctx.answerCbQuery();

    const userId = ctx.from?.id;
    if (!userId) return;

    await profileDeleteService.deleteProfileAndPosts(ctx.telegram, userId);
    await ctx.reply("Анкета удалена ✅", userMenu.main());
  });

  // Админ-модерация (inline)
  bot.action(/^admin:approve:(\d+)$/, requireAdmin, async (ctx) => {
    const userId = Number((ctx.match as RegExpMatchArray)[1]);
    await adminApprove(ctx, userId);
  });

  bot.action(/^admin:reject:(\d+)$/, requireAdmin, async (ctx) => {
    const userId = Number((ctx.match as RegExpMatchArray)[1]);
    await adminReject(ctx, userId);
  });

  bot.action(/^admin:edit:(\d+)$/, requireAdmin, async (ctx) => {
  const userId = Number((ctx.match as RegExpMatchArray)[1]);
  await adminRequestEditStart(ctx, userId);
});

  // Контакт-запросы (inline)
  bot.action(/^contact:request:(\d+)$/, async (ctx) => {
    const targetUserId = Number((ctx.match as RegExpMatchArray)[1]);
    await contactRequestStart(ctx, targetUserId);
  });

  bot.action(/^contact:accept:(\d+)$/, async (ctx) => {
    const requestId = Number((ctx.match as RegExpMatchArray)[1]);
    await contactAccept(ctx, requestId);
  });

  bot.action(/^contact:decline:(\d+)$/, async (ctx) => {
    const requestId = Number((ctx.match as RegExpMatchArray)[1]);
    await contactDecline(ctx, requestId);
  });

  // Жалобы (inline)
  bot.action(/^report:(\d+)$/, async (ctx) => {
    const targetUserId = Number((ctx.match as RegExpMatchArray)[1]);
    await reportStart(ctx, targetUserId);
  });

  

  // =========================
  // TEXT HANDLERS (Reply Menu + Draft режимы)
  // =========================

  // Reply Keyboard меню
  bot.hears("✅ Заполнить анкету", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const profile = profilesRepo.get(userId);
    const photoCount = photosRepo.count(userId);

    if (profile && profile.state !== "inactive" && photoCount >= 2) {
      await ctx.reply(
        `У тебя уже есть анкета (${photoCount} фото).\nЧто хочешь сделать?`,
        userKeyboards.editOrNew()
      );
      return;
    }

    await ctx.scene.enter("PROFILE_WIZARD", { mode: "new" });
  });

  bot.hears("🧾 Моя анкета", async (ctx) => {
    await showMyProfile(ctx);
  });

  bot.hears("✏️ Изменить анкету", async (ctx) => {
    await ctx.scene.enter("PROFILE_WIZARD", { mode: "edit" });
  });

  bot.hears("🗑 Удалить анкету", async (ctx) => {
    await ctx.reply(
      "Точно удалить анкету? Посты в топике тоже будут удалены.",
      userKeyboards.deleteConfirm()
    );
  });

  bot.hears("🔎 Поиск", async (ctx) => {
    await ctx.reply("Выбери город для поиска:", userKeyboards.cityMain());
  });

  // bot.hears("📜 Правила", async (ctx) => {
  //   await ctx.reply(
  //     "Правила:\n" +
  //       "1) Без рекламы и ссылок\n" +
  //       "2) Без оскорблений\n" +
  //       "3) Контакт только через запросы\n" +
  //       "4) Фейки/скам — бан\n\n" +
  //       "Нарушения можно репортить кнопкой 🚩 под анкетой."
  //   );
  //   await ctx.reply("Меню:", userMenu.main());
  // });

  // Draft-режимы (контакты/жалобы) + /cancel
  bot.on("text", async (ctx) => {
    
   await handleAdminEditText(ctx);
   await feedbackText(ctx);
    await contactDraftText(ctx);
    await reportDraftText(ctx);
  });

  // =========================
  // LAUNCH 
  // =========================

  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.launch();
  console.log("Bot launched");
}

main().catch(console.error);
