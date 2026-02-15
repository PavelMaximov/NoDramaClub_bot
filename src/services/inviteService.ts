import type { Telegram } from "telegraf";
import { config } from "../config";


export const inviteService = {
  async createOneTimeInviteLink(tg: Telegram) {
    const expireDate = Math.floor(Date.now() / 1000) + config.inviteExpireSeconds;

    const link = await tg.createChatInviteLink(config.groupChatId, {
      member_limit: 1,
      expire_date: expireDate,
      creates_join_request: false, 
      name: `one_time_${Date.now()}`,
    });

    return link.invite_link;
  },
};
