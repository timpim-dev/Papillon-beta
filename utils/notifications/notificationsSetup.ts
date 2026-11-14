import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const HOMEWORK_CHANNEL_ID = "homework-reminders";
export const COMMUNICATIONS_CHANNEL_ID = "communications-alerts";
export const NEWS_SURVEYS_CHANNEL_ID = "news-surveys-alerts";
export const STUDY_CHANNEL_ID = "study-reminders";
export const FOCUS_CHANNEL_ID = "focus-timer";

let handlerInitialized = false;
let permissionPromptAttempted = false;

export function configureNotificationHandler(): void {
  if (handlerInitialized) {
    return;
  }
  handlerInitialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(HOMEWORK_CHANNEL_ID, {
    name: "Rappels de devoirs non terminés",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
  });

  await Notifications.setNotificationChannelAsync(COMMUNICATIONS_CHANNEL_ID, {
    name: "Messages & Discussions",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  });

  await Notifications.setNotificationChannelAsync(NEWS_SURVEYS_CHANNEL_ID, {
    name: "Infos & Sondages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  });

  await Notifications.setNotificationChannelAsync(STUDY_CHANNEL_ID, {
    name: "Rappels de révision IA",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
  });

  await Notifications.setNotificationChannelAsync(FOCUS_CHANNEL_ID, {
    name: "Minuteur Focus TDAH",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 100, 200],
  });
}

export async function getNotificationPermissionStatus(): Promise<boolean> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    return Boolean(perms.granted);
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureAndroidNotificationChannels();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  } catch {
    return false;
  }
}

/**
 * Ensures Android channels are registered and prompts at most once per app run
 * if notifications are enabled in settings and the OS allows asking.
 */
export async function ensureNotificationReadyIfEnabled(
  anyEnabled: boolean
): Promise<boolean> {
  if (!anyEnabled) return false;
  await ensureAndroidNotificationChannels();
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.granted) return true;
    if (!permissionPromptAttempted && perms.canAskAgain !== false) {
      permissionPromptAttempted = true;
      const requested = await Notifications.requestPermissionsAsync();
      return Boolean(requested.granted);
    }
  } catch {
    // Ignore permission probe failures
  }
  return false;
}
