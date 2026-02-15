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
      [Markup.button.callback("✅ Заполнить анкету", "profile:start")],
      [Markup.button.callback("🧾 Моя анкета", "profile:me")],
      [Markup.button.callback("🗑 Удалить анкету", "profile:delete")],
    ]);
  },

  gender() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Парень", "profile:gender:male")],
      [Markup.button.callback("Девушка", "profile:gender:female")],
    ]);
  },

  relationship() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("В отношениях", "profile:rel:in_relation")],
      [Markup.button.callback("Без отношений", "profile:rel:single")],
    ]);
  },

  submit() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("✅ Отправить на модерацию", "profile:submit")],
      [Markup.button.callback("✏️ Изменить", "profile:start")],
    ]);
  },

  deleteConfirm() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("🗑 Да, удалить", "profile:delete:yes"),
        Markup.button.callback("Отмена", "profile:delete:no"),
      ],
    ]);
  },

  editOrNew() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "✏️ Редактировать (фото сохранятся)",
          "profile:edit",
        ),
      ],
      [
        Markup.button.callback(
          "🆕 Заполнить заново (фото заново)",
          "profile:new",
        ),
      ],
      [Markup.button.callback("Отмена", "profile:cancel")],
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
    rows.push([Markup.button.callback("Пропустить", "profile:city:skip")]);
    return Markup.inlineKeyboard(rows);
  },

  skipLocationDetail() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("⏭ Пропустить", "profile:locdetail:skip")],
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
      [Markup.button.callback("🗑 Удалить все фото", "profile:photos:clear")],
    ]);
  },

  
};
