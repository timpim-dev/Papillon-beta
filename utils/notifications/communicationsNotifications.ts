import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";

import { Chat } from "@/services/shared/chat";
import { News } from "@/services/shared/news";
import { generateId } from "@/utils/generateId";

import {
  COMMUNICATIONS_CHANNEL_ID,
  configureNotificationHandler,
  ensureAndroidNotificationChannels,
  getNotificationPermissionStatus,
  NEWS_SURVEYS_CHANNEL_ID,
} from "./notificationsSetup";

const metaStorage = createMMKV({ id: "papillon_communications_meta" });
const KNOWN_CHAT_ACTIVITY_KEY = "known_chat_activity_signatures";
const KNOWN_NEWS_SIGNATURES_KEY = "known_news_signatures";
const READ_SIGNATURES_KEY = "read_chat_signatures";

function getStableChatKey(
  chat: Pick<Chat, "id" | "subject" | "creator" | "recipient" | "createdByAccount"> & {
    ref?: unknown;
  }
): string {
  const subject = (chat.subject ?? "").trim();
  const creator = (chat.creator ?? "").trim();
  const recipient = (chat.recipient ?? "").trim();
  if (subject || creator || recipient) {
    return `${subject}|${creator}|${recipient}`;
  }
  const refObj = (chat.ref ?? {}) as { participantsMessageID?: string };
  return refObj.participantsMessageID || chat.id;
}

/**
 * Stable per-thread signature used for read state & route navigation.
 * Intentionally excludes `date` because Pronote relative date parsing shifts across launches.
 */
export function buildChatSignature(
  chat: Pick<Chat, "id" | "subject" | "creator" | "recipient" | "createdByAccount"> & {
    date?: Date | string | number;
    ref?: unknown;
  }
): string {
  return `${chat.createdByAccount}:${getStableChatKey(chat)}`;
}

/**
 * Activity-sensitive thread signature: changes whenever a discussion receives
 * a new reply (`numberOfMessages`, or fallback `date` if message count is absent).
 */
export function buildChatActivitySignature(chat: Chat): string {
  const refObj = (chat.ref ?? {}) as {
    numberOfMessages?: number;
    participantsMessageID?: string;
  };
  const threadKey = getStableChatKey(chat);
  if (typeof refObj.numberOfMessages === "number") {
    return `${chat.createdByAccount}:${threadKey}:n${refObj.numberOfMessages}`;
  }
  const dateMs = chat.date instanceof Date ? chat.date.getTime() : new Date(chat.date).getTime();
  return `${chat.createdByAccount}:${threadKey}:${Number.isFinite(dateMs) ? dateMs : 0}`;
}

export function isChatUnread(chat: Chat, readSet: Set<string>): boolean {
  const refObj = (chat.ref ?? {}) as { numberOfMessagesUnread?: number };
  if (typeof refObj.numberOfMessagesUnread === "number" && refObj.numberOfMessagesUnread === 0) {
    return false;
  }
  return !readSet.has(buildChatSignature(chat));
}

export function buildNewsSignature(
  item: Pick<News, "id" | "title" | "author" | "createdByAccount">
): string {
  const stableId =
    item.id || generateId((item.author ?? "") + (item.title ?? "") + (item.createdByAccount ?? ""));
  return `${item.createdByAccount}:${stableId}`;
}

export interface ChatDiffResult {
  newChats: Chat[];
  nextKnownSignatures: string[];
}

/**
 * Returns discussions that are new OR have new reply activity since the previous
 * baseline. On initial sync (`knownSignatures === null`), seeds cleanly without notifying.
 */
export function diffNewChats(
  chats: Chat[],
  knownSignatures: string[] | null
): ChatDiffResult {
  const currentSignatures = chats.map(buildChatActivitySignature);

  if (knownSignatures === null) {
    return {
      newChats: [],
      nextKnownSignatures: currentSignatures,
    };
  }

  const knownSet = new Set(knownSignatures);
  const newChats = chats.filter(chat => {
    const refObj = (chat.ref ?? {}) as { numberOfMessagesUnread?: number };
    if (typeof refObj.numberOfMessagesUnread === "number" && refObj.numberOfMessagesUnread === 0) {
      return false;
    }
    return !knownSet.has(buildChatActivitySignature(chat));
  });
  const merged = Array.from(new Set([...knownSignatures, ...currentSignatures])).slice(-300);

  return {
    newChats,
    nextKnownSignatures: merged,
  };
}

export interface NewsDiffResult {
  newItems: News[];
  nextKnownSignatures: string[];
}

/**
 * Returns newly published unacknowledged Infos & Surveys not seen in the prior baseline.
 */
export function diffNewNews(
  items: News[],
  knownSignatures: string[] | null
): NewsDiffResult {
  const currentSignatures = items.map(buildNewsSignature);

  if (knownSignatures === null) {
    return {
      newItems: [],
      nextKnownSignatures: currentSignatures,
    };
  }

  const knownSet = new Set(knownSignatures);
  const newItems = items.filter(
    item => !item.acknowledged && !knownSet.has(buildNewsSignature(item))
  );
  const merged = Array.from(new Set([...knownSignatures, ...currentSignatures])).slice(-300);

  return {
    newItems,
    nextKnownSignatures: merged,
  };
}

