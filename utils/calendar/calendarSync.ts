import * as Calendar from "expo-calendar";
import {
  CalendarAccessLevel,
  EntityTypes,
  ExpoCalendar,
  ExpoCalendarEvent,
  SourceType,
} from "expo-calendar";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { createMMKV, type MMKV } from "react-native-mmkv";

import { Course, CourseStatus, CourseType } from "@/services/shared/timetable";
import { getSubjectEmoji } from "@/utils/subjects/emoji";
import { getSubjectName } from "@/utils/subjects/name";

export type CalendarProviderKind = "icloud" | "google" | "exchange" | "local" | "other";

export interface DeviceCalendarOption {
  id: string;
  title: string;
  color?: string;
  sourceName: string;
  ownerAccount?: string;
  provider: CalendarProviderKind;
  isPrimary?: boolean;
}

export interface CalendarSyncResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  calendarsSynced: number;
  missingCalendarIds: string[];
}

export interface CalendarFormatOptions {
  includeEmoji: boolean;
  includeDetails: boolean;
}

export interface FormattedCalendarEvent {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
  hash: string;
}

type TrackedEventRecord = {
  eventId: string;
  hash: string;
  startMs: number;
  endMs: number;
};

type SyncedEventsStore = Record<string, Record<string, TrackedEventRecord>>;

const CALENDAR_SYNC_STORAGE_ID = "papillon-calendar-sync-v1";
const SYNCED_EVENTS_KEY = "synced_events_by_calendar_v1";

let storageInstance: MMKV | null | undefined;

function getSyncStorage(): MMKV | null {
  if (storageInstance !== undefined) return storageInstance;
  try {
    storageInstance = createMMKV({ id: CALENDAR_SYNC_STORAGE_ID });
  } catch {
    storageInstance = null;
  }
  return storageInstance;
}

function readSyncedStore(): SyncedEventsStore {
  const storage = getSyncStorage();
  if (!storage) return {};
  const raw = storage.getString(SYNCED_EVENTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as SyncedEventsStore)
      : {};
  } catch {
    return {};
  }
}

function writeSyncedStore(store: SyncedEventsStore): void {
  const storage = getSyncStorage();
  if (!storage) return;
  try {
    storage.set(SYNCED_EVENTS_KEY, JSON.stringify(store));
  } catch {
    // Ignore persistence write errors
  }
}

function stableHashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export interface CalendarLike {
  id: string;
  title?: string;
  color?: string;
  allowsModifications?: boolean;
  isPrimary?: boolean;
  ownerAccount?: string;
  name?: string | null;
  type?: string;
  accessLevel?: string;
  source?: {
    name?: string;
    type?: string;
    isLocalAccount?: boolean;
  };
}

export function classifyCalendarProvider(cal: CalendarLike): CalendarProviderKind {
  const sourceType = String(cal.source?.type ?? "").toLowerCase();
  const sourceName = String(cal.source?.name ?? "").toLowerCase();
  const ownerAccount = String(cal.ownerAccount ?? "").toLowerCase();
  const calType = String(cal.type ?? "").toLowerCase();

  if (
    sourceName.includes("icloud") ||
    sourceType === "mobileme" ||
    (sourceType === "caldav" && sourceName.includes("icloud"))
  ) {
    return "icloud";
  }

  if (
    sourceType === "com.google" ||
    sourceName.includes("google") ||
    sourceName.includes("gmail") ||
    ownerAccount.includes("@gmail.") ||
    ownerAccount.includes("@googlemail.") ||
    ownerAccount.includes("google") ||
    (calType === "caldav" && (sourceName.includes("google") || ownerAccount.includes("@")))
  ) {
    return "google";
  }

  if (
    sourceType === "exchange" ||
    sourceType.includes("exchange") ||
    sourceName.includes("exchange") ||
    sourceName.includes("outlook") ||
    sourceName.includes("office") ||
    sourceName.includes("microsoft")
  ) {
    return "exchange";
  }

  if (cal.source?.isLocalAccount || sourceType === "local" || calType === "local") {
    return "local";
  }

  return "other";
}

const WRITABLE_ANDROID_ACCESS_LEVELS = new Set<string>([
  CalendarAccessLevel.OWNER,
  CalendarAccessLevel.EDITOR,
  CalendarAccessLevel.CONTRIBUTOR,
  CalendarAccessLevel.ROOT,
  CalendarAccessLevel.OVERRIDE,
  "700",
  "600",
  "500",
  "800",
]);

