import { generateId } from "@/utils/generateId";
import { News } from "@/services/shared/news";

const liveNewsByKey = new Map<string, News>();

function buildRouteKey(item: News): string {
  return generateId(item.author + item.title + item.createdByAccount);
}

export function cacheLiveNews(items: News[]): void {
  for (const item of items) {
    if (item.id) {
      liveNewsByKey.set(item.id, item);
    }
    liveNewsByKey.set(buildRouteKey(item), item);
  }
}

export function getCachedLiveNews(id: string): News | undefined {
  return liveNewsByKey.get(id);
}