function readStoredList(key: string): string[] | null {
  const raw = metaStorage.getString(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

function writeStoredList(key: string, values: string[]): void {
  metaStorage.set(key, JSON.stringify(values));
}

export function getReadChatSignatures(): Set<string> {
  return new Set(readStoredList(READ_SIGNATURES_KEY) ?? []);
}

export function markChatAsRead(chat: Chat): void {
  const sig = buildChatSignature(chat);
  const existing = readStoredList(READ_SIGNATURES_KEY) ?? [];
  if (!existing.includes(sig)) {
    writeStoredList(READ_SIGNATURES_KEY, [...existing, sig].slice(-250));
  }
  const activitySig = buildChatActivitySignature(chat);
  const knownActivity = readStoredList(KNOWN_CHAT_ACTIVITY_KEY);
  if (knownActivity !== null && !knownActivity.includes(activitySig)) {
    writeStoredList(KNOWN_CHAT_ACTIVITY_KEY, [...knownActivity, activitySig].slice(-300));
  }
  if (chat.ref && typeof chat.ref === "object") {
    (chat.ref as { numberOfMessagesUnread?: number }).numberOfMessagesUnread = 0;
  }
}

function markChatsUnread(chats: Chat[]): void {
  if (chats.length === 0) return;
  const sigs = new Set(chats.map(buildChatSignature));
  const existing = readStoredList(READ_SIGNATURES_KEY) ?? [];
  const filtered = existing.filter(sig => !sigs.has(sig));
  if (filtered.length !== existing.length) {
    writeStoredList(READ_SIGNATURES_KEY, filtered);
  }
}

export function markAllChatsAsRead(chats: Chat[]): void {
  if (chats.length === 0) return;
  const existing = new Set(readStoredList(READ_SIGNATURES_KEY) ?? []);
  for (const chat of chats) {
    existing.add(buildChatSignature(chat));
  }
  writeStoredList(READ_SIGNATURES_KEY, Array.from(existing).slice(-250));
}

export async function detectAndNotifyNewChats(
  chats: Chat[],
  notificationsEnabled: boolean
): Promise<number> {
  const known = readStoredList(KNOWN_CHAT_ACTIVITY_KEY);
  const { newChats, nextKnownSignatures } = diffNewChats(chats, known);
  writeStoredList(KNOWN_CHAT_ACTIVITY_KEY, nextKnownSignatures);

  if (known === null) {
    markAllChatsAsRead(chats);
    return 0;
  }

  const serverReadChats = chats.filter(chat => {
    const refObj = (chat.ref ?? {}) as { numberOfMessagesUnread?: number };
    return typeof refObj.numberOfMessagesUnread === "number" && refObj.numberOfMessagesUnread === 0;
  });
  if (serverReadChats.length > 0) {
    markAllChatsAsRead(serverReadChats);
  }

  if (newChats.length > 0) {
    markChatsUnread(newChats);
  }

  if (!notificationsEnabled || newChats.length === 0) {
    return 0;
  }

  const hasPermission = await getNotificationPermissionStatus();
  if (!hasPermission) {
    return 0;
  }

  configureNotificationHandler();
  await ensureAndroidNotificationChannels();

  const latest = newChats[0];
  const title =
    newChats.length === 1
      ? `💬 ${latest.creator || latest.recipient || "Nouvelle discussion"}`
      : `💬 ${newChats.length} nouveaux messages`;
  const body =
    newChats.length === 1
      ? latest.subject || "Nouveau message reçu"
      : `${latest.subject || "Messages reçus"} (+${newChats.length - 1})`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        kind: "communication",
        route: "/(features)/(communications)/communications",
        params: { tab: "discussions" },
      },
    },
    trigger:
      Platform.OS === "android"
        ? { channelId: COMMUNICATIONS_CHANNEL_ID }
        : null,
  });

  return newChats.length;
}

export async function detectAndNotifyNewNews(
  newsItems: News[],
  notificationsEnabled: boolean
): Promise<number> {
  const known = readStoredList(KNOWN_NEWS_SIGNATURES_KEY);
  const { newItems, nextKnownSignatures } = diffNewNews(newsItems, known);
  writeStoredList(KNOWN_NEWS_SIGNATURES_KEY, nextKnownSignatures);

  if (known === null) {
    return 0;
  }

  if (!notificationsEnabled || newItems.length === 0) {
    return 0;
  }

  const hasPermission = await getNotificationPermissionStatus();
  if (!hasPermission) {
    return 0;
  }

  configureNotificationHandler();
  await ensureAndroidNotificationChannels();

  const latest = newItems[0];
  const isSurvey = Boolean(latest.question);
  const title =
    newItems.length === 1
      ? isSurvey
        ? `📊 Nouveau sondage : ${latest.title || "Sondage"}`
        : `📰 Nouvelle info : ${latest.title || "Information"}`
      : `📰 ${newItems.length} nouvelles infos & sondages`;
  const body =
    newItems.length === 1
      ? latest.author || latest.category || "Appuie pour consulter"
      : `${latest.title || "Publication"} (+${newItems.length - 1})`;

  const singleRouteId = generateId(
    (latest.author ?? "") + (latest.title ?? "") + (latest.createdByAccount ?? "")
  );

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data:
        newItems.length === 1
          ? {
              kind: isSurvey ? "news-survey" : "news-info",
              route: "/(features)/(news)/specific",
              params: { id: singleRouteId },
            }
          : {
              kind: "news-list",
              route: "/(features)/(communications)/communications",
              params: { tab: "infos" },
            },
    },
    trigger:
      Platform.OS === "android"
        ? { channelId: NEWS_SURVEYS_CHANNEL_ID }
        : null,
  });

  return newItems.length;
}
