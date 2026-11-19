import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockMmkvStores = new Map<string, Map<string, string>>();

jest.mock("react-native-mmkv", () => ({
  createMMKV: ({ id = "default" }: { id?: string } = {}) => {
    if (!mockMmkvStores.has(id)) {
      mockMmkvStores.set(id, new Map<string, string>());
    }
    const store = mockMmkvStores.get(id)!;
    return {
      getString: (k: string) => store.get(k),
      set: (k: string, v: string) => store.set(k, v),
      remove: (k: string) => store.delete(k),
      delete: (k: string) => store.delete(k),
      getAllKeys: () => Array.from(store.keys()),
    };
  },
}));

const mockAccountState = {
  lastUsedAccount: "user-a",
  accounts: [
    {
      id: "user-a",
      services: [{ id: "svc-a" }],
    },
  ],
};

jest.mock("@/stores/account", () => ({
  useAccountStore: Object.assign(
    (selector: any) => selector(mockAccountState),
    { getState: () => mockAccountState }
  ),
}));

jest.mock("@/utils/logger/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const tables: Record<string, any[]> = {
  news: [],
  periods: [],
  grades: [],
  periodgrades: [],
  subjects: [],
};

function wrapRecord(table: string, rec: Record<string, any>) {
  rec._table = table;
  rec.prepareDestroyPermanently = () => ({ type: "destroy", table, rec });
  rec.prepareUpdate = (updater: (m: any) => void) => {
    updater(rec);
    return { type: "update", table, rec };
  };
  return rec;
}

const mockDb = {
  write: async (fn: () => Promise<any>) => fn(),
  batch: async (ops: any[]) => {
    for (const op of ops) {
      if (op.type === "destroy") {
        const arr = tables[op.table];
        const idx = arr.indexOf(op.rec);
        if (idx !== -1) arr.splice(idx, 1);
      } else if (op.type === "create") {
        tables[op.table].push(op.rec);
      }
    }
  },
  get: (table: string) => ({
    query: (...clauses: any[]) => ({
      fetch: async () => {
        let rows = [...(tables[table] ?? [])];
        for (const clause of clauses) {
          const left = clause?.left;
          const op = clause?.comparison?.operator;
          const right = clause?.comparison?.right;
          if (left === "newsId" && op === "eq") {
            rows = rows.filter(r => r.newsId === right?.value);
          } else if (left === "newsId" && op === "oneOf") {
            rows = rows.filter(r => (right?.values ?? []).includes(r.newsId));
          } else if (left === "createdByAccount" && op === "oneOf") {
            rows = rows.filter(r => (right?.values ?? []).includes(r.createdByAccount));
          } else if (left === "periodGradeId" && op === "eq") {
            rows = rows.filter(r => r.periodGradeId === right?.value);
          } else if (left === "subjectId" && op === "eq") {
            rows = rows.filter(r => r.subjectId === right?.value);
          }
        }
        return rows;
      },
    }),
    prepareCreate: (init: (m: any) => void) => {
      const rec = wrapRecord(table, { id: `${table}-${Math.random().toString(36).slice(2)}` });
      init(rec);
      return { type: "create", table, rec };
    },
  }),
};

jest.mock("./DatabaseProvider", () => ({
  getDatabaseInstance: () => mockDb,
  useDatabase: () => mockDb,
}));

jest.mock("./models/News", () => ({}));
jest.mock("./models/Grades", () => ({ Grade: {}, Period: {}, PeriodGrades: {} }));
jest.mock("./models/Subject", () => ({}));

import { cacheLiveNews, clearCachedLiveNews, getCachedLiveNews } from "@/components/communications/liveNewsCache";
import {
  addPeriodsToDatabase,
  cachePeriodGrades,
  clearPeriodGradesCacheForAccount,
  getCachedPeriodGrades,
  getPeriodsFromCache,
  pruneOrphanedGradesCache,
} from "./useGrades";
import {
  addNewsToDatabase,
  getNewsById,
  getNewsFromCache,
  getNewsRouteId,
  markAllNewsAsRead,
  markNewsAsRead,
} from "./useNews";

