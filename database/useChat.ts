import { Model, Q } from "@nozbe/watermelondb";

import { Chat as SharedChat, Message as SharedMessage, Recipient as SharedRecipient } from "@/services/shared/chat";
import { generateId } from "@/utils/generateId";
import { error } from "@/utils/logger/logger";

import { getDatabaseInstance } from "./DatabaseProvider";
import { mapChatsToShared, mapMessagesToShared, mapRecipientsToShared } from "./mappers/chats";
import { Chat, Message, Recipient } from "./models/Chat";
import { safeWrite } from "./utils/safeTransaction";

export function getChatDbId(chat: Pick<SharedChat, "id" | "subject" | "creator" | "recipient" | "createdByAccount"> & { ref?: unknown }): string {
  const subject = (chat.subject ?? "").trim();
  const creator = (chat.creator ?? "").trim();
  const recipient = (chat.recipient ?? "").trim();
  // Key on stable thread content rather than ephemeral Pronote session IDs (`participantsMessageID`),
  // matching `useNews.ts` so re-logging in never creates duplicate rows for the same discussion.
  if (subject || creator || recipient) {
    return generateId(`${chat.createdByAccount ?? ""}|${subject}|${creator}|${recipient}`);
  }
  const refObj = (chat.ref ?? {}) as { participantsMessageID?: string };
  return (
    refObj.participantsMessageID ||
    chat.id ||
    generateId(chat.createdByAccount ?? "chat")
  );
}

function getMinuteBucket(dateValue: Date | string | number): number {
  const ms = dateValue instanceof Date ? dateValue.getTime() : new Date(dateValue).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 60_000) : 0;
}

export function getMessageContentKey(
  chatId: string,
  item: Pick<SharedMessage, "author" | "subject" | "content" | "date">
): string {
  return generateId(
    `${chatId}|${item.author ?? ""}|${item.subject ?? ""}|${item.content ?? ""}|${getMinuteBucket(item.date)}`
  );
}

export function getCanonicalMessageId(
  chatId: string,
  item: Pick<SharedMessage, "id" | "author" | "subject" | "content" | "date">
): string {
  return item.id ? generateId(`${chatId}:id:${item.id}`) : getMessageContentKey(chatId, item);
}

export function dedupeChats(chats: SharedChat[]): SharedChat[] {
  const map = new Map<string, SharedChat>();
  for (const chat of chats) {
    const key = getChatDbId(chat);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, chat);
      continue;
    }
    // Prefer live objects with `ref` or newer dates when merging cache + live results
    const existingMs = existing.date instanceof Date ? existing.date.getTime() : new Date(existing.date).getTime();
    const nextMs = chat.date instanceof Date ? chat.date.getTime() : new Date(chat.date).getTime();
    const shouldReplace =
      (!existing.ref && Boolean(chat.ref)) ||
      (Boolean(chat.ref) === Boolean(existing.ref) &&
        Number.isFinite(nextMs) &&
        (!Number.isFinite(existingMs) || nextMs > existingMs));
    if (shouldReplace) {
      map.set(key, chat);
    }
  }
  return Array.from(map.values());
}

export function dedupeMessages(messages: SharedMessage[], chatId = "thread"): SharedMessage[] {
  const byId = new Map<string, SharedMessage>();
  const byContent = new Map<string, SharedMessage>();
  const result: SharedMessage[] = [];

  for (const msg of messages) {
    const idKey = msg.id ? `${chatId}:id:${msg.id}` : "";
    const contentKey = getMessageContentKey(chatId, msg);
    if ((idKey && byId.has(idKey)) || byContent.has(contentKey)) {
      continue;
    }
    if (idKey) {
      byId.set(idKey, msg);
    }
    byContent.set(contentKey, msg);
    result.push(msg);
  }

  return result;
}

