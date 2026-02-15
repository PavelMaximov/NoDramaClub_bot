import { db } from "../db";

export const reportsRepo = {
  create(reporterUserId: number, targetUserId: number, reason: string) {
    const res = db.prepare(`
      INSERT INTO reports (reporter_user_id, target_user_id, reason, created_at)
      VALUES (?, ?, ?, ?)
    `).run(reporterUserId, targetUserId, reason, new Date().toISOString());

    return Number(res.lastInsertRowid);
  },

  countForTargetSince(targetUserId: number, sinceIso: string): number {
    const row = db.prepare(`
      SELECT COUNT(*) as c
      FROM reports
      WHERE target_user_id = ?
        AND created_at >= ?
    `).get(targetUserId, sinceIso) as any;

    return Number(row.c);
  },
};
