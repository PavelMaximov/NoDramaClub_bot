import { db } from "../db";

export const feedbacksRepo = {
  create(userId: number, message: string) {
    const res = db.prepare(`
      INSERT INTO feedbacks (user_id, message, created_at)
      VALUES (?, ?, ?)
    `).run(userId, message, new Date().toISOString());

    return Number(res.lastInsertRowid);
  },

  countSince(userId: number, sinceIso: string): number {
    const row = db.prepare(`
      SELECT COUNT(*) as c
      FROM feedbacks
      WHERE user_id = ?
        AND created_at >= ?
    `).get(userId, sinceIso) as any;

    return Number(row.c);
  },
};
