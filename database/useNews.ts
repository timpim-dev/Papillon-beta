import { Model, Q } from "@nozbe/watermelondb";
import { createMMKV, type MMKV } from "react-native-mmkv";
import { useEffect, useState } from "react";

import {
  cacheLiveNews,
  getCachedLiveNews,
  getCachedLiveNewsByMeta,
  markCachedLiveNewsRead,
} from "@/components/communications/liveNewsCache";
import { Attachment } from "@/services/shared/attachment";
import { News as SharedNews } from "@/services/shared/news";
import { useAccountStore } from "@/stores/account";
import { generateId } from "@/utils/generateId";
import { info, warn } from "@/utils/logger/logger";

import { getDatabaseInstance, useDatabase } from "./DatabaseProvider";
import News from "./models/News";
import { parseJsonArray } from "./useHomework";
import { safeWrite } from "./utils/safeTransaction";

type NewsExtraMeta = {
  serviceNewsId?: string;
  content?: string;
  createdByAccount?: string;
  acknowledged?: boolean;
  refSnapshot?: Record<string, unknown>;
};

type NewsMetaState = {
  readIds: string[];
  extraByKey: Record<string, NewsExtraMeta>;
};

let newsMetaStorage: MMKV | null | undefined;

function getNewsMetaStorage(): MMKV | null {
  if (newsMetaStorage !== undefined) return newsMetaStorage;
  try {
    newsMetaStorage = createMMKV({ id: "papillon-news-meta" });
  } catch {
    newsMetaStorage = null;
  }
  return newsMetaStorage;
}

function readNewsMetaState(): NewsMetaState {
  const storage = getNewsMetaStorage();
  if (!storage) return { readIds: [], extraByKey: {} };
  let readIds: string[] = [];
  let extraByKey: Record<string, NewsExtraMeta> = {};
  try {
    const rawRead = storage.getString("readIds");
    if (rawRead) {
      const parsed = JSON.parse(rawRead);
      if (Array.isArray(parsed)) {
        readIds = parsed.filter((v): v is string => typeof v === "string");
      }
    }
  } catch {
    // ignore malformed MMKV data
  }
  try {
    const rawExtra = storage.getString("extraByKey");
    if (rawExtra) {
      const parsed = JSON.parse(rawExtra);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extraByKey = parsed as Record<string, NewsExtraMeta>;
      }
    }
  } catch {
    // ignore malformed MMKV data
  }
  return { readIds, extraByKey };
}

function writeNewsMetaState(state: NewsMetaState): void {
  const storage = getNewsMetaStorage();
  if (!storage) return;
  try {
    storage.set("readIds", JSON.stringify(state.readIds.slice(-1000)));
    storage.set("extraByKey", JSON.stringify(state.extraByKey));
  } catch {
    // ignore write failures
  }
}

function serializeNewsRef(ref: SharedNews["ref"]): Record<string, unknown> | undefined {
  if (!ref || typeof ref !== "object") return undefined;
  const anyRef = ref as Record<string, unknown>;
  try {
    const plain = JSON.parse(JSON.stringify(ref)) as Record<string, unknown>;
    if (anyRef.is === "information") {
      plain.content = typeof anyRef.content === "string" ? anyRef.content : (plain.question as { content?: string } | undefined)?.content ?? "";
      plain.acknowledged = Boolean(anyRef.acknowledged);
      plain.needToAcknowledge = Boolean(anyRef.needToAcknowledge);
      if (anyRef.attachments) {
        plain.attachments = JSON.parse(JSON.stringify(anyRef.attachments));
      }
      if (anyRef.acknowledgedDate) {
        plain.acknowledgedDate = anyRef.acknowledgedDate;
      }
    }
    return plain;
  } catch {
    return undefined;
  }
}

