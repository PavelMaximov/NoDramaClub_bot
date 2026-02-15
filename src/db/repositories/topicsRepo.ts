import { db } from "../db";

export type TopicKey = "herren" | "frauen";

export type TopicRow = {
  key: TopicKey;
  thread_id: number;
  title: string;
};

export const topicsRepo = {
  upsert(topic: TopicRow) {
    const stmt = db.prepare(`
      INSERT INTO topics (key, thread_id, title)
      VALUES (@key, @thread_id, @title)
      ON CONFLICT(key) DO UPDATE SET
        thread_id = excluded.thread_id,
        title = excluded.title
    `);
    stmt.run(topic);
  },

  get(key: TopicKey): TopicRow | undefined {
    const stmt = db.prepare(`SELECT key, thread_id, title FROM topics WHERE key = ?`);
    return stmt.get(key) as TopicRow | undefined;
  },

  list(): TopicRow[] {
    const stmt = db.prepare(`SELECT key, thread_id, title FROM topics ORDER BY key`);
    return stmt.all() as TopicRow[];
  },
};
