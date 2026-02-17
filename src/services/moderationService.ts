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
    const fullName = `${firstName} ${lastName}`.trim() || "Без імені";
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
        [{ text: "👤 Відкрити профіль", url: `tg://user?id=${userId}` }],
        [
          { text: "✅ Прийняти", callback_data: `admin:approve:${userId}` },
          { text: "❌ Відхилити", callback_data: `admin:reject:${userId}` },
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
    profile.gender === "male" ? "Хлопець (Herren)" : "Дівчина (Frauen)";
  const relLabel =
    profile.relationship_status === "in_relation"
      ? "У відносинах"
      : "Без стосунків";

  return (
    `Нова анкета на модерації\n` +
    `Від: ${profile.who}\n` +
    `user_id: ${profile.user_id}\n` +
    `Пол: ${genderLabel}\n` +
    `Статус: ${relLabel}\n` +
    `Місто: ${profile.city ?? "-"}\n` +
    `Вік: ${profile.age ?? "-"}\n` +
    `Інтереси: ${profile.tags ?? "-"}\n\n` +
    `Про себе:\n${profile.about ?? "-"}`
  );
}