function hydrateNewsRef(snapshot?: Record<string, unknown>, forceAcknowledged?: boolean): SharedNews["ref"] {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const clone = { ...snapshot } as Record<string, unknown>;
  if (forceAcknowledged) {
    clone.read = true;
    if (clone.question && typeof clone.question === "object") {
      (clone.question as Record<string, unknown>).answered = true;
    }
  }
  if (clone.is === "information") {
    const q = (clone.question ?? {}) as Record<string, unknown>;
    const savedContent = typeof clone.content === "string" ? clone.content : "";
    const savedAttachments = Array.isArray(clone.attachments) ? clone.attachments : undefined;
    const savedAck = Boolean(forceAcknowledged || clone.acknowledged || q.answered);
    const savedNeedAck = Boolean(clone.needToAcknowledge ?? q.shouldAnswer);
    const savedAckDate = clone.acknowledgedDate ?? q.answerDate;
    delete clone.content;
    delete clone.attachments;
    delete clone.acknowledged;
    delete clone.needToAcknowledge;
    delete clone.acknowledgedDate;
    Object.defineProperties(clone, {
      attachments: {
        enumerable: true,
        get() {
          return savedAttachments ?? (q.attachments as unknown[]) ?? [];
        },
      },
      acknowledged: {
        enumerable: true,
        get() {
          return Boolean(q.answered ?? savedAck);
        },
      },
      acknowledgedDate: {
        enumerable: true,
        get() {
          return q.answerDate ?? savedAckDate;
        },
      },
      needToAcknowledge: {
        enumerable: true,
        get() {
          return Boolean(q.shouldAnswer ?? savedNeedAck);
        },
      },
      content: {
        enumerable: true,
        get() {
          return (typeof q.content === "string" && q.content) ? q.content : savedContent;
        },
      },
    });
  }
  return clone as unknown as SharedNews["ref"];
}

function getActiveAccountServiceIds(): Set<string> {
  const state = useAccountStore.getState();
  const active =
    state.accounts.find(acc => acc.id === state.lastUsedAccount) ??
    state.accounts[0];
  return new Set((active?.services ?? []).map(service => service.id));
}

function getAllStoredServiceIds(): Set<string> {
  const state = useAccountStore.getState();
  const ids = new Set<string>();
  for (const account of state.accounts) {
    for (const service of account.services ?? []) {
      ids.add(service.id);
    }
  }
  return ids;
}

function isLocallyRead(
  item: { id?: string; createdByAccount?: string; author?: string; title?: string; acknowledged?: boolean },
  meta: NewsMetaState,
  routeId?: string
): boolean {
  if (item.acknowledged) return true;
  const readSet = new Set(meta.readIds);
  if (routeId && readSet.has(routeId)) return true;
  if (item.id && readSet.has(item.id)) return true;
  const extra: NewsExtraMeta | undefined =
    (routeId ? meta.extraByKey[routeId] : undefined) ??
    (item.id ? meta.extraByKey[item.id] : undefined);
  if (extra?.acknowledged) return true;
  if (extra?.serviceNewsId && readSet.has(extra.serviceNewsId)) return true;
  return false;
}

export function clearNewsMetaForAccount(accountId: string): void {
  const meta = readNewsMetaState();
  const removedKeys = new Set<string>();
  const nextExtra: Record<string, NewsExtraMeta> = {};
  for (const [key, value] of Object.entries(meta.extraByKey)) {
    if (value?.createdByAccount === accountId) {
      removedKeys.add(key);
      if (value.serviceNewsId) removedKeys.add(value.serviceNewsId);
    } else {
      nextExtra[key] = value;
    }
  }
  const nextReadIds = meta.readIds.filter(id => !removedKeys.has(id));
  writeNewsMetaState({ readIds: nextReadIds, extraByKey: nextExtra });
}

