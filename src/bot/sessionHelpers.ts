import type { BotContext, BotSession } from "./context";


export function getSession(ctx: BotContext): BotSession {
  return ctx.session as unknown as BotSession;
}
