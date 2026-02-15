import { db } from "../db";
import type { Gender, RelationshipStatus, ProfileState } from "../../types";

export type ProfileRow = {
  user_id: number;
  display_name: string | null;
  city_main: string | null;
  location_detail: string | null;
  age: number | null;
  about: string | null;
  tags: string | null;
  gender: Gender | null;
  relationship_status: RelationshipStatus | null;
  state: ProfileState;
  posted_media_message_ids: string | null;
  posted_chat_id: number | null;
  posted_thread_id: number | null;
  posted_message_id: number | null;
  updated_at: string;
};

export const profilesRepo = {
  get(userId: number): ProfileRow | undefined {
    return db.prepare(`SELECT * FROM profiles WHERE user_id = ?`).get(userId) as ProfileRow | undefined;
  },

  ensure(userId: number) {
    const row = this.get(userId);
    if (row) return;

    db.prepare(`
      INSERT INTO profiles (user_id, state, updated_at)
      VALUES (?, 'draft', ?)
    `).run(userId, new Date().toISOString());
  },

  patch(userId: number, data: Partial<ProfileRow>) {
    const keys = Object.keys(data);
    if (keys.length === 0) return;

    const setSql = keys.map((k) => `${k} = @${k}`).join(", ");
    const stmt = db.prepare(`
      UPDATE profiles
      SET ${setSql}, updated_at = @updated_at
      WHERE user_id = @user_id
    `);

    stmt.run({
      ...data,
      user_id: userId,
      updated_at: new Date().toISOString(),
    });
  },
};
