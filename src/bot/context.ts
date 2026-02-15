import type { Scenes } from "telegraf";

export interface BotSession extends Scenes.WizardSessionData {
  contactDraft?: { toUserId: number };
  reportDraft?: { targetUserId: number };
  adminEditDraft?: { targetUserId: number };
  feedbackDraft?: {
  type: "feedback";
};
}

export type BotContext = Scenes.WizardContext<BotSession>;
