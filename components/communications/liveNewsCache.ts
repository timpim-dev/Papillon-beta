import { generateId } from "@/utils/generateId";
import { News } from "@/services/shared/news";

const liveNewsByKey = new Map<string, News>();

function buildRouteKey(item: News): string {
  return generateId((item.author ?? "") + (item.title ?? "") + (item.createdByAccount ?? ""));
}

function buildMetaKey(title?: string, author?: string, account?: string): string {
  const normTitle = (title ?? "").trim().toLowerCase();
  const normAuthor = (author ?? "").trim().toLowerCase();
  if (!normTitle && !normAuthor) return "";
  return `meta:${normTitle}::${normAuthor}::${(account ?? "").trim()}`;
}

function hasLiveContent(item: News): boolean {
  if (typeof item.content === "string" && item.content.trim().length > 0) {
    return true;
  }
  const ref = item.ref as { is?: string; questions?: unknown[]; question?: { content?: string } } | undefined;
  if (!ref) return false;
  if (ref.is === "survey" && Array.isArray(ref.questions) && ref.questions.length > 0) {
    return true;
  }
  if (typeof ref.question?.content === "string" && ref.question.content.trim().length > 0) {
    return true;
  }
  return false;
}

function shouldKeepExisting(existing: News | undefined, incoming: News): boolean {
  if (!existing) return false;
  if (incoming.fromCache && !existing.fromCache) {
    return true;
  }
  if (existing.ref && !incoming.ref && !hasLiveContent(incoming)) {
    return true;
  }
  if (hasLiveContent(existing) && !hasLiveContent(incoming) && incoming.fromCache) {
    return true;
  }
  return false;
}

function mergeNews(existing: News | undefined, incoming: News): News {
  if (!existing) return incoming;
  if (shouldKeepExisting(existing, incoming)) {
    return {
      ...existing,
      acknowledged: Boolean(existing.acknowledged || incoming.acknowledged),
    };
  }
  return {
    ...incoming,
    content: hasLiveContent(incoming) ? incoming.content : existing.content,
    ref: incoming.ref ?? existing.ref,
    attachments: incoming.attachments?.length ? incoming.attachments : existing.attachments,
    acknowledged: Boolean(incoming.acknowledged || existing.acknowledged),
  };
}

export function cacheLiveNews(items: News[]): void {
  for (const item of items) {
    const keys = [
      item.id,
      buildRouteKey(item),
      buildMetaKey(item.title, item.author, item.createdByAccount),
      buildMetaKey(item.title, item.author),
    ].filter(Boolean);

    let existing: News | undefined;
    for (const k of keys) {
      const hit = liveNewsByKey.get(k);
      if (hit) {
        existing = hit;
        break;
      }
    }

    const merged = mergeNews(existing, item);
    for (const k of keys) {
      liveNewsByKey.set(k, merged);
    }
  }
}

export function getCachedLiveNews(id: string): News | undefined {
  return liveNewsByKey.get(id);
}

export function getCachedLiveNewsByMeta(title?: string, author?: string, account?: string): News | undefined {
  if (account) {
    const exact = liveNewsByKey.get(buildMetaKey(title, author, account));
    if (exact) return exact;
  }
  return liveNewsByKey.get(buildMetaKey(title, author));
}

export function markCachedLiveNewsRead(ids: string[]): void {
  const idSet = new Set(ids.filter(Boolean));
  if (idSet.size === 0) return;
  for (const [key, item] of liveNewsByKey.entries()) {
    const routeKey = buildRouteKey(item);
    if (idSet.has(key) || idSet.has(item.id) || idSet.has(routeKey)) {
      const updated = { ...item, acknowledged: true };
      liveNewsByKey.set(key, updated);
    }
  }
}

export function clearCachedLiveNews(): void {
  liveNewsByKey.clear();
}
