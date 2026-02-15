import type { Scenes } from "telegraf";

export interface BotSession extends Scenes.WizardSessionData {
  contactDraft?: { toUserId: number };
  reportDraft?: { targetUserId: number };
  feedbackDraft?: { type: "feedback" };
  adminEditDraft?: { targetUserId: number };
}

export type BotContext = Scenes.WizardContext<BotSession>;
