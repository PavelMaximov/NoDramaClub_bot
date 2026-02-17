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
          [{ text: "💌 Запитати контакт", callback_data: `contact:request:${userId}` }],
          [{ text: "🚩 Поскаржитися", callback_data: `report:${userId}` }],
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
  const genderLabel = profile.gender === "male" ? "Хлопець" : "Дівчина";
  const relLabel = profile.relationship_status === "in_relation" ? "У відносинах" : "Без стосунків";

  const tags = safeParseTags(profile.tags);
  const tagsLine = tags.length ? tags.join(", ") : "-";
  const cityTag = profile.city_main ? cityToHashtag(profile.city_main) : "";

  return (
    `Анкета\n` +
  `Ім'я: ${profile.display_name ?? "-"}\n` +
  `Вік: ${profile.age ?? "-"}\n` +
  `Статус: ${relLabel}\n` +
  (profile.city_main ? `Місто: ${cityTag}\n` : "") +
  `Місце: ${profile.location_detail ?? profile.city_main }\n` +
  `Інтереси: ${tagsLine}\n\n` +
  `Про себе:\n${profile.about ?? "-"}`
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

function cityToHashtag(cityRaw: string) {
  const map: Record<string, string> = {
    ä: "ae", ö: "oe", ü: "ue", ß: "ss",
    Ä: "Ae", Ö: "Oe", Ü: "Ue",
  };

  const replaced = cityRaw.replace(/[äöüßÄÖÜ]/g, (ch) => map[ch] ?? ch);

  const cleaned = replaced
    .replace(/[^a-zA-Z0-9 ]/g, " ")   // убираем спецсимволы
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

  return cleaned ? `#${cleaned}` : "";
}


