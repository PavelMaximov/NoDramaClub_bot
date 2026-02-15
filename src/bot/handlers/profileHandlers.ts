import type { BotContext } from "../context";
import { profilesRepo } from "../../db/repositories/profilesRepo";
import { photosRepo } from "../../db/repositories/photosRepo";
import { userKeyboards } from "../keyboards/userKeyboards";

export async function showMyProfile(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = profilesRepo.get(userId);
  if (!profile || profile.state === "inactive" || profile.state === "draft") {
    await ctx.reply("Анкеты пока нет. Нажми «Заполнить анкету».", userKeyboards.main());
    return;
  }

  const photos = photosRepo.list(userId);

  // фото покажем, если есть (в личке)
  if (photos.length) {
    await ctx.replyWithMediaGroup(photos.map((p) => ({ type: "photo", media: p.file_id })));
  }

  const text = formatProfilePreview(profile);

  await ctx.reply(text + `\n\nСтатус: ${profile.state}`, userKeyboards.main());
}

function formatProfilePreview(profile: any) {
  const genderLabel = profile.gender === "male" ? "Парень" : "Девушка";
  const relLabel = profile.relationship_status === "in_relation" ? "В отношениях" : "Без отношений";
  const tags = safeParseTags(profile.tags);

  return (
    `Моя анкета\n` +
    `Пол: ${genderLabel}\n` +
    `Статус: ${relLabel}\n` +
    `Город: ${profile.city ?? "-"}\n` +
    `Возраст: ${profile.age ?? "-"}\n` +
    `Интересы: ${tags.length ? tags.join(", ") : "-"}\n\n` +
    `О себе:\n${profile.about ?? "-"}`
  );
}

function safeParseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
