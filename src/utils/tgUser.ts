import type { User } from "telegraf/types";

export function formatTgUser(u: User) {
  const username = u.username ? `@${u.username}` : null;
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();

  return {
    username,
    fullName: fullName || "Без имени",
    label: username ?? (fullName || `id:${u.id}`),
    id: u.id,
  };
}

export function tgUserLink(userId: number) {
  // часто открывает профиль/чат в Telegram clients
  return `tg://user?id=${userId}`;
}
