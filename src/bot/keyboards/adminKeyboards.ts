import { Markup } from "telegraf";

export type EditField =
  | "name"
  | "status"
  | "city"
  | "location"
  | "age"
  | "about"
  | "tags"
  | "photos";

export const adminEditKeyboard = {
  chooseFields(targetUserId: number) {
    return Markup.inlineKeyboard([
      [{ text: "Ім’я", callback_data: `admin:fix:${targetUserId}:name` }],
      [{ text: "Статус (у відносинах/без)", callback_data: `admin:fix:${targetUserId}:status` }],
      [{ text: "Місто", callback_data: `admin:fix:${targetUserId}:city` }],
      [{ text: "Місце (район/село)", callback_data: `admin:fix:${targetUserId}:location` }],
      [{ text: "Вік", callback_data: `admin:fix:${targetUserId}:age` }],
      [{ text: "Опис", callback_data: `admin:fix:${targetUserId}:about` }],
      [{ text: "Інтереси", callback_data: `admin:fix:${targetUserId}:tags` }],
      [{ text: "Фото", callback_data: `admin:fix:${targetUserId}:photos` }],
      [{ text: "Скасувати", callback_data: `admin:fix:${targetUserId}:cancel` }],
    ]);
  },
};
