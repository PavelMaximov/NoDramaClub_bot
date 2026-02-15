import type { Telegram } from "telegraf";
import { profilesRepo } from "../db/repositories/profilesRepo";
import { photosRepo } from "../db/repositories/photosRepo";

export const profileDeleteService = {
  async deleteProfileAndPosts(tg: Telegram, userId: number) {
    const profile = profilesRepo.get(userId);
    if (!profile) return;

    const chatId = profile.posted_chat_id;
    const mainMsgId = profile.posted_message_id;

    // 1) Удаляем сообщения в топике (если есть)
    if (chatId) {
    
      const mediaIds = safeParseIds(profile.posted_media_message_ids);
      for (const mid of mediaIds) {
        await safeDeleteMessage(tg, chatId, mid);
      }

    
      if (mainMsgId) {
        await safeDeleteMessage(tg, chatId, mainMsgId);
      }
    }

    // 2) Чистим фото анкеты (в нашей БД)
    photosRepo.clear(userId);

    // 3) Чистим профиль и ставим inactive
    profilesRepo.patch(userId, {
      city_main: null,
      age: null,
      about: null,
      tags: null,
      gender: null,
      relationship_status: null,
      state: "inactive",
      posted_chat_id: null,
      posted_thread_id: null,
      posted_message_id: null,
      posted_media_message_ids: null,
    });
  },

  async deletePublishedPostsOnly(tg: Telegram, userId: number) {
    const profile = profilesRepo.get(userId);
    if (!profile) return;

    const chatId = profile.posted_chat_id;
    const mainMsgId = profile.posted_message_id;

    if (chatId) {
      const mediaIds = safeParseIds((profile as any).posted_media_message_ids);
      for (const mid of mediaIds) {
        await safeDeleteMessage(tg, chatId, mid);
      }
      if (mainMsgId) {
        await safeDeleteMessage(tg, chatId, mainMsgId);
      }
    }

 
    profilesRepo.patch(userId, {
      posted_chat_id: null,
      posted_thread_id: null,
      posted_message_id: null,
      posted_media_message_ids: null as any, 
    });
  },
};

function safeParseIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

async function safeDeleteMessage(tg: Telegram, chatId: number, messageId: number) {
  try {
    await tg.deleteMessage(chatId, messageId);
  } catch {
    // Сообщение могло быть уже удалено/слишком старое/нет прав — игнорируем
  }
}
