import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { Homework } from "@/services/shared/homework";
import { formatHTML } from "@/utils/format/html";
import { generateId } from "@/utils/generateId";
import { getSubjectName } from "@/utils/subjects/name";

import {
  configureNotificationHandler,
  ensureAndroidNotificationChannels,
  getNotificationPermissionStatus,
  HOMEWORK_CHANNEL_ID,
  STUDY_CHANNEL_ID,
} from "./notificationsSetup";

export interface HomeworkReminderConfig {
  enabled: boolean;
  hour: number;
  minute: number;
  daysBefore: number;
  dailyDigestEnabled?: boolean;
}

export interface DesiredHomeworkReminder {
  taskId: string;
  routeId: string;
  subject: string;
  body: string;
  triggerAtMs: number;
}

export interface DesiredHomeworkDigest {
  triggerAtMs: number;
  undoneCount: number;
  title: string;
  body: string;
}

const MAX_LOOKAHEAD_DAYS = 14;
const MIN_FUTURE_LEAD_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function computeTaskRouteId(hw: Homework): string {
  const due = hw.dueDate instanceof Date ? hw.dueDate : new Date(hw.dueDate);
  return generateId(hw.subject + hw.content + hw.createdByAccount + due.toDateString());
}

/**
 * Computes which incomplete upcoming homework items need a scheduled reminder,
 * including a smart morning fallback when a task due tomorrow was synced past
 * the configured evening reminder hour.
 */
