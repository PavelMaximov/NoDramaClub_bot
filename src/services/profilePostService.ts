import type { Telegram } from "telegraf";
import type { Gender } from "../types";
import { config } from "../config";
import { topicsRepo } from "../db/repositories/topicsRepo";
import { profilesRepo } from "../db/repositories/profilesRepo";
import { photosRepo } from "../db/repositories/photosRepo";

export const profilePostService = {

  async postApprovedProfile(tg: Telegram, userId: number) {
    const profile = profilesRepo.get(userId);
    if (!profile || !profile.gender) throw new Error("PROFILE_NOT_READY");

    const topicKey = mapGenderToTopicKey(profile.gender);
    const topic = topicsRepo.get(topicKey);
    if (!topic) throw new Error(`TOPIC_NOT_BOUND:${topicKey}`);

    const threadId = topic.thread_id;
    const photos = photosRepo.list(userId);

     let mediaIds: number[] = [];

    if (photos.length) {
      const sentMedia = await tg.sendMediaGroup(
        config.groupChatId,
        photos.map((p) => ({ type: "photo" as const, media: p.file_id })),
        { message_thread_id: threadId }
      );

      mediaIds = sentMedia.map((m) => m.message_id);
    }

    // 2) Текстовая карточка (и именно её message_id мы сохраняем для удаления)
    const text = formatProfileForGroup(profile);
    const city = profile.city_main ?? "Other";

    const sent = await tg.sendMessage(config.groupChatId, text, {
      message_thread_id: threadId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "💌 Запросить контакт", callback_data: `contact:request:${userId}` }],
          [{ text: "🚩 Пожаловаться", callback_data: `report:${userId}` }],
          [{ text: `🔎 ${city}`, callback_data: `search:city:${encodeCity(city)}` }],
        ],
      },
    });

    // сохраняем, чтобы потом удалить при удалении анкеты
      profilesRepo.patch(userId, {
      posted_chat_id: config.groupChatId,
      posted_thread_id: threadId,
      posted_message_id: sent.message_id,
      posted_media_message_ids: mediaIds.length ? JSON.stringify(mediaIds) : null,
    });


    return sent.message_id;
  },
  
};

function encodeCity(city: string) {
  // callback_data максимум 64 байта, лучше кодировать коротко
  return encodeURIComponent(city).slice(0, 50);
}

function mapGenderToTopicKey(gender: Gender) {
  return gender === "male" ? "herren" : "frauen";
}

function formatProfileForGroup(profile: any) {
  const genderLabel = profile.gender === "male" ? "Парень" : "Девушка";
  const relLabel = profile.relationship_status === "in_relation" ? "В отношениях" : "Без отношений";

  const tags = safeParseTags(profile.tags);
  const tagsLine = tags.length ? tags.join(", ") : "-";

  return (
    `Анкета\n` +
  `Имя: ${profile.display_name ?? "-"}\n` +
  `Статус: ${relLabel}\n` +
  `Город: ${profile.city_main ?? "-"}\n` +
  `Место: ${profile.location_detail ?? profile.city_main }\n` +
  `Возраст: ${profile.age ?? "-"}\n` +
  `Интересы: ${tagsLine}\n\n` +
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


