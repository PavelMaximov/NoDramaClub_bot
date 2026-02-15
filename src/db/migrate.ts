import { db } from "./db";

function tryAddColumn(sql: string) {
  try {
    db.exec(sql);
  } catch {
    // ignore
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      city TEXT,
      goal TEXT,
      age INTEGER,
      about TEXT,
      tags TEXT,
      state TEXT NOT NULL DEFAULT 'draft',
      posted_chat_id INTEGER,
      posted_thread_id INTEGER,
      posted_message_id INTEGER,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topics (
      key TEXT PRIMARY KEY,
      thread_id INTEGER NOT NULL,
      title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_user_id INTEGER NOT NULL,
      target_user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  `);

  tryAddColumn(`ALTER TABLE profiles ADD COLUMN gender TEXT;`);
  tryAddColumn(`ALTER TABLE profiles ADD COLUMN relationship_status TEXT;`);
  tryAddColumn(`ALTER TABLE profiles ADD COLUMN posted_media_message_ids TEXT;`);
  tryAddColumn(`ALTER TABLE profiles ADD COLUMN display_name TEXT;`);
  tryAddColumn(`ALTER TABLE profiles ADD COLUMN city_main TEXT;`);
  tryAddColumn(`ALTER TABLE profiles ADD COLUMN location_detail TEXT;`);
}