export async function addChatsToDatabase(chats: SharedChat[]) {
  if (chats.length === 0) return;
  const db = getDatabaseInstance();
  const incoming = new Map<string, SharedChat>();
  for (const item of dedupeChats(chats)) {
    incoming.set(getChatDbId(item), item);
  }

  // Read and mutate inside one write transaction so concurrent syncs cannot insert duplicates.
  await safeWrite(db, async () => {
    const records = await db.get<Chat>('chats').query().fetch();
    const kept = new Map<string, Chat>();
    const migratedFromIds = new Map<string, string>();
    const operations: Model[] = [];

    for (const record of records) {
      const canonicalId = getChatDbId({
        id: record.chatId,
        subject: record.subject,
        creator: record.creator,
        recipient: record.recipient,
        createdByAccount: record.createdByAccount,
      });
      if (kept.has(canonicalId)) {
        if (record.chatId !== canonicalId) {
          migratedFromIds.set(record.chatId, canonicalId);
        }
        operations.push(record.prepareDestroyPermanently());
      } else {
        if (record.chatId !== canonicalId) {
          migratedFromIds.set(record.chatId, canonicalId);
          operations.push(
            record.prepareUpdate((r: Chat) => {
              r.chatId = canonicalId;
            })
          );
        }
        kept.set(canonicalId, record);
      }
    }

    // Migrate any messages & recipients that were linked to legacy ephemeral chatIds.
    if (migratedFromIds.size > 0) {
      const allMessages = await db.get<Message>('messages').query().fetch();
      for (const msg of allMessages) {
        const nextChatId = migratedFromIds.get(msg.chatId);
        if (nextChatId) {
          operations.push(
            msg.prepareUpdate((m: Message) => {
              m.chatId = nextChatId;
            })
          );
        }
      }
      const allRecipients = await db.get<Recipient>('recipients').query().fetch();
      for (const rec of allRecipients) {
        const nextChatId = migratedFromIds.get(rec.chatId);
        if (nextChatId) {
          operations.push(
            rec.prepareUpdate((r: Recipient) => {
              r.chatId = nextChatId;
            })
          );
        }
      }
    }

    for (const [id, item] of incoming) {
      const nextDateMs = item.date instanceof Date ? item.date.getTime() : new Date(item.date).getTime();
      const safeDateMs = Number.isFinite(nextDateMs) ? nextDateMs : Date.now();
      const existing = kept.get(id);

      if (existing) {
        const needsUpdate =
          existing.date !== safeDateMs ||
          existing.subject !== item.subject ||
          existing.recipient !== item.recipient ||
          existing.creator !== item.creator ||
          existing.createdByAccount !== item.createdByAccount;
        if (needsUpdate) {
          operations.push(
            existing.prepareUpdate((r: Chat) => {
              r.date = safeDateMs;
              r.subject = item.subject;
              r.recipient = item.recipient;
              r.creator = item.creator;
              r.createdByAccount = item.createdByAccount;
            })
          );
        }
      } else {
        operations.push(
          db.get<Chat>('chats').prepareCreate((chat: Chat) => {
            Object.assign(chat, {
              chatId: id,
              subject: item.subject,
              recipient: item.recipient,
              creator: item.creator,
              date: safeDateMs,
              createdByAccount: item.createdByAccount,
            });
          })
        );
      }
    }

    if (operations.length > 0) {
      await db.batch(operations);
    }
  }, 10000, 'addChatsToDatabase');
}

export async function addRecipientsToDatabase(chat: SharedChat, recipients: SharedRecipient[]) {
  if (recipients.length === 0) return;
  const db = getDatabaseInstance();
  const chatId = getChatDbId(chat);
  await addChatsToDatabase([chat]);

  const incoming = new Map<string, SharedRecipient>();
  for (const item of recipients) {
    const id = generateId(chatId + item.name + (item.class ?? ""));
    if (!incoming.has(id)) {
      incoming.set(id, item);
    }
  }

  await safeWrite(db, async () => {
    const records = await db.get<Recipient>('recipients').query(Q.where('chatId', chatId)).fetch();
    const kept = new Map<string, Recipient>();
    const operations: Model[] = [];

    for (const record of records) {
      if (kept.has(record.recipientId)) {
        operations.push(record.prepareDestroyPermanently());
      } else {
        kept.set(record.recipientId, record);
      }
    }

    for (const [id, item] of incoming) {
      if (!kept.has(id)) {
        operations.push(
          db.get<Recipient>('recipients').prepareCreate((recipient: Recipient) => {
            Object.assign(recipient, {
              recipientId: id,
              name: item.name,
              class: item.class,
              chatId,
            });
          })
        );
      }
    }

    if (operations.length > 0) {
      await db.batch(operations);
    }
  }, 10000, 'addRecipientsToDatabase');
}