export function useNews(refresh = 0) {
  const database = useDatabase();
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);
  const accounts = useAccountStore(state => state.accounts);
  const [news, setNews] = useState<SharedNews[]>([]);

  useEffect(() => {
    const activeServiceIds = getActiveAccountServiceIds();
    const query = database.get<News>('news').query();

    const sub = query.observe().subscribe(rows => {
      const meta = readNewsMetaState();
      const filtered = activeServiceIds.size > 0
        ? rows.filter(row => activeServiceIds.has(row.createdByAccount))
        : (accounts.length === 0 ? [] : rows);
      setNews(
        filtered
          .map(row => mapNewsToShared(row, meta))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      );
    });

    return () => sub.unsubscribe();
  }, [refresh, database, lastUsedAccount, accounts]);

  return news;
}

export function getNewsRouteId(item: SharedNews): string {
  return generateId((item.author ?? "") + (item.title ?? "") + (item.createdByAccount ?? ""));
}

export async function markNewsAsRead(item: SharedNews | string, serviceNewsId?: string): Promise<void> {
  if (typeof item === "string") {
    const keys = [item, serviceNewsId].filter((v): v is string => Boolean(v));
    if (keys.length === 0) return;
    const meta = readNewsMetaState();
    const readSet = new Set(meta.readIds);
    for (const key of keys) {
      readSet.add(key);
      if (meta.extraByKey[key]) {
        meta.extraByKey[key] = { ...meta.extraByKey[key], acknowledged: true };
      }
    }
    writeNewsMetaState({ readIds: Array.from(readSet), extraByKey: meta.extraByKey });
    markCachedLiveNewsRead(keys);

    const db = getDatabaseInstance();
    await safeWrite(db, async () => {
      const records = await db.get<News>('news').query(Q.where("newsId", Q.oneOf(keys))).fetch();
      const ops = records
        .filter(rec => !rec.acknowledged)
        .map(rec => rec.prepareUpdate(model => {
          (model as News).acknowledged = true;
        }));
      if (ops.length > 0) {
        await db.batch(ops);
      }
    }, 10000, `mark_news_read_${item}`);
    return;
  }

  await markAllNewsAsRead([item]);
}

export async function markAllNewsAsRead(items: SharedNews[]): Promise<void> {
  if (!items || items.length === 0) return;

  const meta = readNewsMetaState();
  const readSet = new Set(meta.readIds);
  const allKeys = new Set<string>();

  for (const item of items) {
    const routeId = getNewsRouteId(item);
    for (const key of [routeId, item.id]) {
      if (!key) continue;
      readSet.add(key);
      allKeys.add(key);
    }
    const existingExtra = meta.extraByKey[routeId] ?? {};
    meta.extraByKey[routeId] = {
      ...existingExtra,
      serviceNewsId: item.id || existingExtra.serviceNewsId,
      createdByAccount: item.createdByAccount || existingExtra.createdByAccount,
      acknowledged: true,
    };
  }

  writeNewsMetaState({ readIds: Array.from(readSet), extraByKey: meta.extraByKey });
  markCachedLiveNewsRead(Array.from(allKeys));

  const keyList = Array.from(allKeys);
  if (keyList.length === 0) return;

  const db = getDatabaseInstance();
  await safeWrite(db, async () => {
    const records = await db.get<News>('news').query(Q.where("newsId", Q.oneOf(keyList))).fetch();
    const ops = records
      .filter(rec => !rec.acknowledged)
      .map(rec => rec.prepareUpdate(model => {
        (model as News).acknowledged = true;
      }));
    if (ops.length > 0) {
      await db.batch(ops);
    }
  }, 10000, `mark_all_news_read_${items.length}`);
}

