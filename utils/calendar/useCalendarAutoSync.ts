import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { getDatabaseInstance } from "@/database/DatabaseProvider";
import { getDateRangeOfWeek, getWeekNumberFromDate } from "@/database/useHomework";
import { getCoursesFromCache } from "@/database/useTimetable";
import { getManager, subscribeManagerUpdate } from "@/services/shared";
import { Course } from "@/services/shared/timetable";
import { Capabilities } from "@/services/shared/types";
import { useAccountStore } from "@/stores/account";
import {
  resolveCalendarSyncConfig,
  useSettingsStore,
} from "@/stores/settings";
import { warn } from "@/utils/logger/logger";

import {
  buildCourseSyncKey,
  CalendarSyncResult,
  getCalendarPermissionStatus,
  syncCoursesToCalendars,
} from "./calendarSync";

const PASSIVE_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;

let syncInFlight: Promise<CalendarSyncResult | null> | null = null;
let lastCompletedSyncMs = 0;

function getActiveServiceIds(): Set<string> {
  const state = useAccountStore.getState();
  const active =
    state.accounts.find(a => a.id === state.lastUsedAccount) ??
    state.accounts[0];
  return new Set((active?.services ?? []).map(s => s.id).filter(Boolean));
}

export async function collectUpcomingCoursesForSync(
  weeksAhead: number,
  options: { fetchRemote?: boolean } = {}
): Promise<{ courses: Course[]; windowStart: Date; windowEnd: Date }> {
  const safeWeeks = Math.min(12, Math.max(1, Math.round(weeksAhead || 4)));
  const today = new Date();
  const weeksByYear = new Map<number, Set<number>>();
  const weekTargets: Array<{ week: number; date: Date }> = [];

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;

  for (let offset = 0; offset < safeWeeks; offset++) {
    const targetDate = new Date(today.getTime() + offset * 7 * 86_400_000);
    const week = getWeekNumberFromDate(targetDate);
    const year = targetDate.getFullYear();

    weekTargets.push({ week, date: targetDate });
    if (!weeksByYear.has(year)) {
      weeksByYear.set(year, new Set());
    }
    weeksByYear.get(year)!.add(week);

    const range = getDateRangeOfWeek(week, year);
    minStart = Math.min(minStart, range.start.getTime());
    maxEnd = Math.max(maxEnd, range.end.getTime());
  }

  if (options.fetchRemote) {
    const manager = getManager(true);
    if (manager?.hasReadyClients(Capabilities.TIMETABLE)) {
      // Sequential: Pronote numbers its session requests.
      for (const target of weekTargets) {
        try {
          await manager.getWeeklyTimetable(target.week, target.date);
        } catch {
          // Continue with remaining weeks and cached DB courses
        }
      }
    }
  }

  const activeServiceIds = getActiveServiceIds();
  const deduped = new Map<string, Course>();

  for (const [year, weekSet] of weeksByYear.entries()) {
    const days = await getCoursesFromCache(Array.from(weekSet), year);
    for (const day of days) {
      for (const course of day.courses) {
        if (course.createdByAccount.startsWith("ical_")) continue;
        if (activeServiceIds.size > 0 && !activeServiceIds.has(course.createdByAccount)) {
          continue;
        }
        deduped.set(buildCourseSyncKey(course), course);
      }
    }
  }

  return {
    courses: Array.from(deduped.values()),
    windowStart: new Date(Number.isFinite(minStart) ? minStart : today.getTime()),
    windowEnd: new Date(
      Number.isFinite(maxEnd) ? maxEnd : today.getTime() + safeWeeks * 7 * 86_400_000
    ),
  };
}

export function formatSyncSummary(result: CalendarSyncResult): string {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} ajouté(s)`);
  if (result.updated > 0) parts.push(`${result.updated} modifié(s)`);
  if (result.deleted > 0) parts.push(`${result.deleted} supprimé(s)`);

  if (parts.length === 0) {
    return result.skipped > 0
      ? `À jour (${result.skipped} cours vérifiés)`
      : "Aucun cours sur la période";
  }
  return parts.join(" • ");
}

export async function runCalendarSync(
  options: { fetchRemote?: boolean; force?: boolean } = {}
): Promise<CalendarSyncResult | null> {
  const settings = useSettingsStore.getState();
  const config = resolveCalendarSyncConfig(settings.personalization);

  if (!config.enabled || config.targetCalendarIds.length === 0) {
    return null;
  }

  if (!options.force && Date.now() - lastCompletedSyncMs < PASSIVE_SYNC_MIN_INTERVAL_MS) {
    return null;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      const permission = await getCalendarPermissionStatus();
      if (!permission.granted) {
        return null;
      }

      const { courses, windowStart, windowEnd } = await collectUpcomingCoursesForSync(
        config.weeksAhead,
        { fetchRemote: Boolean(options.fetchRemote) }
      );

      const result = await syncCoursesToCalendars({
        courses,
        calendarIds: config.targetCalendarIds,
        windowStart,
        windowEnd,
        includeCanceled: config.includeCanceled,
        includeEmoji: config.includeEmoji,
        includeDetails: config.includeDetails,
      });

      lastCompletedSyncMs = Date.now();
      const missingSet = new Set(result.missingCalendarIds);
      const nextTargetIds =
        missingSet.size > 0
          ? config.targetCalendarIds.filter(id => !missingSet.has(id))
          : config.targetCalendarIds;

      useSettingsStore.getState().mutateProperty("personalization", {
        calendarSync: {
          ...config,
          targetCalendarIds: nextTargetIds,
          lastSyncedAt: new Date().toISOString(),
          lastSyncSummary: formatSyncSummary(result),
        },
      });

      return result;
    } catch (error) {
      warn(`Calendar sync failed: ${String(error)}`, "calendarSync");
      return null;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export function useCalendarAutoSync(): void {
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);
  const personalization = useSettingsStore(state => state.personalization);
  const config = resolveCalendarSyncConfig(personalization);

  const calendarIdsKey = config.targetCalendarIds.join(",");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSync = (delayMs: number, force = false, fetchRemote = false) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void runCalendarSync({ force, fetchRemote });
    }, delayMs);
  };

  useEffect(() => {
    if (!config.enabled || !config.autoSync || !calendarIdsKey || !lastUsedAccount) {
      return;
    }

    scheduleSync(1200, true, false);

    let firstCourseEmit = true;
    let courseSub: { unsubscribe: () => void } | undefined;
    try {
      const db = getDatabaseInstance();
      courseSub = db
        .get("courses")
        .query()
        .observe()
        .subscribe(() => {
          if (firstCourseEmit) {
            firstCourseEmit = false;
            return;
          }
          scheduleSync(1500, true, false);
        });
    } catch {
      // Database not ready in unit test environments
    }

    const unsubManager = subscribeManagerUpdate(manager => {
      if (manager?.hasReadyClients(Capabilities.TIMETABLE)) {
        scheduleSync(2000, false, true);
      }
    });

    const appStateSub = AppState.addEventListener("change", nextState => {
      if (nextState === "active") {
        scheduleSync(1500, false, false);
      }
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      courseSub?.unsubscribe();
      unsubManager();
      appStateSub.remove();
    };
  }, [
    config.enabled,
    config.autoSync,
    calendarIdsKey,
    config.weeksAhead,
    config.includeCanceled,
    config.includeEmoji,
    config.includeDetails,
    lastUsedAccount,
  ]);
}