export function isCalendarWritable(cal: CalendarLike): boolean {
  if (cal.allowsModifications === false) {
    return false;
  }

  const owner = String(cal.ownerAccount ?? "").toLowerCase();
  const name = String(cal.name ?? "").toLowerCase();
  if (
    owner.includes("#holiday@group.v.calendar.google.com") ||
    owner.includes("#contacts@group.v.calendar.google.com") ||
    name.includes("#holiday@group.v.calendar.google.com") ||
    name.includes("addressbook#contacts")
  ) {
    return false;
  }

  if (cal.accessLevel !== undefined && cal.accessLevel !== null) {
    const normalized = String(cal.accessLevel).toLowerCase();
    if (!WRITABLE_ANDROID_ACCESS_LEVELS.has(normalized)) {
      return false;
    }
  }

  return true;
}

export async function getCalendarPermissionStatus(): Promise<Calendar.PermissionResponse> {
  return Calendar.getCalendarPermissions(false);
}

export async function requestCalendarPermission(): Promise<Calendar.PermissionResponse> {
  return Calendar.requestCalendarPermissions(false);
}

const PROVIDER_RANK: Record<CalendarProviderKind, number> = {
  icloud: 0,
  google: 1,
  exchange: 2,
  other: 3,
  local: 4,
};

