import { Markup } from "telegraf";

export const userMenu = {
  main() {
    return Markup.keyboard([
      ["✅ Заповнити анкету", "🧾 Моя анкета"],
      ["✏️ Змінити анкету", "🗑 Видалити анкету"],
      ["🆘 Звʼязатися з адміном"],
      
    ]).resize();
  },

  remove() {
    return Markup.removeKeyboard();
  },
};
