import { describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => "notif-1"),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
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

import { diffNewChats } from "./communicationsNotifications";
import { computeDesiredHomeworkReminders } from "./homeworkReminders";

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
  const makeChat = (id: string, ts: number): Chat => ({
    id,
    subject: `Subject ${id}`,
    creator: "Mme Dupont",
    date: new Date(ts),
    createdByAccount: "acc-1",
  });

  it("seeds baseline without emitting notifications on initial sync", () => {
    const first = diffNewChats([makeChat("c1", 1000)], null);
    expect(first.newChats).toEqual([]);
    expect(first.nextKnownSignatures).toHaveLength(1);
  });

  it("detects genuinely new or updated chats after baseline exists", () => {
    const first = diffNewChats([makeChat("c1", 1000)], null);
    const second = diffNewChats(
      [makeChat("c1", 1000), makeChat("c2", 2000)],
      first.nextKnownSignatures
    );
    expect(second.newChats.map(c => c.id)).toEqual(["c2"]);
  });
});