export async function listWritableDeviceCalendars(): Promise<DeviceCalendarOption[]> {
  const raw = await Calendar.getCalendars(EntityTypes.EVENT);
  const writable: DeviceCalendarOption[] = [];

  for (const cal of raw) {
    if (!isCalendarWritable(cal as unknown as CalendarLike)) continue;
    const provider = classifyCalendarProvider(cal as unknown as CalendarLike);
    writable.push({
      id: cal.id,
      title: cal.title || cal.name || "Calendrier",
      color: cal.color,
      sourceName: cal.source?.name || cal.ownerAccount || "Appareil",
      ownerAccount: cal.ownerAccount,
      provider,
      isPrimary: cal.isPrimary,
    });
  }

  writable.sort((a, b) => {
    const rankDiff = PROVIDER_RANK[a.provider] - PROVIDER_RANK[b.provider];
    if (rankDiff !== 0) return rankDiff;
    if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) {
      return a.isPrimary ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  return writable;
}

export async function createDedicatedPapillonCalendar(): Promise<DeviceCalendarOption | null> {
  if (Platform.OS !== "ios") {
    return null;
  }

  const existing = await listWritableDeviceCalendars();
  const alreadyExists = existing.find(
    c => c.title.trim().toLowerCase() === "papillon +"
  );
  if (alreadyExists) {
    return alreadyExists;
  }

  const sources = Calendar.getSourcesSync();
  let defaultSource: Calendar.Source | undefined;
  try {
    defaultSource = Calendar.getDefaultCalendarSync()?.source;
  } catch {
    defaultSource = undefined;
  }

  const iCloudSource = sources.find(
    s =>
      s.name?.toLowerCase().includes("icloud") ||
      (s.type === SourceType.CALDAV && s.name?.toLowerCase().includes("icloud"))
  );
  const localSource = sources.find(s => s.type === SourceType.LOCAL);
  const chosenSource = iCloudSource ?? defaultSource ?? localSource ?? sources[0];

  if (!chosenSource) {
    return null;
  }

  const created = await Calendar.createCalendar({
    title: "Papillon +",
    color: "#00C851",
    entityType: EntityTypes.EVENT,
    sourceId: chosenSource.id,
    source: chosenSource,
    name: "papillon-plus",
    ownerAccount: chosenSource.name || "Papillon +",
  });

  return {
    id: created.id,
    title: created.title || "Papillon +",
    color: created.color,
    sourceName: created.source?.name || chosenSource.name || "iCloud",
    ownerAccount: created.ownerAccount,
    provider: classifyCalendarProvider(created as unknown as CalendarLike),
    isPrimary: created.isPrimary,
  };
}

export function buildCourseSyncKey(course: Course): string {
  const start = course.from instanceof Date ? course.from.getTime() : new Date(course.from).getTime();
  const end = course.to instanceof Date ? course.to.getTime() : new Date(course.to).getTime();
  return `${course.createdByAccount}:${start}:${end}:${(course.subject ?? "").trim().toLowerCase()}`;
}

export function shouldSyncCourse(course: Course, includeCanceled: boolean): boolean {
  if (!course || !course.createdByAccount) return false;
  if (course.createdByAccount.startsWith("ical_")) return false;
  if (course.type === CourseType.VACATION) return false;
  if (!includeCanceled && course.status === CourseStatus.CANCELED) return false;

  const startMs = course.from instanceof Date ? course.from.getTime() : new Date(course.from).getTime();
  const endMs = course.to instanceof Date ? course.to.getTime() : new Date(course.to).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return false;
  }

  return true;
}

function getCourseStatusLabel(course: Course): string | undefined {
  if (course.customStatus?.trim()) {
    return course.customStatus.trim();
  }
  switch (course.status) {
    case CourseStatus.CANCELED:
      return "Annulé";
    case CourseStatus.EDITED:
      return "Modifié";
    case CourseStatus.ONLINE:
      return "En ligne";
    case CourseStatus.EVALUATED:
      return "Évaluation";
    default:
      return undefined;
  }
}

export function formatCourseCalendarEvent(
  course: Course,
  options: CalendarFormatOptions
): FormattedCalendarEvent {
  let subjectName = course.subject?.trim() || "Cours";
  try {
    const resolved = getSubjectName(course.subject);
    if (resolved?.trim()) {
      subjectName = resolved.trim();
    }
  } catch {
    // Fallback to raw subject name
  }

  let emoji = "";
  if (options.includeEmoji) {
    try {
      emoji = getSubjectEmoji(course.subject)?.trim() || "";
    } catch {
      emoji = "";
    }
  }

  const isCanceled = course.status === CourseStatus.CANCELED;
  const prefix = isCanceled ? "[Annulé] " : "";
  const title = `${prefix}${emoji ? `${emoji} ` : ""}${subjectName}`;

  const location =
    options.includeDetails && course.room?.trim() ? course.room.trim() : undefined;

  const noteLines: string[] = [];
  if (options.includeDetails) {
    if (course.teacher?.trim()) {
      noteLines.push(`Professeur : ${course.teacher.trim()}`);
    }
    if (course.room?.trim()) {
      noteLines.push(`Salle : ${course.room.trim()}`);
    }
    if (course.group?.trim()) {
      noteLines.push(`Groupe : ${course.group.trim()}`);
    }
    const statusLabel = getCourseStatusLabel(course);
    if (statusLabel) {
      noteLines.push(`Statut : ${statusLabel}`);
    }
    if (course.additionalInfo?.trim()) {
      noteLines.push(`Infos : ${course.additionalInfo.trim()}`);
    }
  }
  noteLines.push("[Papillon+]");

  const startDate = course.from instanceof Date ? course.from : new Date(course.from);
  const endDate = course.to instanceof Date ? course.to : new Date(course.to);
  const notes = noteLines.join("\n");

  const hash = stableHashString(
    JSON.stringify({
      title,
      startMs: startDate.getTime(),
      endMs: endDate.getTime(),
      location: location ?? "",
      notes,
    })
  );

  return {
    title,
    startDate,
    endDate,
    location,
    notes,
    hash,
  };
}

export async function syncCoursesToCalendars(params: {
  courses: Course[];
  calendarIds: string[];
  windowStart: Date;
  windowEnd: Date;
  includeCanceled: boolean;
  includeEmoji: boolean;
  includeDetails: boolean;
}): Promise<CalendarSyncResult> {
  const {
    courses,
    calendarIds,
    windowStart,
    windowEnd,
    includeCanceled,
    includeEmoji,
    includeDetails,
  } = params;

  const result: CalendarSyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    calendarsSynced: 0,
    missingCalendarIds: [],
  };

  if (calendarIds.length === 0) {
    return result;
  }

  const desiredByKey = new Map<string, FormattedCalendarEvent>();
  for (const course of courses) {
    if (!shouldSyncCourse(course, includeCanceled)) continue;
    const key = buildCourseSyncKey(course);
    desiredByKey.set(key, formatCourseCalendarEvent(course, { includeEmoji, includeDetails }));
  }

  let deviceCalendars: ExpoCalendar[] = [];
  try {
    deviceCalendars = await Calendar.getCalendars(EntityTypes.EVENT);
  } catch {
    deviceCalendars = [];
  }
  const calendarById = new Map(deviceCalendars.map(c => [c.id, c]));

  const store = readSyncedStore();
  const winStartMs = windowStart.getTime();
  const winEndMs = windowEnd.getTime();

  for (const calendarId of calendarIds) {
    let targetCalendar: ExpoCalendar | undefined = calendarById.get(calendarId);
    if (!targetCalendar) {
      try {
        targetCalendar = await ExpoCalendar.get(calendarId);
      } catch {
        result.missingCalendarIds.push(calendarId);
        continue;
      }
    }

    if (!isCalendarWritable(targetCalendar as unknown as CalendarLike)) {
      result.missingCalendarIds.push(calendarId);
      continue;
    }

    result.calendarsSynced++;
    const calState: Record<string, TrackedEventRecord> = { ...(store[calendarId] ?? {}) };

    // Remove events within the synced window that no longer exist or were canceled
    for (const [syncKey, tracked] of Object.entries(calState)) {
      const overlapsWindow = tracked.endMs >= winStartMs && tracked.startMs <= winEndMs;
      if (!overlapsWindow || desiredByKey.has(syncKey)) continue;

      try {
        const existingEvent = await ExpoCalendarEvent.get(tracked.eventId);
        await existingEvent.delete();
      } catch {
        // Already deleted on device or unreachable
      }
      delete calState[syncKey];
      result.deleted++;
    }

    // Create or update desired events
    for (const [syncKey, payload] of desiredByKey.entries()) {
      const tracked = calState[syncKey];
      const startMs = payload.startDate.getTime();
      const endMs = payload.endDate.getTime();

      if (tracked && tracked.hash === payload.hash) {
        result.skipped++;
        continue;
      }

      const eventDetails = {
        title: payload.title,
        startDate: payload.startDate,
        endDate: payload.endDate,
        location: payload.location ?? "",
        notes: payload.notes ?? "",
      };

      if (tracked) {
        try {
          const existingEvent = await ExpoCalendarEvent.get(tracked.eventId);
          await existingEvent.update(eventDetails);
          calState[syncKey] = {
            eventId: tracked.eventId,
            hash: payload.hash,
            startMs,
            endMs,
          };
          result.updated++;
          continue;
        } catch {
          // Event was manually deleted on device: fall through and recreate
        }
      }

      try {
        const createdEvent = await targetCalendar.createEvent(eventDetails);
        calState[syncKey] = {
          eventId: createdEvent.id,
          hash: payload.hash,
          startMs,
          endMs,
        };
        result.created++;
      } catch {
        // Skip individual event failure without aborting remaining courses
      }
    }

    store[calendarId] = calState;
  }

  writeSyncedStore(store);
  return result;
}