export async function getNewsById(id: string): Promise<SharedNews | undefined> {
  const database = getDatabaseInstance();
  const meta = readNewsMetaState();
  const activeServiceIds = getActiveAccountServiceIds();

  let records = await database
    .get<News>('news')
    .query(Q.where("newsId", id))
    .fetch();

  if (records.length === 0) {
    const allRecords = await database.get<News>('news').query().fetch();
    const serviceNewsMatch = Object.entries(meta.extraByKey).find(([, extra]) => extra.serviceNewsId === id)?.[0];
    if (serviceNewsMatch) {
      records = allRecords.filter(r => r.newsId === serviceNewsMatch);
    }
    if (records.length === 0 && activeServiceIds.size > 0) {
      records = allRecords.filter(
        r => activeServiceIds.has(r.createdByAccount) && (r.newsId === id)
      );
    }
  }

  const cachedNews = records[0] ? mapNewsToShared(records[0], meta) : undefined;
  const cachedLive =
    getCachedLiveNews(id) ??
    (cachedNews ? getCachedLiveNewsByMeta(cachedNews.title, cachedNews.author, cachedNews.createdByAccount) : undefined);

  const applyReadAndMeta = (candidate: SharedNews): SharedNews => {
    const routeId = getNewsRouteId(candidate);
    const acknowledged = isLocallyRead(candidate, meta, routeId) || Boolean(cachedNews?.acknowledged);
    const extra = meta.extraByKey[routeId];
    return {
      ...candidate,
      acknowledged,
      content: candidate.content?.trim() ? candidate.content : (extra?.content || cachedNews?.content || ""),
      ref: candidate.ref ?? cachedLive?.ref ?? hydrateNewsRef(extra?.refSnapshot, acknowledged),
    };
  };

  try {
    const { getManager } = await import("@/services/shared");
    const freshNews = await getManager(true)?.getNews();
    if (freshNews && freshNews.length > 0) {
      cacheLiveNews(freshNews);
    }
    const matched = freshNews?.find(item => {
      if (getNewsRouteId(item) === id || item.id === id) return true;
      if (cachedNews) {
        return (
          (item.title ?? "").trim() === (cachedNews.title ?? "").trim() &&
          (item.author ?? "").trim() === (cachedNews.author ?? "").trim() &&
          item.createdByAccount === cachedNews.createdByAccount
        );
      }
      return false;
    });
    if (matched) return applyReadAndMeta(matched);
    if (cachedLive) return applyReadAndMeta(cachedLive);
    return cachedNews ? applyReadAndMeta(cachedNews) : undefined;
  } catch (error) {
    warn(`Unable to refresh news ${id}: ${String(error)}`);
    if (cachedLive) return applyReadAndMeta(cachedLive);
    return cachedNews ? applyReadAndMeta(cachedNews) : undefined;
  }
}

