import "dotenv/config";

function mustGet(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  botToken: mustGet("BOT_TOKEN"),
  adminIds: mustGet("ADMIN_IDS")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter(Boolean),
  groupChatId: Number(mustGet("GROUP_CHAT_ID")),
  inviteExpireSeconds: Number(process.env.INVITE_EXPIRE_SECONDS ?? "1800"),
  botUsername: process.env.BOT_USERNAME!,
};