describe("useNews, liveNewsCache & useGrades account scoping", () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) {
      tables[key] = [];
    }
    mockMmkvStores.clear();
    clearCachedLiveNews();
    mockAccountState.lastUsedAccount = "user-a";
    mockAccountState.accounts = [{ id: "user-a", services: [{ id: "svc-a" }] }];
  });

  it("preserves local read status, filters active account, and keeps live content ahead of empty cache", async () => {
    const liveItem = {
      id: "server-1",
      title: "Information importante",
      createdAt: new Date("2026-11-10T10:00:00Z"),
      acknowledged: false,
      attachments: [],
      content: "<p>Contenu détaillé</p>",
      author: "Vie scolaire",
      category: "Info",
      createdByAccount: "svc-a",
      ref: { is: "information", content: "<p>Contenu détaillé</p>" } as any,
    };

    const orphanItem = {
      ...liveItem,
      id: "server-old",
      title: "Ancien compte",
      createdByAccount: "svc-old",
    };

    tables.news.push(
      wrapRecord("news", {
        newsId: "orphan-route",
        title: "Ancien compte",
        createdAt: Date.now(),
        acknowledged: false,
        attachments: "[]",
        content: "Old",
        author: "Vie scolaire",
        category: "Info",
        createdByAccount: "svc-old",
        question: false,
      })
    );

    await addNewsToDatabase([liveItem]);

    // Orphan record from logged-out svc-old should have been pruned and filtered
    let cached = await getNewsFromCache();
    expect(cached).toHaveLength(1);
    expect(cached[0].title).toBe("Information importante");

    // Empty cached copy must NOT wipe live ref/content in liveNewsCache
    const routeId = getNewsRouteId(liveItem);
    cacheLiveNews([{ ...liveItem, id: routeId, content: "", ref: undefined, fromCache: true }]);
    expect(getCachedLiveNews(routeId)?.content).toBe("<p>Contenu détaillé</p>");
    expect(getCachedLiveNews(routeId)?.ref).toBeDefined();

    // Mark as read locally, then simulate server still returning acknowledged: false
    await markNewsAsRead(liveItem);
    await addNewsToDatabase([{ ...liveItem, acknowledged: false }, orphanItem]);

    cached = await getNewsFromCache();
    const match = cached.find(n => n.createdByAccount === "svc-a");
    expect(match?.acknowledged).toBe(true);

    // Unread news item gets cleared cleanly via markAllNewsAsRead
    const item2 = { ...liveItem, id: "server-2", title: "Sondage 2" };
    await addNewsToDatabase([liveItem, item2]);
    await markAllNewsAsRead([liveItem, item2]);
    cached = await getNewsFromCache();
    expect(cached.every(item => item.acknowledged)).toBe(true);

    const byId = await getNewsById(routeId);
    expect(byId?.acknowledged).toBe(true);
    expect(byId?.content).toBe("<p>Contenu détaillé</p>");
  });

  it("filters periods by active account, deduplicates, and prunes orphaned grades cache", async () => {
    await addPeriodsToDatabase([
      {
        id: "p1",
        name: "Trimestre 1",
        start: new Date("2026-09-01"),
        end: new Date("2026-11-30"),
        createdByAccount: "svc-a",
      },
      {
        id: "p1-dup",
        name: "Trimestre 1",
        start: new Date("2026-09-01"),
        end: new Date("2026-11-30"),
        createdByAccount: "svc-a",
      },
      {
        id: "p-other",
        name: "Trimestre 1",
        start: new Date("2026-09-01"),
        end: new Date("2026-11-30"),
        createdByAccount: "svc-b",
      },
    ]);

    const periods = await getPeriodsFromCache();
    expect(periods).toHaveLength(1);
    expect(periods[0].createdByAccount).toBe("svc-a");

    cachePeriodGrades({ studentOverall: { value: 15 }, classAverage: { value: 12 }, subjects: [], createdByAccount: "svc-a" }, "svc-a::Trimestre 1");
    cachePeriodGrades({ studentOverall: { value: 10 }, classAverage: { value: 11 }, subjects: [], createdByAccount: "svc-b" }, "svc-b::Trimestre 1");

    await pruneOrphanedGradesCache(["svc-a"]);
    expect(getCachedPeriodGrades("svc-a::Trimestre 1")?.studentOverall.value).toBe(15);
    expect(getCachedPeriodGrades("svc-b::Trimestre 1")).toBeNull();

    clearPeriodGradesCacheForAccount("svc-a");
    expect(getCachedPeriodGrades("svc-a::Trimestre 1")).toBeNull();
  });
});
