import { Scenes } from "telegraf";
import type { BotContext } from "../context";
import type { Gender, RelationshipStatus } from "../../types";
import { usersRepo } from "../../db/repositories/usersRepo";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { photosRepo } from "../../db/repositories/photosRepo";
import { userKeyboards } from "../keyboards/userKeyboards";
import { moderationService } from "../../services/moderationService";
import { profileDeleteService } from "../../services/profileDeleteService";

type WizardMode = "new" | "edit" | "edit_one" | undefined;

type EditField =
  | "gender"
  | "status"
  | "name"
  | "city"
  | "location"
  | "age"
  | "about"
  | "tags"
  | "photos";

function getMode(ctx: BotContext): WizardMode {
  return (ctx.scene.state as any)?.mode as WizardMode;
}

function getEditField(ctx: BotContext): EditField | undefined {
  return (ctx.scene.state as any)?.field as EditField | undefined;
}

function isEditOne(ctx: BotContext): boolean {
  return getMode(ctx) === "edit_one";
}

const PREVIEW_STEP = 10;


async function showPreview(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = profilesRepo.get(userId);
  const photos = photosRepo.list(userId);

  await ctx.reply("Проверим анкету перед отправкой:");

  if (photos.length) {
    await ctx.replyWithMediaGroup(
      photos.map((p) => ({ type: "photo", media: p.file_id })),
    );
  }

  await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());

  ctx.wizard.selectStep(PREVIEW_STEP);
}


async function jumpToPreview(ctx: BotContext) {
  await showPreview(ctx);
  return;
}

