import { Chat } from "@/services/shared/chat";
import { buildChatSignature } from "@/utils/notifications/communicationsNotifications";

const liveChatsByKey = new Map<string, Chat>();

export function cacheLiveChats(chats: Chat[]): void {
  for (const chat of chats) {
    liveChatsByKey.set(buildChatSignature(chat), chat);
  }
}

export function getCachedLiveChat(signature: string): Chat | undefined {
  return liveChatsByKey.get(signature);
}
