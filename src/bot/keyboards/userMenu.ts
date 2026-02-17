import { Markup } from "telegraf";

export const userMenu = {
  main() {
    return Markup.keyboard([
      ["✅ Заповнити анкету", "🧾 Моя анкета"],
      ["✏️ Змінити анкету", "🗑 Видалити анкету"],
    ]).resize();
  },

  remove() {
    return Markup.removeKeyboard();
  },
};