export async function addNewsToDatabase(news: SharedNews[]) {
  cacheLiveNews(news);
  const db = getDatabaseInstance();
  const meta = readNewsMetaState();
  const readSet = new Set(meta.readIds);
  const allStoredServiceIds = getAllStoredServiceIds();

  // Keyed on content, not on the service id (it changes between logins); the
  // Map also drops items the service returns twice.
  const incoming = new Map<string, SharedNews>();
  for (const item of news) {
    const routeId = getNewsRouteId(item);
    incoming.set(routeId, item);
  }
  const refreshedAccounts = new Set(news.map(item => item.createdByAccount).filter(Boolean));

  // Reading inside the write: concurrent getNews() calls are serialized, so
  // they can't both miss a record and create it twice.
  await safeWrite(
    db,
    async () => {
      const records = await db.get<News>('news').query().fetch();
      const kept = new Map<string, News>();
      const operations: Model[] = [];

      for (const record of records) {
        const isOrphanAccount =
          allStoredServiceIds.size > 0
            ? !allStoredServiceIds.has(record.createdByAccount)
            : !refreshedAccounts.has(record.createdByAccount);
        const isDuplicate = kept.has(record.newsId);
        const isStale = refreshedAccounts.has(record.createdByAccount) && !incoming.has(record.newsId);

        if (isOrphanAccount || isDuplicate || isStale) {
          operations.push(record.prepareDestroyPermanently());
        } else {
          kept.set(record.newsId, record);
        }
      }

      for (const [id, item] of incoming) {
        const existing = kept.get(id);
        const localRead =
          Boolean(item.acknowledged) ||
          Boolean(existing?.acknowledged) ||
          readSet.has(id) ||
          (item.id ? readSet.has(item.id) : false) ||
          Boolean(meta.extraByKey[id]?.acknowledged);

        if (localRead) {
          readSet.add(id);
          if (item.id) readSet.add(item.id);
        }

        const prevExtra = meta.extraByKey[id] ?? {};
        const resolvedContent = item.content?.trim()
          ? item.content
          : (prevExtra.content || existing?.content || "");
        const serializedRef = serializeNewsRef(item.ref) ?? prevExtra.refSnapshot;

        meta.extraByKey[id] = {
          serviceNewsId: item.id || prevExtra.serviceNewsId,
          content: resolvedContent,
          createdByAccount: item.createdByAccount || prevExtra.createdByAccount,
          acknowledged: localRead,
          refSnapshot: serializedRef,
        };

        const apply = (newsModel: News) => {
          newsModel.newsId = id;
          newsModel.title = item.title ?? newsModel.title ?? "";
          newsModel.createdAt = new Date(item.createdAt).getTime();
          newsModel.acknowledged = localRead;
          newsModel.attachments = JSON.stringify(item.attachments ?? []);
          newsModel.content = resolvedContent;
          newsModel.author = item.author ?? newsModel.author ?? "";
          newsModel.category = item.category ?? newsModel.category ?? "";
          newsModel.createdByAccount = item.createdByAccount ?? newsModel.createdByAccount ?? "";
          newsModel.question = Boolean(item.question);
        };

        operations.push(
          existing
            ? existing.prepareUpdate(model => apply(model as News))
            : db.get<News>('news').prepareCreate(model => apply(model as News))
        );
      }

      if (operations.length > 0) {
        await db.batch(operations);
      } else {
        info(`🍉 No news items to process`);
      }
    },
    10000,
    `add_news_${incoming.size}`
  );

  // Prune extraByKey entries for orphaned accounts or removed news items on refreshed accounts
  const nextExtra: Record<string, NewsExtraMeta> = {};
  for (const [key, extra] of Object.entries(meta.extraByKey)) {
    const accountId = extra?.createdByAccount;
    if (accountId && allStoredServiceIds.size > 0 && !allStoredServiceIds.has(accountId)) {
      continue;
    }
    if (accountId && refreshedAccounts.has(accountId) && !incoming.has(key)) {
      continue;
    }
    nextExtra[key] = extra;
  }
  writeNewsMetaState({ readIds: Array.from(readSet), extraByKey: nextExtra });
}


export async function getNewsFromCache(): Promise<SharedNews[]> {
  try {
    const database = getDatabaseInstance();
    const activeServiceIds = getActiveAccountServiceIds();
    const accountsCount = useAccountStore.getState().accounts.length;
    const meta = readNewsMetaState();

    const news = await database
      .get<News>('news')
      .query()
      .fetch();

    const filtered = activeServiceIds.size > 0
      ? news.filter(item => activeServiceIds.has(item.createdByAccount))
      : (accountsCount === 0 ? [] : news);

    return filtered
      .map(item => mapNewsToShared(item, meta))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  } catch (e) {
    warn(String(e));
    return [];
  }
}

function mapNewsToShared(news: News, meta: NewsMetaState = readNewsMetaState()): SharedNews {
  const extra = meta.extraByKey[news.newsId];
  const acknowledged = isLocallyRead(
    { id: news.newsId, createdByAccount: news.createdByAccount, author: news.author, title: news.title, acknowledged: news.acknowledged },
    meta,
    news.newsId
  );
  const content = news.content?.trim() ? news.content : (extra?.content ?? "");
  return {
    id: news.newsId,
    title: news.title,
    createdAt: new Date(news.createdAt),
    acknowledged,
    attachments: parseJsonArray(news.attachments) as Attachment[],
    content,
    author: news.author,
    category: news.category,
    createdByAccount: news.createdByAccount,
    fromCache: true,
    question: news.question,
    ref: hydrateNewsRef(extra?.refSnapshot, acknowledged),
  };
}