export const profileWizard = new Scenes.WizardScene<BotContext>(
  "PROFILE_WIZARD",

  // Step 0: init + routing
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const mode = (ctx.scene.state as any)?.mode as string | undefined;
    const field = (ctx.scene.state as any)?.field as string | undefined;

    usersRepo.ensure(userId);
    profilesRepo.ensure(userId);

    // При новой анкете чистим фото, при edit/edit_one — нет
    if (mode !== "edit" && mode !== "edit_one") {
      photosRepo.clear(userId);
    }

    // Если редактируем только фото — сразу на шаг фото
    if (mode === "edit_one" && field === "photos") {
      photosRepo.clear(userId);
      ctx.wizard.selectStep(9);
      await ctx.reply(
        "Перезагрузка фото.\nОтправь 2–3 фото (по одному сообщению).\n" +
          "Когда загрузишь минимум 2 — нажми «Готово».",
        userKeyboards.photosControls(),
      );
      return;
    }

    // Роутинг на конкретный шаг (edit_one)
    if (mode === "edit_one" && field) {
      const STEP_BY_FIELD: Record<string, number> = {
        gender: 1,
        status: 2,
        name: 3,
        city: 4,
        location: 5,
        age: 6,
        about: 7,
        tags: 8,
        photos: 9,
      };

      const targetStep = STEP_BY_FIELD[field];
      if (typeof targetStep === "number") {
        // ставим курсор на шаг перед нужным и делаем next()
        ctx.wizard.selectStep(Math.max(0, targetStep - 1));
        return ctx.wizard.next();
      }
    }

    // Обычный сценарий
    await ctx.reply(
      "Выбери свой пол (это определит ветку в чате):",
      userKeyboards.gender(),
    );
    return ctx.wizard.next();
  },

  // Step 1: gender callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;

    // mini-fallback
    if (!data || !data.startsWith("profile:gender:")) {
      await ctx.reply("Выбери пол кнопкой ниже:", userKeyboards.gender());
      return;
    }

    await ctx.answerCbQuery();

    const gender = data.endsWith(":male")
      ? ("male" as Gender)
      : ("female" as Gender);

    profilesRepo.patch(userId, { gender });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Теперь выбери статус:", userKeyboards.relationship());
    return ctx.wizard.next();
  },

  // Step 2: relationship status callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;

    if (!data || !data.startsWith("profile:rel:")) {
      await ctx.reply("Выбери статус кнопкой ниже:", userKeyboards.relationship());
      return;
    }

    await ctx.answerCbQuery();

    const relationship_status = data.endsWith(":in_relation")
      ? ("in_relation" as RelationshipStatus)
      : ("single" as RelationshipStatus);

    profilesRepo.patch(userId, { relationship_status });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Укажи своё имя (2–20 символов):");
    return ctx.wizard.next();
  },

  // Step 3: display name (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Напиши имя текстом (2–20 символов).");
      return;
    }

    const name = text.trim();
    if (name.length < 2 || name.length > 20) {
      await ctx.reply("Имя должно быть 2–20 символов. Попробуй ещё раз.");
      return;
    }

    profilesRepo.patch(userId, { display_name: name });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Выбери основной город:", userKeyboards.cityMain());
    return ctx.wizard.next();
  },

  // Step 4: city callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;

    if (!data || !data.startsWith("profile:city:")) {
      await ctx.reply("Выбери город кнопкой ниже:", userKeyboards.cityMain());
      return;
    }

    await ctx.answerCbQuery();

    const city = data.replace("profile:city:", "");
    profilesRepo.patch(userId, { city_main: city });

    await ctx.reply(
      "Уточни место проживания (район/посёлок/село рядом) или нажми «Пропустить».",
      userKeyboards.skipLocationDetail(),
    );
    return ctx.wizard.next();
  },

  // Step 5: location detail (text OR skip callback)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const cbData = (ctx.callbackQuery as any)?.data as string | undefined;

    // callback branch
    if (cbData) {
      if (cbData !== "profile:locdetail:skip") {
        await ctx.answerCbQuery();
        await ctx.reply(
          "Нажми «Пропустить» или напиши место текстом.",
          userKeyboards.skipLocationDetail(),
        );
        return;
      }

      await ctx.answerCbQuery();
      profilesRepo.patch(userId, { location_detail: null });

      // если редактируем только city/location — сразу preview
      const field = getEditField(ctx);
      if (isEditOne(ctx) && (field === "city" || field === "location")) {
        await jumpToPreview(ctx);
        return;
      }

      await ctx.reply("Ок, пропустили. Сколько тебе лет? (числом 18–99)");
      return ctx.wizard.next();
    }

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply(
        "Напиши место текстом или нажми «Пропустить».",
        userKeyboards.skipLocationDetail(),
      );
      return;
    }

    const detail = text.trim();
    if (detail.length < 2) {
      await ctx.reply(
        "Слишком коротко. Напиши минимум 2 символа или нажми «Пропустить».",
        userKeyboards.skipLocationDetail(),
      );
      return;
    }

    profilesRepo.patch(userId, { location_detail: detail });

    const field = getEditField(ctx);
    if (isEditOne(ctx) && (field === "city" || field === "location")) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Сколько тебе лет? (числом 18–99)");
    return ctx.wizard.next();
  },

  // Step 6: age (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Введи возраст числом (18–99).");
      return;
    }

    const age = Number(text);
    if (!Number.isInteger(age) || age < 18 || age > 99) {
      await ctx.reply("Возраст должен быть числом от 18 до 99. Попробуй ещё раз.");
      return;
    }

    profilesRepo.patch(userId, { age });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Напиши о себе или что ты ищешь (минимум 20 символов):");
    return ctx.wizard.next();
  },

  // Step 7: about (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Напиши о себе текстом (минимум 20 символов).");
      return;
    }

    const about = text.trim();
    if (about.length < 20) {
      await ctx.reply("Нужно минимум 20 символов. Попробуй ещё раз.");
      return;
    }

    profilesRepo.patch(userId, { about });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Интересы (через запятую, до 5):");
    return ctx.wizard.next();
  },

  // Step 8: tags (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Напиши интересы текстом (через запятую, до 5).");
      return;
    }

    const tags = text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);

    profilesRepo.patch(userId, { tags: JSON.stringify(tags) });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    const mode = getMode(ctx);
    const count = photosRepo.count(userId);

    // Если edit и фото уже есть — показываем preview и переводим в submit
    if (mode === "edit" && count >= 2) {
      await showPreview(ctx);
      return;
    }

    // ✅ ВАЖНО: тут раньше не было клавиатуры — из-за этого "тишина"
    await ctx.reply(
      "Теперь отправь 2–3 фото.(Обязательно свои, чтобы тебя было видно)\n" +
        "Когда загрузишь минимум 2 — нажми «Готово».",
      userKeyboards.photosControls(),
    );
    return ctx.wizard.next();
  },

  // Step 9: photos (photo OR callbacks)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const cbData = (ctx.callbackQuery as any)?.data as string | undefined;

    // callbacks
    if (cbData) {
      // ✅ answerCbQuery сразу
      await ctx.answerCbQuery();

      if (cbData === "profile:photos:clear") {
        photosRepo.clear(userId);
        await ctx.reply(
          "Фото удалены 🗑\nОтправь 2–3 фото заново.",
          userKeyboards.photosControls(),
        );
        return;
      }

      if (cbData === "profile:photos:done") {
        const count = photosRepo.count(userId);
        if (count < 2) {
          await ctx.reply(
            `Пока загружено ${count}. Нужно минимум 2 фото.`,
            userKeyboards.photosControls(),
          );
          return;
        }

        await showPreview(ctx);
        return ctx.wizard.next();
      }

      await ctx.reply("Используй кнопки ниже:", userKeyboards.photosControls());
      return;
    }

    // photo messages
    const photo = (ctx.message as any)?.photo?.at?.(-1);
    if (photo?.file_id) {
      photosRepo.add(userId, photo.file_id);

      const count = photosRepo.count(userId);

      if (count >= 3) {
        await ctx.reply("Загружено 3 фото — достаточно ✅");
        await showPreview(ctx);
        return ctx.wizard.next();
      }

      await ctx.reply(
        `Фото добавлено ✅ (${count}/3). Можно добавить ещё или нажать «Готово» (мин. 2).`,
        userKeyboards.photosControls(),
      );
      return;
    }

    await ctx.reply(
      "Пришли фото сообщением или нажми «Готово», когда будет минимум 2.",
      userKeyboards.photosControls(),
    );
  },

  // Step 10: submit callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;

    if (!data) {
      await ctx.reply("Нажми кнопку ниже:", userKeyboards.previewActions());
      return;
    }

    if (data === "profile:submit") {
      await ctx.answerCbQuery();

      const current = profilesRepo.get(userId);

      if (current?.posted_message_id) {
        await profileDeleteService.deletePublishedPostsOnly(ctx.telegram, userId);
      }

      profilesRepo.patch(userId, { state: "pending" });
      await ctx.reply("Заявка отправлена на модерацию ✅");
      await moderationService.notifyAdminsNewProfile(ctx.telegram, userId);

      return ctx.scene.leave();
    }

    if (data === "profile:start") {
      await ctx.answerCbQuery();
      return ctx.scene.reenter();
    }

    // неизвестная кнопка
    await ctx.answerCbQuery();
    await ctx.reply("Нажми кнопку ниже:", userKeyboards.previewActions());
  },
);

function formatProfilePreview(profile: any) {
  const relLabel =
    profile?.relationship_status === "in_relation"
      ? "В отношениях"
      : "Без отношений";

  const tags = safeParseTags(profile?.tags);

  return (
    `Имя: ${profile?.display_name ?? "-"}\n` +
    `Статус: ${relLabel}\n` +
    `Город: ${profile?.city_main ?? "-"}\n` +
    `Место: ${profile?.location_detail ?? "-"}\n` +
    `Возраст: ${profile?.age ?? "-"}\n` +
    `Интересы: ${tags.length ? tags.join(", ") : "-"}\n\n` +
    `О себе:\n${profile?.about ?? "-"}`
  );
}

function safeParseTags(tagsRaw: string | null | undefined): string[] {
  if (!tagsRaw) return [];
  try {
    const v = JSON.parse(tagsRaw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
