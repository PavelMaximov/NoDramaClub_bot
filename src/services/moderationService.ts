import type { Telegram } from "telegraf";
import { config } from "../config";
import { profilesRepo } from "../db/repositories/profilesRepo";
import { photosRepo } from "../db/repositories/photosRepo";

export const moderationService = {
  async notifyAdminsNewProfile(tg: Telegram, userId: number) {
    const profile = profilesRepo.get(userId);
    const chat = await tg.getChat(userId); 
    const username = (chat as any).username
      ? `@${(chat as any).username}`
      : null;
    const firstName = (chat as any).first_name ?? "";
    const lastName = (chat as any).last_name ?? "";
    const fullName = `${firstName} ${lastName}`.trim() || "Без имени";
    const who = username ?? fullName;

    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    const photos = photosRepo.list(userId);

    const text = formatProfileForAdmin(profile);

    if (photos.length) {
      await Promise.all(
        config.adminIds.map((adminId) =>
          tg.sendMediaGroup(
            adminId,
            photos.map((p) => ({ type: "photo" as const, media: p.file_id })),
          ),
        ),
      );
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "👤 Открыть профиль", url: `tg://user?id=${userId}` }],
        [
          { text: "✅ Approve", callback_data: `admin:approve:${userId}` },
          { text: "❌ Reject", callback_data: `admin:reject:${userId}` },
        ],
        [{ text: "📝 Request edit", callback_data: `admin:edit:${userId}` }],
      ],
    };

    await Promise.all(
      config.adminIds.map((adminId) =>
        tg.sendMessage(adminId, text, { reply_markup: keyboard }),
      ),
    );
  },
};

function formatProfileForAdmin(profile: any) {
  const genderLabel =
    profile.gender === "male" ? "Парень (Herren)" : "Девушка (Frauen)";
  const relLabel =
    profile.relationship_status === "in_relation"
      ? "В отношениях"
      : "Без отношений";

  return (
    `Новая анкета на модерации\n` +
    `От: ${profile.who}\n` +
    `user_id: ${profile.user_id}\n` +
    `Пол: ${genderLabel}\n` +
    `Статус: ${relLabel}\n` +
    `Город: ${profile.city ?? "-"}\n` +
    `Возраст: ${profile.age ?? "-"}\n` +
    `Интересы: ${profile.tags ?? "-"}\n\n` +
    `О себе:\n${profile.about ?? "-"}`
  );
}
