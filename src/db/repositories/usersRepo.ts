import { db } from "../db";

export const usersRepo = {
  ensure(userId: number) {
    const exists = db.prepare(`SELECT user_id FROM users WHERE user_id = ?`).get(userId);
    if (exists) return;

    db.prepare(`INSERT INTO users (user_id, created_at, status) VALUES (?, ?, 'active')`)
      .run(userId, new Date().toISOString());
  },
};
