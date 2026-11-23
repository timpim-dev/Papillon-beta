import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-mmkv", () => {
  const g = globalThis as typeof globalThis & {
    __papillonCalendarSyncMockMmkv?: Map<string, Map<string, string>>;
  };
  const getStores = () => {
    if (!g.__papillonCalendarSyncMockMmkv) {
      g.__papillonCalendarSyncMockMmkv = new Map<string, Map<string, string>>();
    }
    return g.__papillonCalendarSyncMockMmkv;
  };
  return {
    createMMKV: ({ id = "default" }: { id?: string } = {}) => {
      const stores = getStores();
      if (!stores.has(id)) {
        stores.set(id, new Map<string, string>());
      }
      const store = stores.get(id)!;
      return {
        getString: (k: string) => store.get(k),
        set: (k: string, v: string) => store.set(k, v),
        remove: (k: string) => store.delete(k),
        delete: (k: string) => store.delete(k),
        getAllKeys: () => Array.from(store.keys()),
      };
    },
  };
});

jest.mock("@/stores/global", () => ({
  createMMKVStorage: () => ({
    getItem: () => null,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  }),
}));

const mockNativeEvents = new Map<
  string,
  { calendarId: string; details: Record<string, any> }
>();
const mockCalendars: any[] = [];
let mockNextEventId = 1;

jest.mock("expo-calendar", () => {
  class MockExpoCalendarEvent {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    static async get(eventId: string) {
      if (!mockNativeEvents.has(eventId)) {
        throw new Error(`Event ${eventId} not found`);
      }
      return new MockExpoCalendarEvent(eventId);
    }
    async update(details: Record<string, any>) {
      const existing = mockNativeEvents.get(this.id);
      if (!existing) throw new Error(`Event ${this.id} not found`);
      existing.details = { ...details };
    }
    async delete() {
      if (!mockNativeEvents.has(this.id)) {
        throw new Error(`Event ${this.id} not found`);
      }
      mockNativeEvents.delete(this.id);
    }
  }

  class MockExpoCalendar {
    id: string;
    title: string;
    allowsModifications: boolean;
    source: any;
    color?: string;
    ownerAccount?: string;
    accessLevel?: string;
    isPrimary?: boolean;

    constructor(init: any) {
      this.id = init.id;
      this.title = init.title;
      this.allowsModifications = init.allowsModifications ?? true;
      this.source = init.source ?? { name: "Device", type: "local" };
      this.color = init.color;
      this.ownerAccount = init.ownerAccount;
      this.accessLevel = init.accessLevel;
      this.isPrimary = init.isPrimary;
    }

    static async get(calendarId: string) {
      const match = mockCalendars.find(c => c.id === calendarId);
      if (!match) throw new Error(`Calendar ${calendarId} not found`);
      return match;
    }

    async createEvent(details: Record<string, any>) {
      const id = `evt-${mockNextEventId++}`;
      mockNativeEvents.set(id, { calendarId: this.id, details: { ...details } });
      return new MockExpoCalendarEvent(id);
    }
  }

  return {
    __esModule: true,
    CalendarAccessLevel: {
      CONTRIBUTOR: "contributor",
      EDITOR: "editor",
      FREEBUSY: "freebusy",
      OVERRIDE: "override",
      OWNER: "owner",
      READ: "read",
      RESPOND: "respond",
      ROOT: "root",
      NONE: "none",
    },
    EntityTypes: {
      EVENT: "event",
      REMINDER: "reminder",
    },
    SourceType: {
      LOCAL: "local",
      EXCHANGE: "exchange",
      CALDAV: "caldav",
      MOBILEME: "mobileme",
      SUBSCRIBED: "subscribed",
      BIRTHDAYS: "birthdays",
    },
    ExpoCalendar: MockExpoCalendar,
    ExpoCalendarEvent: MockExpoCalendarEvent,
    getCalendars: jest.fn(async () => mockCalendars),
    getCalendarPermissions: jest.fn(async () => ({ status: "granted", granted: true, canAskAgain: true })),
    requestCalendarPermissions: jest.fn(async () => ({ status: "granted", granted: true, canAskAgain: true })),
    createCalendar: jest.fn(async (details: any) => {
      const created = new MockExpoCalendar({ id: `cal-${mockCalendars.length + 1}`, ...details });
      mockCalendars.push(created);
      return created;
    }),
    getSourcesSync: jest.fn(() => []),
    getDefaultCalendarSync: jest.fn(() => mockCalendars[0]),
  };
});

jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: "file:///cache/papillon-emploi-du-temps.ics",
    write: jest.fn(),
  })),
  Paths: { cache: "/cache" },
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

