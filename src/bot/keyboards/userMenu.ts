import { Markup } from "telegraf";

export const userMenu = {
  main() {
    // Reply keyboard: строго массив рядов, в каждом ряду — строки
    return Markup.keyboard([
      ["✅ Заполнить анкету", "🧾 Моя анкета"],
      ["✏️ Изменить анкету", "🗑 Удалить анкету"],
      
    ]).resize();
  },

  remove() {
    return Markup.removeKeyboard();
  },
};
