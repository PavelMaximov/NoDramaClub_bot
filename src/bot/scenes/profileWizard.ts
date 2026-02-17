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

  await ctx.reply("Перевіримо анкету перед відправкою:");

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
        "Перезавантаження фото.\nНадішли 2–3 фото.\n" +
          "Коли завантажиш мінімум 2 — натисни «Готово».",
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
      "Вибери свою стать (це визначить гілку в чаті):",
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
      await ctx.reply("Вибери стать кнопкою нижче:", userKeyboards.gender());
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

    await ctx.reply("Тепер вибери статус:", userKeyboards.relationship());
    return ctx.wizard.next();
  },

  // Step 2: relationship status callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;

    if (!data || !data.startsWith("profile:rel:")) {
      await ctx.reply("Вибери статус кнопкою нижче:", userKeyboards.relationship());
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

    await ctx.reply("Укажи своє ім'я (2–20 символів):");
    return ctx.wizard.next();
  },

  // Step 3: display name (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Напиши ім'я текстом (2–20 символів).");
      return;
    }

    const name = text.trim();
    if (name.length < 2 || name.length > 20) {
      await ctx.reply("Ім'я має бути 2–20 символів. Спробуй ще раз.");
      return;
    }

    profilesRepo.patch(userId, { display_name: name });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Вибери основне місто:", userKeyboards.cityMain());
    return ctx.wizard.next();
  },

  // Step 4: city callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;

    if (!data || !data.startsWith("profile:city:")) {
      await ctx.reply("Вибери місто кнопкою нижче:", userKeyboards.cityMain());
      return;
    }

    await ctx.answerCbQuery();

    const city = data.replace("profile:city:", "");
    profilesRepo.patch(userId, { city_main: city });

    await ctx.reply(
      "Вкажи місце проживання (район/селище/село поруч) або натисни «Пропустити».",
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
          "Натисни «Пропустити» або напиши місце текстом.",
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

      await ctx.reply("Ок, пропустили. Скільки тобі років? (числом 18–99)");
      return ctx.wizard.next();
    }

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply(
        "Напиши місце текстом або натисни «Пропустити».",
        userKeyboards.skipLocationDetail(),
      );
      return;
    }

    const detail = text.trim();
    if (detail.length < 2) {
      await ctx.reply(
        "Занадто коротко. Напиши мінімум 2 символи або натисни «Пропустити».",
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

    await ctx.reply("Скільки тобі років? (числом 18–99)");
    return ctx.wizard.next();
  },

  // Step 6: age (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Введи вік числом (18–99).");
      return;
    }

    const age = Number(text);
    if (!Number.isInteger(age) || age < 18 || age > 99) {
      await ctx.reply("Вік має бути числом від 18 до 99. Спробуй ще раз.");
      return;
    }

    profilesRepo.patch(userId, { age });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Напиши про себе або що ти шукаєш (мінімум 20 символів):");
    return ctx.wizard.next();
  },

  // Step 7: about (text)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;

    if (!text) {
      await ctx.reply("Напиши про себе текстом (мінімум 20 символів).");
      return;
    }

    const about = text.trim();
    if (about.length < 20) {
      await ctx.reply("Потрібно мінімум 20 символів. Спробуй ще раз.");
      return;
    }

    profilesRepo.patch(userId, { about });

    if (isEditOne(ctx)) {
      await jumpToPreview(ctx);
      return;
    }

    await ctx.reply("Інтереси (через кому, до 5):");
    return ctx.wizard.next();
  },

  // Step 8: tags (text)
 // Step 8: tags
async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.scene.leave();

  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) {
    await ctx.reply("Напиши інтереси текстом (через кому, до 5).");
    return;
  }

  const tags = text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  profilesRepo.patch(userId, { tags: JSON.stringify(tags) });

  const mode = (ctx.scene.state as any)?.mode as "new" | "edit" | undefined;
  const count = photosRepo.count(userId);

  // Если edit и фото уже есть — сразу preview+submit
  if (mode === "edit" && count >= 2) {
    const profile = profilesRepo.get(userId);
    const photos = photosRepo.list(userId);

    await ctx.reply("Фото збережено. Перевіримо анкету перед відправкою:");

    if (photos.length) {
      await ctx.replyWithMediaGroup(
        photos.map((p) => ({ type: "photo", media: p.file_id }))
      );
    }

    await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());
    ctx.wizard.selectStep(10);
    return;
  }

  await ctx.reply(
    "Тепер надішли 2–3 фото.\n" +
      "Обов'язково фото, на яких видно тебе.\n" +
      "Коли завантажиш мінімум 2 — натисни «Готово».",
    userKeyboards.photosControls()
  );

  return ctx.wizard.next();
},


  // Step 9: photos
