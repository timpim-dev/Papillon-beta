import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const HOMEWORK_CHANNEL_ID = "homework-reminders";
export const COMMUNICATIONS_CHANNEL_ID = "communications-alerts";
export const STUDY_CHANNEL_ID = "study-reminders";

let handlerInitialized = false;

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
    name: "Rappels de devoirs",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 120, 200],
  });

  await Notifications.setNotificationChannelAsync(COMMUNICATIONS_CHANNEL_ID, {
    name: "Nouvelles communications",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  });

  await Notifications.setNotificationChannelAsync(STUDY_CHANNEL_ID, {
    name: "Rappels de révision IA",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
  });
}

export async function getNotificationPermissionStatus(): Promise<boolean> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    return perms.granted;
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
    return requested.granted;
  } catch {
    return false;
  }
}