jest.mock("@/stores/account", () => ({
  useAccountStore: {
    getState: () => ({
      lastUsedAccount: "acc-1",
      accounts: [
        {
          id: "acc-1",
          customisation: {
            subjects: {
              mathmatiques: { name: "Maths Spé", emoji: "📐" },
            },
          },
          services: [{ id: "svc-pronote" }],
        },
      ],
      setSubjectName: jest.fn(),
      setSubjectEmoji: jest.fn(),
    }),
  },
}));

import { ExpoCalendar } from "expo-calendar";

import { Course, CourseStatus, CourseType } from "@/services/shared/timetable";
import { resolveCalendarSyncConfig } from "@/stores/settings";
import {
  buildCoursesIcsString,
  classifyCalendarProvider,
  clearSyncedCalendarEvents,
  formatCourseCalendarEvent,
  getTrackedCalendarEventCount,
  isCalendarWritable,
  syncCoursesToCalendars,
} from "./calendarSync";

describe("Native Calendar Sync & .ics export", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        __papillonCalendarSyncMockMmkv?: Map<string, Map<string, string>>;
      }
    ).__papillonCalendarSyncMockMmkv?.clear();
    mockNativeEvents.clear();
    mockCalendars.length = 0;
    mockNextEventId = 1;
  });

  it("resolves calendarSync config with defaults, deduplication, and weeksAhead bounds", () => {
    const def = resolveCalendarSyncConfig(undefined);
    expect(def.enabled).toBe(false);
    expect(def.targetCalendarIds).toEqual([]);
    expect(def.autoSync).toBe(true);
    expect(def.weeksAhead).toBe(4);
    expect(def.includeCanceled).toBe(false);

    const clamped = resolveCalendarSyncConfig({
      calendarSync: {
        enabled: true,
        targetCalendarIds: ["cal-a", "cal-b", "cal-a", ""],
        autoSync: false,
        weeksAhead: 99,
        includeCanceled: true,
        includeEmoji: false,
        includeDetails: false,
      },
    });
    expect(clamped.targetCalendarIds).toEqual(["cal-a", "cal-b"]);
    expect(clamped.weeksAhead).toBe(12);
    expect(clamped.includeCanceled).toBe(true);
  });

  it("classifies iCloud and Google providers and filters read-only calendars", () => {
    expect(
      classifyCalendarProvider({
        id: "1",
        source: { name: "iCloud", type: "caldav" },
      })
    ).toBe("icloud");

    expect(
      classifyCalendarProvider({
        id: "2",
        ownerAccount: "student@gmail.com",
        source: { name: "student@gmail.com", type: "com.google" },
      })
    ).toBe("google");

    expect(
      isCalendarWritable({
        id: "holiday",
        allowsModifications: true,
        ownerAccount: "fr.french#holiday@group.v.calendar.google.com",
        accessLevel: "read",
      })
    ).toBe(false);

    expect(
      isCalendarWritable({
        id: "google-cours",
        allowsModifications: true,
        ownerAccount: "student@gmail.com",
        accessLevel: "owner",
      })
    ).toBe(true);
  });

  it("formats events with custom subject name, emoji, room, teacher, and canceled prefix", () => {
    const course: Course = {
      id: "c-1",
      subject: "Mathématiques",
      type: CourseType.LESSON,
      from: new Date("2026-11-23T08:00:00Z"),
      to: new Date("2026-11-23T09:00:00Z"),
      teacher: "M. Euler",
      room: "B204",
      group: "Groupe A",
      createdByAccount: "svc-pronote",
    };

    const formatted = formatCourseCalendarEvent(course, {
      includeEmoji: true,
      includeDetails: true,
    });
    expect(formatted.title).toBe("📐 Maths Spé");
    expect(formatted.location).toBe("B204");
    expect(formatted.notes).toContain("Professeur : M. Euler");
    expect(formatted.notes).toContain("Salle : B204");
    expect(formatted.notes).toContain("[Papillon+]");

    const canceledFormatted = formatCourseCalendarEvent(
      { ...course, status: CourseStatus.CANCELED },
      { includeEmoji: true, includeDetails: true }
    );
    expect(canceledFormatted.title).toBe("[Annulé] 📐 Maths Spé");
  });

  it("syncs across iCloud + Google calendars, skips unchanged, updates room, removes canceled, and never touches personal events", async () => {
    mockCalendars.push(
      new (ExpoCalendar as any)({
        id: "icloud-1",
        title: "Cours iCloud",
        source: { name: "iCloud", type: "caldav" },
        allowsModifications: true,
      }),
      new (ExpoCalendar as any)({
        id: "google-1",
        title: "Cours Google",
        ownerAccount: "student@gmail.com",
        source: { name: "student@gmail.com", type: "com.google" },
        accessLevel: "owner",
        allowsModifications: true,
      })
    );

    // Pre-existing personal event that Papillon must never touch
    mockNativeEvents.set("personal-evt", {
      calendarId: "google-1",
      details: { title: "Dentiste" },
    });

    const windowStart = new Date("2026-11-23T00:00:00Z");
    const windowEnd = new Date("2026-11-30T23:59:59Z");

    const mathCourse: Course = {
      id: "c1",
      subject: "Mathématiques",
      type: CourseType.LESSON,
      from: new Date("2026-11-23T08:00:00Z"),
      to: new Date("2026-11-23T09:00:00Z"),
      room: "B204",
      teacher: "M. Euler",
      createdByAccount: "svc-pronote",
    };
    const icalIgnored: Course = {
      id: "ical-1",
      subject: "Club Échecs",
      type: CourseType.ACTIVITY,
      from: new Date("2026-11-24T12:00:00Z"),
      to: new Date("2026-11-24T13:00:00Z"),
      createdByAccount: "ical_abc",
    };

    const first = await syncCoursesToCalendars({
      courses: [mathCourse, icalIgnored],
      calendarIds: ["icloud-1", "google-1"],
      windowStart,
      windowEnd,
      includeCanceled: false,
      includeEmoji: true,
      includeDetails: true,
    });
    expect(first.created).toBe(2);
    expect(first.calendarsSynced).toBe(2);
    expect(getTrackedCalendarEventCount()).toBe(2);
    expect(mockNativeEvents.has("personal-evt")).toBe(true);

    // Second run with same courses skips both
    const second = await syncCoursesToCalendars({
      courses: [mathCourse],
      calendarIds: ["icloud-1", "google-1"],
      windowStart,
      windowEnd,
      includeCanceled: false,
      includeEmoji: true,
      includeDetails: true,
    });
    expect(second.skipped).toBe(2);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);

    // Room change updates both events in place
    const third = await syncCoursesToCalendars({
      courses: [{ ...mathCourse, room: "C102" }],
      calendarIds: ["icloud-1", "google-1"],
      windowStart,
      windowEnd,
      includeCanceled: false,
      includeEmoji: true,
      includeDetails: true,
    });
    expect(third.updated).toBe(2);

    // Canceled course removes events when includeCanceled is false
    const fourth = await syncCoursesToCalendars({
      courses: [{ ...mathCourse, status: CourseStatus.CANCELED }],
      calendarIds: ["icloud-1", "google-1"],
      windowStart,
      windowEnd,
      includeCanceled: false,
      includeEmoji: true,
      includeDetails: true,
    });
    expect(fourth.deleted).toBe(2);
    expect(getTrackedCalendarEventCount()).toBe(0);
    expect(mockNativeEvents.has("personal-evt")).toBe(true);

    // Re-create then clear explicitly
    await syncCoursesToCalendars({
      courses: [mathCourse],
      calendarIds: ["icloud-1"],
      windowStart,
      windowEnd,
      includeCanceled: false,
      includeEmoji: true,
      includeDetails: true,
    });
    const cleared = await clearSyncedCalendarEvents(["icloud-1"]);
    expect(cleared).toBe(1);
    expect(mockNativeEvents.has("personal-evt")).toBe(true);
  });

  it("builds valid RFC 5545 .ics export content", () => {
    const ics = buildCoursesIcsString(
      [
        {
          id: "c1",
          subject: "Mathématiques",
          type: CourseType.LESSON,
          from: new Date("2026-11-23T08:00:00Z"),
          to: new Date("2026-11-23T09:00:00Z"),
          room: "A101, Bâtiment A",
          teacher: "Mme Curie",
          createdByAccount: "svc-pronote",
        },
        {
          id: "c2",
          subject: "Physique",
          type: CourseType.LESSON,
          from: new Date("2026-11-23T10:00:00Z"),
          to: new Date("2026-11-23T11:00:00Z"),
          status: CourseStatus.CANCELED,
          createdByAccount: "svc-pronote",
        },
      ],
      { includeCanceled: false, includeEmoji: true, includeDetails: true }
    );

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:📐 Maths Spé");
    expect(ics).toContain("LOCATION:A101\\, Bâtiment A");
    expect(ics).toContain("DTSTART:20261123T080000Z");
    expect(ics).not.toContain("Physique");
    expect(ics).toContain("END:VCALENDAR");
  });
});