async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.scene.leave();

  const cbData = (ctx.callbackQuery as any)?.data as string | undefined;

  if (cbData) await ctx.answerCbQuery();

  // 1) Удалить все фото
  if (cbData === "profile:photos:clear") {
    photosRepo.clear(userId);
    await ctx.reply(
      "Фото видалено 🗑\nНадішли 2–3 фото заново.",
      userKeyboards.photosControls()
    );
    return;
  }

  // 2) Готово
  if (cbData === "profile:photos:done") {
    const count = photosRepo.count(userId);

    if (count < 2) {
      await ctx.reply(
        `Поки завантажено ${count}. Потрібно мінімум 2 фото.`,
        userKeyboards.photosControls()
      );
      return;
    }

    const profile = profilesRepo.get(userId);
    const photos = photosRepo.list(userId);

    await ctx.reply("Перевіримо анкету перед відправкою:");

    if (photos.length) {
      await ctx.replyWithMediaGroup(
        photos.map((p) => ({ type: "photo", media: p.file_id }))
      );
    }

    await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());
    return ctx.wizard.next();
  }

  // 3) Приём фото
  const photo = (ctx.message as any)?.photo?.at?.(-1);
  if (photo?.file_id) {
    photosRepo.add(userId, photo.file_id);

    const count = photosRepo.count(userId);

    if (count >= 3) {
      await ctx.reply("Завантажено 3 фото — достатньо ✅");

      const profile = profilesRepo.get(userId);
      const photos = photosRepo.list(userId);

      await ctx.reply("Перевіримо анкету перед відправкою:");

      if (photos.length) {
        await ctx.replyWithMediaGroup(
          photos.map((p) => ({ type: "photo", media: p.file_id }))
        );
      }

      await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());
      return ctx.wizard.next();
    }

    await ctx.reply(
      `Фото додано ✅ (${count}/3). Можна додати ще або натиснути «Готово» (мін. 2).`,
      userKeyboards.photosControls()
    );
    return;
  }

  // 4) Всё остальное — мини-fallback
  await ctx.reply(
    "Надішли фото повідомленням або натисни «Готово», коли буде мінімум 2.",
    userKeyboards.photosControls()
  );
},


  // Step 10: waiting for submit callback
async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.scene.leave();

  const data = (ctx.callbackQuery as any)?.data as string | undefined;

  if (data === "profile:submit") {
    await ctx.answerCbQuery();

    try {
      const current = profilesRepo.get(userId);

      if (current?.posted_message_id) {
        await profileDeleteService.deletePublishedPostsOnly(ctx.telegram, userId);
      }

      profilesRepo.patch(userId, { state: "pending" });

      await ctx.reply("Заявка відправлена на модерацію ✅");

      await moderationService.notifyAdminsNewProfile(ctx.telegram, userId);

      return ctx.scene.leave();
    } catch (e) {
      console.error("SUBMIT ERROR:", e);
      await ctx.reply(
        "Не вдалося надіслати на модерацію через помилку. Спробуй ще раз через хвилину.."
      );
      return;
    }
  }

  if (data === "profile:start") {
    await ctx.answerCbQuery();
    return ctx.scene.reenter();
  }

  // мини-fallback + чтобы не было "кнопки нет"
  await ctx.reply(
    "Натисни кнопку «Надіслати на модерацію».",
    userKeyboards.submit()
  );
},
);

function formatProfilePreview(profile: any) {
  const relLabel =
    profile?.relationship_status === "in_relation"
      ? "У відносинах"
      : "Без стосунків";

  const tags = safeParseTags(profile?.tags);

  return (
    `Ім'я: ${profile?.display_name ?? "-"}\n` +
    `Статус: ${relLabel}\n` +
    `Місто: ${profile?.city_main ?? "-"}\n` +
    `Місце: ${profile?.location_detail ?? "-"}\n` +
    `Вік: ${profile?.age ?? "-"}\n` +
    `Інтереси: ${tags.length ? tags.join(", ") : "-"}\n\n` +
    `Про себе:\n${profile?.about ?? "-"}`
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
