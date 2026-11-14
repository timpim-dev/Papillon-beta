import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { Homework } from "@/services/shared/homework";
import { formatHTML } from "@/utils/format/html";
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
}

export interface DesiredHomeworkReminder {
  taskId: string;
  subject: string;
  body: string;
  triggerAtMs: number;
}

const MAX_LOOKAHEAD_DAYS = 14;
const MIN_FUTURE_LEAD_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes which incomplete upcoming homework items need a scheduled reminder.
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
  const deduped = new Map<string, DesiredHomeworkReminder>();

  for (const hw of homeworks) {
    if (!hw || hw.isDone) {
      continue;
    }
    const dueMs = hw.dueDate instanceof Date ? hw.dueDate.getTime() : new Date(hw.dueDate).getTime();
    if (!Number.isFinite(dueMs) || dueMs < nowMs - DAY_MS || dueMs > maxDueMs) {
      continue;
    }

    const triggerDate = new Date(dueMs);
    triggerDate.setDate(triggerDate.getDate() - Math.max(0, config.daysBefore));
    triggerDate.setHours(config.hour, config.minute, 0, 0);

    const triggerAtMs = triggerDate.getTime();
    if (triggerAtMs <= nowMs + MIN_FUTURE_LEAD_MS) {
      continue;
    }

    const subject = getSubjectName(hw.subject) || hw.subject || "Devoir";
    const plain = formatHTML(hw.content || "").replace(/\s+/g, " ").trim();
    const body = plain.length > 0 ? plain.slice(0, 120) : "Devoir à préparer";

    if (!deduped.has(hw.id)) {
      deduped.set(hw.id, {
        taskId: hw.id,
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
    item => item.content.data?.kind === "homework-reminder"
  );

  if (!config.enabled || !hasPermission) {
    for (const notif of homeworkNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
    return { scheduled: 0, cancelled: homeworkNotifications.length };
  }

  await ensureAndroidNotificationChannels();

  const desired = computeDesiredHomeworkReminders(homeworks, config);
  const desiredByTaskId = new Map(desired.map(item => [item.taskId, item]));
  const alreadyValid = new Set<string>();
  let cancelled = 0;

  for (const notif of homeworkNotifications) {
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
          route: `/(tabs)/tasks/${item.taskId}`,
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
