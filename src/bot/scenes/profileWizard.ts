import { Scenes } from "telegraf";
import type { BotContext } from "../context";
import type { Gender, RelationshipStatus } from "../../types";
import { usersRepo } from "../../db/repositories/usersRepo";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { photosRepo } from "../../db/repositories/photosRepo";
import { userKeyboards } from "../keyboards/userKeyboards";
import { moderationService } from "../../services/moderationService";
import { profileDeleteService } from "../../services/profileDeleteService";

export const profileWizard = new Scenes.WizardScene<BotContext>(
  "PROFILE_WIZARD",

  // Step 0: ensure rows + ask gender
  async (ctx) => {
    const userId = ctx.from?.id;
    const mode = (ctx.scene.state as any)?.mode as "new" | "edit" | undefined;

    if (!userId) return ctx.scene.leave();

    usersRepo.ensure(userId);
    profilesRepo.ensure(userId);
    if (mode !== "edit") {
      photosRepo.clear(userId);
    }

    await ctx.reply(
      "Выбери свой пол (это определит ветку в чате):",
      userKeyboards.gender(),
    );
    return ctx.wizard.next();
  },

  // Step 1: catch gender callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;
    if (!data?.startsWith("profile:gender:")) {
      await ctx.reply("Нажми одну из кнопок: Парень или Девушка.");
      return;
    }

    const gender = data.endsWith(":male")
      ? ("male" as Gender)
      : ("female" as Gender);
    profilesRepo.patch(userId, { gender });

    await ctx.answerCbQuery();
    await ctx.reply("Теперь выбери статус:", userKeyboards.relationship());
    return ctx.wizard.next();
  },

  // Step 2: relationship status
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;
    if (!data?.startsWith("profile:rel:")) {
      await ctx.reply("Нажми одну из кнопок: В отношениях / Без отношений.");
      return;
    }

    const relationship_status = data.endsWith(":in_relation")
      ? ("in_relation" as RelationshipStatus)
      : ("single" as RelationshipStatus);

    profilesRepo.patch(userId, { relationship_status });

    await ctx.answerCbQuery();
    await ctx.reply("Укажи свое Имя, которое будет отображаться в анкете:");
    return ctx.wizard.next();
  },

  // Step 3: display name
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;
    const name = (text ?? "").trim();

    if (name.length < 2 || name.length > 20) {
      await ctx.reply("Имя должно быть 2–20 символов. Попробуй ещё раз.");
      return;
    }

    profilesRepo.patch(userId, { display_name: name });

    await ctx.reply(
      "Выбери основной город (для фильтрации):",
      userKeyboards.cityMain(),
    );
    return ctx.wizard.next();
  },

  // Step 4: city main (buttons)
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;
    if (!data?.startsWith("profile:city:")) {
      await ctx.reply(
        "Выбери основной город кнопкой ниже. (Детали проживания уточним позже)",
      );
      return;
    }

    const city = data.replace("profile:city:", "");
    profilesRepo.patch(userId, { city_main: city });

    await ctx.answerCbQuery();

    await ctx.reply(
      "Уточни место проживания (район/посёлок/село рядом). Можно коротко.\n" +
        "Пример: Spandau / рядом с Potsdam / Dorf bei München. \n" +
        "Или нажми кнопку «Пропустить», если не хочешь указывать детали.",
      userKeyboards.skipLocationDetail(),
    );
    return ctx.wizard.next();
  },

  // Step 5: location detail
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    // 1) Если нажали кнопку "Пропустить"
    const cbData = (ctx.callbackQuery as any)?.data as string | undefined;
    if (cbData === "profile:locdetail:skip") {
      // Вариант А (проще): ставим null всегда
      profilesRepo.patch(userId, { location_detail: null });

      await ctx.answerCbQuery();
      await ctx.reply("Ок, пропустили. Сколько тебе лет? (числом)");
      return ctx.wizard.next();
    }

    // 2) Если это текст
    const text = (ctx.message as any)?.text as string | undefined;
    const detail = (text ?? "").trim();

    if (detail.length === 0) {
      profilesRepo.patch(userId, { location_detail: null });
      await ctx.reply("Ок. Сколько тебе лет? (числом)");
      return ctx.wizard.next();
    }

    // Минимум 2 символа, если уже что-то ввёл
    if (detail.length < 2) {
      await ctx.reply(
        "Слишком коротко. Напиши чуть конкретнее (минимум 2 символа) или нажми «Пропустить».",
        userKeyboards.skipLocationDetail(),
      );
      return;
    }

    profilesRepo.patch(userId, { location_detail: detail });

    await ctx.reply("Сколько тебе лет? (числом)");
    return ctx.wizard.next();
  },

  // Step 6: age
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;
    const age = Number(text);
    if (!Number.isInteger(age) || age < 18 || age > 99) {
      await ctx.reply(
        "Возраст должен быть числом от 18 до 99. Попробуй ещё раз.",
      );
      return;
    }

    profilesRepo.patch(userId, { age });
    await ctx.reply("Напиши о себе или что ты ищешь (минимум 20 символов):");
    return ctx.wizard.next();
  },

  // Step 7: about
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;
    if (!text || text.trim().length < 20) {
      await ctx.reply("Напиши о себе или что ты ищешь (минимум 20 символов):");
      return;
    }

    profilesRepo.patch(userId, { about: text.trim() });
    await ctx.reply("Интересы (через запятую, до 5):");
    return ctx.wizard.next();
  },

  // Step 8: tags
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const text = (ctx.message as any)?.text as string | undefined;
    if (!text) {
      await ctx.reply("Напиши интересы текстом.");
      return;
    }

    // очень простая нормализация
    const tags = text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);

    profilesRepo.patch(userId, { tags: JSON.stringify(tags) });

    const mode = (ctx.scene.state as any)?.mode as "new" | "edit" | undefined;
    
    const count = photosRepo.count(userId);

    if (mode === "edit" && count >= 2) {
      // Фото уже есть — пропускаем шаг загрузки фото
      const profile = profilesRepo.get(userId);
      const photos = photosRepo.list(userId);

      await ctx.reply("Фото сохраняем. Проверим анкету перед отправкой:");

      if (photos.length) {
        await ctx.replyWithMediaGroup(
          photos.map((p) => ({ type: "photo", media: p.file_id })),
        );
      }

      await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());
      return ctx.wizard.selectStep(10); // перейти на шаг submit
    }

    await ctx.reply(
      "Теперь отправь 2–3 фото.\n" +
        "Обязательно фото на которых видно тебя. \n" +
        "Когда загрузишь минимум 2 — нажми «Готово»."
    );
    return ctx.wizard.next();
  },

  // Step 9: photos (accept photo messages + /donephotos)
  async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.scene.leave();

  const cbData = (ctx.callbackQuery as any)?.data as string | undefined;

  // A) Удалить все фото
  if (cbData === "profile:photos:clear") {
    await ctx.answerCbQuery();

    photosRepo.clear(userId);

    await ctx.reply(
      "Фото удалены 🗑\nОтправь 2–3 фото заново.",
      userKeyboards.photosControls()
    );
    return; // остаёмся на этом же шаге
  }

  // B) Готово
  if (cbData === "profile:photos:done") {
    await ctx.answerCbQuery();

    const count = photosRepo.count(userId);
    if (count < 2) {
      await ctx.reply(
        `Пока загружено ${count}. Нужно минимум 2 фото.`,
        userKeyboards.photosControls()
      );
      return;
    }

    const profile = profilesRepo.get(userId);
    const photos = photosRepo.list(userId);

    await ctx.reply("Проверим анкету перед отправкой:");

    if (photos.length) {
      await ctx.replyWithMediaGroup(
        photos.map((p) => ({ type: "photo", media: p.file_id }))
      );
    }

    await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());
    return ctx.wizard.next(); // следующий шаг = submit
  }

  // C) Приём фото
  const photo = (ctx.message as any)?.photo?.at?.(-1);
  if (photo?.file_id) {
    photosRepo.add(userId, photo.file_id);

    const count = photosRepo.count(userId);

    if (count >= 3) {
      await ctx.reply("Загружено 3 фото — достаточно ✅");

      const profile = profilesRepo.get(userId);
      const photos = photosRepo.list(userId);

      await ctx.reply("Проверим анкету перед отправкой:");
      await ctx.replyWithMediaGroup(
        photos.map((p) => ({ type: "photo", media: p.file_id }))
      );
      await ctx.reply(formatProfilePreview(profile), userKeyboards.submit());
      return ctx.wizard.next();
    }

    await ctx.reply(
      `Фото добавлено ✅ (${count}/3). Можно добавить ещё или нажать «Готово» (мин. 2).`,
      userKeyboards.photosControls()
    );
    return;
  }

  // D) Всё остальное
  await ctx.reply(
    "Пришли фото сообщением или нажми «Готово», когда будет минимум 2.",
    userKeyboards.photosControls()
  );
},

  // Step 10: waiting for submit callback
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return ctx.scene.leave();

    const data = (ctx.callbackQuery as any)?.data as string | undefined;
    if (data === "profile:submit") {
      const current = profilesRepo.get(userId);

      if (current?.posted_message_id) {
        await profileDeleteService.deletePublishedPostsOnly(
          ctx.telegram,
          userId,
        );
      }

      profilesRepo.patch(userId, { state: "pending" });

      await ctx.answerCbQuery();
      await ctx.reply("Заявка отправлена на модерацию ✅");

      await moderationService.notifyAdminsNewProfile(ctx.telegram, userId);

      return ctx.scene.leave();
    }

    if (data === "profile:start") {
      await ctx.answerCbQuery();
      return ctx.scene.reenter();
    }

    await ctx.reply("Нажми кнопку: Отправить на модерацию или Изменить.");
  },
);

function formatProfilePreview(profile: any) {
  const genderLabel = profile?.gender === "male" ? "Парень" : "Девушка";
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