export async function addMessagesToDatabase(chat: SharedChat, messages: SharedMessage[]) {
  if (messages.length === 0) return;
  const db = getDatabaseInstance();
  const chatId = getChatDbId(chat);
  await addChatsToDatabase([chat]);

  const incomingList = dedupeMessages(messages, chatId);

  // Serialize message writes inside safeWrite and sweep any pre-existing duplicate rows in SQLite.
  await safeWrite(db, async () => {
    const records = await db.get<Message>('messages').query(Q.where('chatId', chatId)).fetch();
    const byMessageId = new Map<string, Message>();
    const byContentKey = new Map<string, Message>();
    const operations: Model[] = [];

    for (const record of records) {
      const contentKey = getMessageContentKey(chatId, {
        author: record.author,
        subject: record.subject,
        content: record.content,
        date: new Date(record.date),
      });
      if (byMessageId.has(record.messageId) || byContentKey.has(contentKey)) {
        operations.push(record.prepareDestroyPermanently());
      } else {
        byMessageId.set(record.messageId, record);
        byContentKey.set(contentKey, record);
      }
    }

    for (const item of incomingList) {
      const id = getCanonicalMessageId(chatId, item);
      const contentKey = getMessageContentKey(chatId, item);
      const existing = byMessageId.get(id) ?? byContentKey.get(contentKey);
      const nextDateMs = new Date(item.date).getTime();
      const safeDateMs = Number.isFinite(nextDateMs) ? nextDateMs : Date.now();
      const serializedAttachments = JSON.stringify(item.attachments ?? []);

      if (existing) {
        const needsUpdate =
          existing.messageId !== id ||
          existing.attachments !== serializedAttachments ||
          existing.content !== item.content;
        if (needsUpdate) {
          operations.push(
            existing.prepareUpdate((r: Message) => {
              r.messageId = id;
              r.content = item.content;
              r.attachments = serializedAttachments;
            })
          );
        }
        byMessageId.set(id, existing);
        byContentKey.set(contentKey, existing);
      } else {
        const created = db.get<Message>('messages').prepareCreate((message: Message) => {
          Object.assign(message, {
            messageId: id,
            subject: item.subject,
            content: item.content,
            author: item.author,
            date: safeDateMs,
            attachments: serializedAttachments,
            chatId,
          });
        });
        operations.push(created);
        byMessageId.set(id, created);
        byContentKey.set(contentKey, created);
      }
    }

    if (operations.length > 0) {
      await db.batch(operations);
    }
  }, 10000, 'addMessagesToDatabase');
}

export async function getChatsFromCache(): Promise<SharedChat[]> {
  try {
    const database = getDatabaseInstance();
    const chats = await database.get<Chat>('chats').query().fetch();
    return dedupeChats(mapChatsToShared(chats));
  } catch (e) {
    error(String(e));
    return [];
  }
}

async function getMatchingChatIds(chat: SharedChat): Promise<string[]> {
  const canonicalId = getChatDbId(chat);
  const ids = new Set<string>([canonicalId]);
  if (chat.id) {
    ids.add(chat.id);
  }
  try {
    const db = getDatabaseInstance();
    const allChats = await db.get<Chat>('chats').query().fetch();
    for (const record of allChats) {
      const recordCanonical = getChatDbId({
        id: record.chatId,
        subject: record.subject,
        creator: record.creator,
        recipient: record.recipient,
        createdByAccount: record.createdByAccount,
      });
      if (recordCanonical === canonicalId || record.chatId === canonicalId || (chat.id && record.chatId === chat.id)) {
        ids.add(record.chatId);
      }
    }
  } catch {
    // Best-effort lookup
  }
  return Array.from(ids);
}

export async function getRecipientsFromCache(chat: SharedChat): Promise<SharedRecipient[]> {
  try {
    const database = getDatabaseInstance();
    const matchingIds = await getMatchingChatIds(chat);
    if (matchingIds.length === 0) return [];
    const recipients = await database.get<Recipient>('recipients').query(
      Q.where('chatId', matchingIds.length === 1 ? matchingIds[0] : Q.oneOf(matchingIds))
    ).fetch();

    return mapRecipientsToShared(recipients);
  } catch (e) {
    error(String(e));
    return [];
  }
}

export async function getMessagesFromCache(chat: SharedChat): Promise<SharedMessage[]> {
  try {
    const database = getDatabaseInstance();
    const chatId = getChatDbId(chat);
    const matchingIds = await getMatchingChatIds(chat);
    if (matchingIds.length === 0) return [];
    const messages = await database.get<Message>('messages').query(
      Q.where('chatId', matchingIds.length === 1 ? matchingIds[0] : Q.oneOf(matchingIds))
    ).fetch();

    return dedupeMessages(mapMessagesToShared(messages), chatId);
  } catch (e) {
    error(String(e));
    return [];
  }
}
