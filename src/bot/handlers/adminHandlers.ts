import type { Context } from "telegraf";
import { topicsRepo, TopicKey } from "../../db/repositories/topicsRepo";

function normalizeKey(input: string): TopicKey | null {
  const k = input.trim().toLowerCase();
  if (k === "herren") return "herren";
  if (k === "frauen") return "frauen";
  return null;
}

export async function bindTopicHandler(ctx: Context) {
  // Команда должна быть написана внутри топика, иначе message_thread_id будет undefined
  const threadId = (ctx.message as any)?.message_thread_id as number | undefined;

  const text = (ctx.message as any)?.text as string | undefined;
  const parts = (text ?? "").split(" ").filter(Boolean);

  // ожидаем: /bind_topic herren
  const rawKey = parts[1];
  if (!rawKey) {
    await ctx.reply("Использование: /bind_topic herren или /bind_topic frauen");
    return;
  }

  const key = normalizeKey(rawKey);
  if (!key) {
    await ctx.reply("Неизвестный ключ. Допустимо: herren, frauen");
    return;
  }

  if (!threadId) {
    await ctx.reply(
      "Эту команду нужно отправить внутри нужного топика (ветки), а не в общем чате.\n" +
      "Зайди в топик Herren/Frauen и там напиши /bind_topic herren или /bind_topic frauen."
    );
    return;
  }

  const title = key === "herren" ? "Herren" : "Frauen";

  topicsRepo.upsert({
    key,
    thread_id: threadId,
    title,
  });

  await ctx.reply(`Готово. Топик "${title}" привязан.\nthread_id = ${threadId}`);
}

export async function listTopicsHandler(ctx: Context) {
  const rows = topicsRepo.list();
  if (!rows.length) {
    await ctx.reply("Пока нет привязанных топиков. Используй /bind_topic в нужной ветке.");
    return;
  }

  const lines = rows.map((r) => `- ${r.title} (${r.key}): thread_id=${r.thread_id}`);
  await ctx.reply("Привязанные топики:\n" + lines.join("\n"));
}
