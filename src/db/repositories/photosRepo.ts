import { db } from "../db";

export const photosRepo = {
  list(userId: number): { id: number; file_id: string; order_index: number }[] {
    return db.prepare(`
      SELECT id, file_id, order_index
      FROM profile_photos
      WHERE user_id = ?
      ORDER BY order_index ASC
    `).all(userId) as any;
  },

  add(userId: number, fileId: string) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM profile_photos WHERE user_id = ?`).get(userId) as any;
    const orderIndex = Number(count.c);

    if (orderIndex >= 3) throw new Error("MAX_PHOTOS_REACHED");

    db.prepare(`
      INSERT INTO profile_photos (user_id, file_id, order_index)
      VALUES (?, ?, ?)
    `).run(userId, fileId, orderIndex);
  },

  clear(userId: number) {
    db.prepare(`DELETE FROM profile_photos WHERE user_id = ?`).run(userId);
  },

  count(userId: number): number {
    const row = db.prepare(`SELECT COUNT(*) as c FROM profile_photos WHERE user_id = ?`).get(userId) as any;
    return Number(row.c);
  },
};
