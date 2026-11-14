import { describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => "notif-1"),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

jest.mock("react-native", () => ({
  Platform: { OS: "android", Version: 34 },
}));

jest.mock("react-native-mmkv", () => {
  const stores = new Map<string, Map<string, string>>();
  return {
    createMMKV: ({ id }: { id: string }) => {
      if (!stores.has(id)) {
        stores.set(id, new Map<string, string>());
      }
      const m = stores.get(id)!;
      return {
        getString: (k: string) => m.get(k),
        set: (k: string, v: string) => m.set(k, v),
        remove: (k: string) => m.delete(k),
      };
    },
  };
});

jest.mock("@/utils/logger/logger", () => ({
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

jest.mock("@/utils/subjects/name", () => ({
  getSubjectName: (s: string) => s,
}));

jest.mock("@/stores/global", () => {
  const store = new Map<string, string>();
  return {
    storage: {
      getString: (k: string) => store.get(k),
      set: (k: string, v: string) => store.set(k, v),
      remove: (k: string) => store.delete(k),
    },
  };
});

import { Homework } from "@/services/shared/homework";
import { Chat } from "@/services/shared/chat";
import { News } from "@/services/shared/news";

import {
  buildChatActivitySignature,
  buildChatSignature,
  detectAndNotifyNewChats,
  diffNewChats,
  diffNewNews,
  getReadChatSignatures,
  isChatUnread,
  markChatAsRead,
} from "./communicationsNotifications";
import {
  computeDailyUndoneDigest,
  computeDesiredHomeworkReminders,
} from "./homeworkReminders";

describe("homeworkReminders", () => {
  const now = new Date(2026, 10, 14, 14, 0, 0).getTime();

  function makeTask(partial: Partial<Homework>): Homework {
    return {
      id: "task-1",
      subject: "Mathématiques",
      content: "<p>Exercices 12 à 18</p>",
      dueDate: new Date(2026, 10, 16, 8, 0, 0),
      isDone: false,
      returnFormat: 0,
      attachments: [],
      evaluation: false,
      custom: false,
      createdByAccount: "acc-1",
      ...partial,
    };
  }

  it("schedules evening-before reminder for incomplete upcoming tasks and strips HTML", () => {
    const tasks = [makeTask({ id: "hw-1" }), makeTask({ id: "hw-done", isDone: true })];
    const desired = computeDesiredHomeworkReminders(
      tasks,
      { enabled: true, hour: 18, minute: 30, daysBefore: 1 },
      now
    );

    expect(desired).toHaveLength(1);
    expect(desired[0].taskId).toBe("hw-1");
    expect(desired[0].body).toBe("Exercices 12 à 18");
    const triggerDate = new Date(desired[0].triggerAtMs);
    expect(triggerDate.getDate()).toBe(15);
    expect(triggerDate.getHours()).toBe(18);
    expect(triggerDate.getMinutes()).toBe(30);
  });

  it("schedules morning 07:45 catch-up when task due tomorrow was synced after evening hour", () => {
    const lateEveningNow = new Date(2026, 10, 14, 20, 0, 0).getTime();
    const dueTomorrow = new Date(2026, 10, 15, 8, 0, 0);
    const desired = computeDesiredHomeworkReminders(
      [makeTask({ id: "hw-urgent", dueDate: dueTomorrow })],
      { enabled: true, hour: 18, minute: 30, daysBefore: 1 },
      lateEveningNow
    );

    expect(desired).toHaveLength(1);
    const trigger = new Date(desired[0].triggerAtMs);
    expect(trigger.getDate()).toBe(15);
    expect(trigger.getHours()).toBe(7);
    expect(trigger.getMinutes()).toBe(45);
  });

  it("builds a daily undone digest only when upcoming undone tasks exist", () => {
    const digest = computeDailyUndoneDigest(
      [makeTask({ id: "hw-1", subject: "Français" })],
      { enabled: true, hour: 18, minute: 30, daysBefore: 1, dailyDigestEnabled: true },
      now
    );
    expect(digest).not.toBeNull();
    expect(digest?.undoneCount).toBe(1);
    expect(digest?.body).toContain("Français");

    const none = computeDailyUndoneDigest(
      [makeTask({ id: "hw-1", isDone: true })],
      { enabled: true, hour: 18, minute: 30, daysBefore: 1, dailyDigestEnabled: true },
      now
    );
    expect(none).toBeNull();
  });

  it("returns no reminders when disabled", () => {
    const desired = computeDesiredHomeworkReminders(
      [makeTask({ id: "hw-1" })],
      { enabled: false, hour: 18, minute: 30, daysBefore: 1 },
      now
    );
    expect(desired).toEqual([]);
  });
});

describe("communicationsNotifications", () => {
  const makeChat = (id: string, ts: number, msgCount = 1, unread = 0): Chat => ({
    id,
    subject: `Subject ${id}`,
    creator: "Mme Dupont",
    date: new Date(ts),
    createdByAccount: "acc-1",
    ref: {
      participantsMessageID: id,
      numberOfMessages: msgCount,
      numberOfMessagesUnread: unread,
    } as never,
  });

  const makeNews = (id: string, acknowledged = false, question = false): News => ({
    id,
    title: `Info ${id}`,
    createdAt: new Date(1000),
    acknowledged,
    attachments: [],
    content: "<p>Contenu</p>",
    author: "Vie scolaire",
    category: "Information",
    createdByAccount: "acc-1",
    question,
  });

  it("seeds baseline without emitting notifications on initial sync and notifies on replies or new threads", () => {
    const first = diffNewChats([makeChat("c1", 1000, 1, 0)], null);
    expect(first.newChats).toEqual([]);

    const reply = diffNewChats([makeChat("c1", 2000, 2, 1)], first.nextKnownSignatures);
    expect(reply.newChats.map(c => c.id)).toEqual(["c1"]);

    const second = diffNewChats(
      [makeChat("c1", 2000, 2, 0), makeChat("c2", 3000, 1, 1)],
      reply.nextKnownSignatures
    );
    expect(second.newChats.map(c => c.id)).toEqual(["c2"]);
  });

  it("keeps read chats read when Pronote relative dates shift across launches and never re-notifies when unread is 0", async () => {
    const initial = makeChat("c-drift", new Date(2026, 10, 14, 15, 0, 0).getTime(), 2, 1);
    await detectAndNotifyNewChats([initial], false);

    markChatAsRead(initial);
    expect(isChatUnread(initial, getReadChatSignatures())).toBe(false);

    // Same discussion reopened next day where Pawnote shifts parsed timestamp
    const shiftedDateChat = makeChat("c-drift", new Date(2026, 10, 15, 15, 0, 0).getTime(), 2, 0);
    expect(buildChatSignature(shiftedDateChat)).toBe(buildChatSignature(initial));
    expect(buildChatActivitySignature(shiftedDateChat)).toBe(buildChatActivitySignature(initial));

    const notified = await detectAndNotifyNewChats([shiftedDateChat], false);
    expect(notified).toBe(0);
    expect(isChatUnread(shiftedDateChat, getReadChatSignatures())).toBe(false);

    // Even if activity signature wasn't previously known (e.g. migration), unread=0 stays read
    const serverReadChat = makeChat("c-server-read", new Date(2026, 10, 15, 16, 0, 0).getTime(), 3, 0);
    const diff = diffNewChats([serverReadChat], []);
    expect(diff.newChats).toEqual([]);
    const notifiedServerRead = await detectAndNotifyNewChats([serverReadChat], false);
    expect(notifiedServerRead).toBe(0);
    expect(isChatUnread(serverReadChat, getReadChatSignatures())).toBe(false);
  });

  it("detects new unacknowledged infos and surveys after initial baseline seed", () => {
    const seed = diffNewNews([makeNews("n1", false)], null);
    expect(seed.newItems).toEqual([]);

    const next = diffNewNews(
      [makeNews("n1", false), makeNews("n2", false, true), makeNews("n3", true)],
      seed.nextKnownSignatures
    );
    expect(next.newItems.map(i => i.id)).toEqual(["n2"]);
    expect(next.newItems[0].question).toBe(true);
  });
});
