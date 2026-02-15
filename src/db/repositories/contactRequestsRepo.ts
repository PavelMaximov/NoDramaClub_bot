import { db } from "../db";

export type ContactRequestStatus = "pending" | "accepted" | "declined";

export type ContactRequestRow = {
  id: number;
  from_user_id: number;
  to_user_id: number;
  message: string;
  status: ContactRequestStatus;
  created_at: string;
};

export const contactRequestsRepo = {
  create(fromUserId: number, toUserId: number, message: string) {
    const stmt = db.prepare(`
      INSERT INTO contact_requests (from_user_id, to_user_id, message, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `);

    const res = stmt.run(fromUserId, toUserId, message, new Date().toISOString());
    return Number(res.lastInsertRowid);
  },

  get(id: number): ContactRequestRow | undefined {
    return db.prepare(`SELECT * FROM contact_requests WHERE id = ?`).get(id) as ContactRequestRow | undefined;
  },

  setStatus(id: number, status: ContactRequestStatus) {
    db.prepare(`UPDATE contact_requests SET status = ? WHERE id = ?`).run(status, id);
  },

  countSentSince(fromUserId: number, sinceIso: string): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c
         FROM contact_requests
         WHERE from_user_id = ?
           AND created_at >= ?`
      )
      .get(fromUserId, sinceIso) as any;

    return Number(row.c);
  },
};