export async function clearSyncedCalendarEvents(calendarIds?: string[]): Promise<number> {
  const store = readSyncedStore();
  const targetIds = calendarIds && calendarIds.length > 0 ? calendarIds : Object.keys(store);
  let deleted = 0;

  for (const calId of targetIds) {
    const entries = store[calId];
    if (!entries) continue;

    for (const tracked of Object.values(entries)) {
      try {
        const existingEvent = await ExpoCalendarEvent.get(tracked.eventId);
        await existingEvent.delete();
        deleted++;
      } catch {
        // Already removed from device calendar
      }
    }
    delete store[calId];
  }

  writeSyncedStore(store);
  return deleted;
}

export function getTrackedCalendarEventCount(calendarIds?: string[]): number {
  const store = readSyncedStore();
  const targetIds = calendarIds && calendarIds.length > 0 ? calendarIds : Object.keys(store);
  let count = 0;
  for (const calId of targetIds) {
    const entries = store[calId];
    if (entries) {
      count += Object.keys(entries).length;
    }
  }
  return count;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatIcsUtcDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

export function buildCoursesIcsString(
  courses: Course[],
  options: { includeCanceled: boolean; includeEmoji: boolean; includeDetails: boolean }
): string {
  const stamp = formatIcsUtcDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Papillon+//Emploi du temps//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Papillon +",
  ];

  const seen = new Set<string>();
  for (const course of courses) {
    if (!shouldSyncCourse(course, options.includeCanceled)) continue;
    const key = buildCourseSyncKey(course);
    if (seen.has(key)) continue;
    seen.add(key);

    const formatted = formatCourseCalendarEvent(course, {
      includeEmoji: options.includeEmoji,
      includeDetails: options.includeDetails,
    });

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:papillon-${stableHashString(key)}@getpapillon.xyz`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${formatIcsUtcDate(formatted.startDate)}`);
    lines.push(`DTEND:${formatIcsUtcDate(formatted.endDate)}`);
    lines.push(`SUMMARY:${escapeIcsText(formatted.title)}`);
    if (formatted.location) {
      lines.push(`LOCATION:${escapeIcsText(formatted.location)}`);
    }
    if (formatted.notes) {
      lines.push(`DESCRIPTION:${escapeIcsText(formatted.notes)}`);
    }
    if (course.status === CourseStatus.CANCELED) {
      lines.push("STATUS:CANCELLED");
    } else {
      lines.push("STATUS:CONFIRMED");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export async function exportCoursesToIcsFile(
  courses: Course[],
  options: { includeCanceled: boolean; includeEmoji: boolean; includeDetails: boolean }
): Promise<string> {
  const content = buildCoursesIcsString(courses, options);
  const file = new File(Paths.cache, "papillon-emploi-du-temps.ics");
  file.write(content);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/calendar",
      dialogTitle: "Exporter l'emploi du temps (.ics)",
      UTI: "public.calendar-event",
    });
  }

  return file.uri;
}