export function computeDesiredHomeworkReminders(
  homeworks: Homework[],
  config: HomeworkReminderConfig,
  nowMs = Date.now()
): DesiredHomeworkReminder[] {
  if (!config.enabled) {
    return [];
  }

  const maxDueMs = nowMs + MAX_LOOKAHEAD_DAYS * DAY_MS;
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const deduped = new Map<string, DesiredHomeworkReminder>();

  for (const hw of homeworks) {
    if (!hw || hw.isDone) {
      continue;
    }
    const dueMs =
      hw.dueDate instanceof Date ? hw.dueDate.getTime() : new Date(hw.dueDate).getTime();
    if (!Number.isFinite(dueMs) || dueMs < startOfTodayMs || dueMs > maxDueMs) {
      continue;
    }

    const triggerDate = new Date(dueMs);
    triggerDate.setDate(triggerDate.getDate() - Math.max(0, config.daysBefore));
    triggerDate.setHours(config.hour, config.minute, 0, 0);

    let triggerAtMs = triggerDate.getTime();
    if (triggerAtMs <= nowMs + MIN_FUTURE_LEAD_MS) {
      // Fallback: if due within 48h and primary window passed, catch up at 07:45 on due day.
      const morningCatchUp = new Date(dueMs);
      morningCatchUp.setHours(7, 45, 0, 0);
      if (
        dueMs <= startOfTodayMs + 2 * DAY_MS &&
        morningCatchUp.getTime() > nowMs + MIN_FUTURE_LEAD_MS
      ) {
        triggerAtMs = morningCatchUp.getTime();
      } else {
        continue;
      }
    }

    const subject = getSubjectName(hw.subject) || hw.subject || "Devoir";
    const plain = formatHTML(hw.content || "").replace(/\s+/g, " ").trim();
    const body = plain.length > 0 ? plain.slice(0, 120) : "Devoir à préparer";
    const routeId = computeTaskRouteId(hw);

    if (!deduped.has(hw.id)) {
      deduped.set(hw.id, {
        taskId: hw.id,
        routeId,
        subject,
        body,
        triggerAtMs,
      });
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => a.triggerAtMs - b.triggerAtMs)
    .slice(0, 40);
}

/**
 * Computes a single daily summary nudge when upcoming undone tasks remain in
 * the next 48 hours so ADHD students get one clear overview without notification fatigue.
 */
export function computeDailyUndoneDigest(
  homeworks: Homework[],
  config: HomeworkReminderConfig,
  nowMs = Date.now()
): DesiredHomeworkDigest | null {
  if (!config.enabled || config.dailyDigestEnabled === false) {
    return null;
  }

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const cutoffMs = startOfTodayMs + 3 * DAY_MS;

  const targetTrigger = new Date(nowMs);
  targetTrigger.setHours(config.hour, config.minute, 0, 0);
  if (targetTrigger.getTime() <= nowMs + MIN_FUTURE_LEAD_MS) {
    targetTrigger.setDate(targetTrigger.getDate() + 1);
  }

  const upcomingUndone = homeworks.filter(hw => {
    if (!hw || hw.isDone) return false;
    const dueMs =
      hw.dueDate instanceof Date ? hw.dueDate.getTime() : new Date(hw.dueDate).getTime();
    return Number.isFinite(dueMs) && dueMs >= startOfTodayMs && dueMs <= cutoffMs;
  });

  if (upcomingUndone.length === 0) {
    return null;
  }

  const subjects = Array.from(
    new Set(upcomingUndone.map(hw => getSubjectName(hw.subject) || hw.subject || "Devoir"))
  );
  const count = upcomingUndone.length;
  const title =
    count === 1
      ? "⏰ 1 devoir non terminé bientôt dû"
      : `⏰ ${count} devoirs non terminés à venir`;
  const listed = subjects.slice(0, 3).join(", ");
  const extra = subjects.length > 3 ? ` (+${subjects.length - 3})` : "";
  const body = `Prends 5 min pour commencer : ${listed}${extra}`;

  return {
    triggerAtMs: targetTrigger.getTime(),
    undoneCount: count,
    title,
    body,
  };
}

/**
 * Reconciles scheduled local notifications against current homework state.
 * Completed or disabled tasks have their scheduled notifications cancelled automatically.
 */
export async function syncHomeworkReminders(
  homeworks: Homework[],
  config: HomeworkReminderConfig
): Promise<{ scheduled: number; cancelled: number }> {
  configureNotificationHandler();

  const hasPermission = await getNotificationPermissionStatus();
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const homeworkNotifications = existing.filter(
    item =>
      item.content.data?.kind === "homework-reminder" ||
      item.content.data?.kind === "homework-digest"
  );

  if (!config.enabled || !hasPermission) {
    for (const notif of homeworkNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
    return { scheduled: 0, cancelled: homeworkNotifications.length };
  }

  await ensureAndroidNotificationChannels();

  const perTaskNotifs = homeworkNotifications.filter(
    item => item.content.data?.kind === "homework-reminder"
  );
  const digestNotifs = homeworkNotifications.filter(
    item => item.content.data?.kind === "homework-digest"
  );

  const desired = computeDesiredHomeworkReminders(homeworks, config);
  const desiredByTaskId = new Map(desired.map(item => [item.taskId, item]));
  const alreadyValid = new Set<string>();
  let cancelled = 0;

  for (const notif of perTaskNotifs) {
    const taskId = String(notif.content.data?.taskId ?? "");
    const existingTriggerMs = Number(notif.content.data?.triggerAtMs ?? 0);
    const target = desiredByTaskId.get(taskId);

    if (!target || Math.abs(target.triggerAtMs - existingTriggerMs) > 60_000) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      cancelled += 1;
    } else {
      alreadyValid.add(taskId);
    }
  }

  let scheduled = 0;
  for (const item of desired) {
    if (alreadyValid.has(item.taskId)) {
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📝 Devoir en ${item.subject}`,
        body: item.body,
        data: {
          kind: "homework-reminder",
          taskId: item.taskId,
          triggerAtMs: item.triggerAtMs,
          route: `/(tabs)/tasks/${item.routeId}`,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(item.triggerAtMs),
        ...(Platform.OS === "android" ? { channelId: HOMEWORK_CHANNEL_ID } : {}),
      },
    });
    scheduled += 1;
  }

  // Reconcile the single daily undone-tasks digest notification.
  const desiredDigest = computeDailyUndoneDigest(homeworks, config);
  let hasValidDigest = false;

  for (const notif of digestNotifs) {
    const existingTriggerMs = Number(notif.content.data?.triggerAtMs ?? 0);
    const existingCount = Number(notif.content.data?.undoneCount ?? -1);
    if (
      !desiredDigest ||
      hasValidDigest ||
      Math.abs(desiredDigest.triggerAtMs - existingTriggerMs) > 60_000 ||
      desiredDigest.undoneCount !== existingCount
    ) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      cancelled += 1;
    } else {
      hasValidDigest = true;
    }
  }

  if (desiredDigest && !hasValidDigest) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: desiredDigest.title,
        body: desiredDigest.body,
        data: {
          kind: "homework-digest",
          undoneCount: desiredDigest.undoneCount,
          triggerAtMs: desiredDigest.triggerAtMs,
          route: "/(tabs)/tasks",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(desiredDigest.triggerAtMs),
        ...(Platform.OS === "android" ? { channelId: HOMEWORK_CHANNEL_ID } : {}),
      },
    });
    scheduled += 1;
  }

  return { scheduled, cancelled };
}

export async function cancelHomeworkReminder(taskId: string): Promise<void> {
  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of existing) {
      if (
        notif.content.data?.kind === "homework-reminder" &&
        String(notif.content.data?.taskId ?? "") === taskId
      ) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch {
    // Best-effort cancellation
  }
}

export async function scheduleStudyReminder(params: {
  title: string;
  body: string;
  triggerDate: Date;
}): Promise<string | null> {
  configureNotificationHandler();
  const hasPermission = await getNotificationPermissionStatus();
  if (!hasPermission) {
    return null;
  }
  await ensureAndroidNotificationChannels();

  return await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      data: {
        kind: "study-reminder",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: params.triggerDate,
      ...(Platform.OS === "android" ? { channelId: STUDY_CHANNEL_ID } : {}),
    },
  });
}
