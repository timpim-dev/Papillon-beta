import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";

import { Chat } from "@/services/shared/chat";

import {
  COMMUNICATIONS_CHANNEL_ID,
  configureNotificationHandler,
  ensureAndroidNotificationChannels,
  getNotificationPermissionStatus,
} from "./notificationsSetup";

const metaStorage = createMMKV({ id: "papillon_communications_meta" });
const KNOWN_SIGNATURES_KEY = "known_chat_signatures";
const READ_SIGNATURES_KEY = "read_chat_signatures";

export function buildChatSignature(chat: Pick<Chat, "id" | "subject" | "date" | "createdByAccount">): string {
  const dateMs = chat.date instanceof Date ? chat.date.getTime() : new Date(chat.date).getTime();
  return `${chat.createdByAccount}:${chat.id || chat.subject}:${Number.isFinite(dateMs) ? dateMs : 0}`;
}

export interface ChatDiffResult {
  newChats: Chat[];
  nextKnownSignatures: string[];
}

/**
 * Returns chats that were not present in the previously seen baseline.
 * On the very first sync (`knownSignatures === null`), seeds the baseline
 * cleanly without emitting notifications for historical threads.
 */
export function diffNewChats(
  chats: Chat[],
  knownSignatures: string[] | null
): ChatDiffResult {
  const currentSignatures = chats.map(buildChatSignature);

  if (knownSignatures === null) {
    return {
      newChats: [],
      nextKnownSignatures: currentSignatures,
    };
  }

  const knownSet = new Set(knownSignatures);
  const newChats = chats.filter(chat => !knownSet.has(buildChatSignature(chat)));
  const merged = Array.from(new Set([...knownSignatures, ...currentSignatures])).slice(-250);

  return {
    newChats,
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
}

export function markAllChatsAsRead(chats: Chat[]): void {
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
  const known = readStoredList(KNOWN_SIGNATURES_KEY);
  const { newChats, nextKnownSignatures } = diffNewChats(chats, known);
  writeStoredList(KNOWN_SIGNATURES_KEY, nextKnownSignatures);

  // On initial seed, also mark pre-existing chats as read so only newly arriving messages show unread indicators.
  if (known === null) {
    markAllChatsAsRead(chats);
    return 0;
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
      ? `💬 ${latest.creator || latest.recipient || "Nouvelle communication"}`
      : `💬 ${newChats.length} nouvelles communications`;
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
      },
    },
    trigger:
      Platform.OS === "android"
        ? { channelId: COMMUNICATIONS_CHANNEL_ID }
        : null,
  });

  return newChats.length;
}
