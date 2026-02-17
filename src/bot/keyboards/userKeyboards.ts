import { Markup } from "telegraf";

const GERMANY_CITIES = [
  "Aachen",
  "Augsburg",
  "Bergisch Gladbach",
  "Berlin",
  "Bielefeld",
  "Bochum",
  "Bonn",
  "Bottrop",
  "Braunschweig",
  "Bremen",
  "Bremerhaven",
  "Chemnitz",
  "Cottbus",
  "Darmstadt",
  "Dortmund",
  "Dresden",
  "Duisburg",
  "Düsseldorf",
  "Erfurt",
  "Erlangen",
  "Essen",
  "Frankfurt am Main",
  "Freiburg im Breisgau",
  "Fürth",
  "Gelsenkirchen",
  "Göttingen",
  "Hagen",
  "Halle (Saale)",
  "Hamburg",
  "Hamm",
  "Hannover",
  "Heidelberg",
  "Heilbronn",
  "Herne",
  "Hildesheim",
  "Ingolstadt",
  "Jena",
  "Karlsruhe",
  "Kassel",
  "Kiel",
  "Koblenz",
  "Köln",
  "Krefeld",
  "Leipzig",
  "Leverkusen",
  "Lübeck",
  "Ludwigshafen am Rhein",
  "Lünen",
  "Magdeburg",
  "Mainz",
  "Mannheim",
  "Mönchengladbach",
  "Mülheim an der Ruhr",
  "München",
  "Münster",
  "Neuss",
  "Nürnberg",
  "Oberhausen",
  "Offenbach am Main",
  "Oldenburg",
  "Osnabrück",
  "Paderborn",
  "Pforzheim",
  "Potsdam",
  "Recklinghausen",
  "Remscheid",
  "Reutlingen",
  "Rostock",
  "Saarbrücken",
  "Salzgitter",
  "Siegen",
  "Solingen",
  "Stuttgart",
  "Trier",
  "Ulm",
  "Wiesbaden",
  "Wolfsburg",
  "Wuppertal",
  "Würzburg",
];

export const userKeyboards = {
  main() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("✅ Заповнити анкету", "profile:start")],
      [Markup.button.callback("🧾 Моя анкета", "profile:me")],
      [Markup.button.callback("🗑 Видалити анкету", "profile:delete")],
    ]);
  },

  editOrDelete() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Заповнити анкету заново", "profile:start")],
      [Markup.button.callback("🗑 Видалити анкету", "profile:delete")],
    ]);
  },

  gender() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Хлопець", "profile:gender:male")],
      [Markup.button.callback("Дівчина", "profile:gender:female")],
    ]);
  },

  relationship() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("У відносинах", "profile:rel:in_relation")],
      [Markup.button.callback("Без стосунків", "profile:rel:single")],
    ]);
  },

  submit() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("✅ Відправити на модерацію", "profile:submit")],
      [Markup.button.callback("✏️ Змінити", "profile:start")],
    ]);
  },

  previewActions() {
    return Markup.inlineKeyboard([
      [{ text: "✅ Відправити на модерацію", callback_data: "profile:submit" }],
      [{ text: "✏️ Змінити анкету", callback_data: "profile:editmenu" }],
    ]);
  },

  deleteConfirm() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("🗑 Так, видалити", "profile:delete:yes"),
        Markup.button.callback("Відмінити", "profile:delete:no"),
      ],
    ]);
  },

  editOrNew() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "✏️ Редагувати (фото збережуться)",
          "profile:edit",
        ),
      ],
      [
        Markup.button.callback(
          "🆕 Заповнити заново (фото заново)",
          "profile:new",
        ),
      ],
      [Markup.button.callback("Відмінити", "profile:cancel")],
    ]);
  },

  cityMain() {
    const rows: any[] = [];
    for (let i = 0; i < GERMANY_CITIES.length; i += 2) {
      rows.push([
        Markup.button.callback(
          GERMANY_CITIES[i],
          `profile:city:${GERMANY_CITIES[i]}`,
        ),
        ...(GERMANY_CITIES[i + 1]
          ? [
              Markup.button.callback(
                GERMANY_CITIES[i + 1],
                `profile:city:${GERMANY_CITIES[i + 1]}`,
              ),
            ]
          : []),
      ]);
    }
    rows.push([Markup.button.callback("Пропустити", "profile:city:skip")]);
    return Markup.inlineKeyboard(rows);
  },

  skipLocationDetail() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("⏭ Пропустити", "profile:locdetail:skip")],
    ]);
  },

   donePhotos() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("✅ Готово", "profile:photos:done")],
    ]);
  },

  photosControls() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("✅ Готово", "profile:photos:done")],
      [Markup.button.callback("🗑 Видалити всі фото", "profile:photos:clear")],
    ]);
  },

   editProfileMenu() {
    return Markup.inlineKeyboard([
      [{ text: "Ім'я", callback_data: "profile:editfield:name" }],
      [{ text: "Статус", callback_data: "profile:editfield:status" }],
      [{ text: "Місто", callback_data: "profile:editfield:city" }],
      [{ text: "Місце (район/селище)", callback_data: "profile:editfield:location" }],
      [{ text: "Вік", callback_data: "profile:editfield:age" }],
      [{ text: "Опис", callback_data: "profile:editfield:about" }],
      [{ text: "Фото (перезагрузити)", callback_data: "profile:editfield:photos" }],
      [{ text: "Відмінити", callback_data: "profile:editfield:cancel" }],
    ]);
  },
};
