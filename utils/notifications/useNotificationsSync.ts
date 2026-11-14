import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { getWeekNumberFromDate, useHomeworkForWeeks } from "@/database/useHomework";
import { getManager, subscribeManagerUpdate } from "@/services/shared";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";

import { detectAndNotifyNewChats } from "./communicationsNotifications";
import { syncHomeworkReminders } from "./homeworkReminders";
import { configureNotificationHandler } from "./notificationsSetup";

const CHAT_POLL_MIN_INTERVAL_MS = 3 * 60 * 1000;

export function useNotificationsSync(): void {
  const router = useRouter();
  const personalization = useSettingsStore(state => state.personalization);
  const accounts = useAccountStore(state => state.accounts);
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);

  const account = useMemo(
    () => accounts.find(a => a.id === lastUsedAccount),
    [accounts, lastUsedAccount]
  );
  const serviceIds = useMemo(
    () => (account ? account.services.map(service => service.id) : []),
    [account]
  );

  const currentWeek = getWeekNumberFromDate(new Date());
  const weeks = useMemo(() => [currentWeek, currentWeek + 1], [currentWeek]);
  const homeworkByWeek = useHomeworkForWeeks(weeks);

  const accountTasks = useMemo(() => {
    const all = weeks.flatMap(week => homeworkByWeek[week] ?? []);
    return all.filter(task =>
      task.custom
        ? task.createdByAccount === account?.id
        : serviceIds.includes(task.createdByAccount)
    );
  }, [weeks, homeworkByWeek, account?.id, serviceIds]);

  const reminderConfig = useMemo(
    () => ({
      enabled: personalization.homeworkRemindersEnabled ?? true,
      hour: personalization.homeworkReminderHour ?? 18,
      minute: personalization.homeworkReminderMinute ?? 30,
      daysBefore: personalization.homeworkReminderDaysBefore ?? 1,
    }),
    [
      personalization.homeworkRemindersEnabled,
      personalization.homeworkReminderHour,
      personalization.homeworkReminderMinute,
      personalization.homeworkReminderDaysBefore,
    ]
  );

  const commNotificationsEnabled =
    personalization.communicationNotificationsEnabled ?? true;

  const lastChatCheckRef = useRef<number>(0);

  useEffect(() => {
    configureNotificationHandler();

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === "string" && route.startsWith("/")) {
        try {
          router.push(route as never);
        } catch {
          // Ignore invalid routes during cold start
        }
      }
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!account) {
      return;
    }
    const timer = setTimeout(() => {
      syncHomeworkReminders(accountTasks, reminderConfig).catch(() => {});
    }, 600);

    return () => clearTimeout(timer);
  }, [account, accountTasks, reminderConfig]);

  useEffect(() => {
    if (!account) {
      return;
    }

    const checkChats = async () => {
      const now = Date.now();
      if (now - lastChatCheckRef.current < CHAT_POLL_MIN_INTERVAL_MS) {
        return;
      }
      const manager = getManager();
      if (!manager) {
        return;
      }
      lastChatCheckRef.current = now;
      try {
        const chats = await manager.getChats();
        await detectAndNotifyNewChats(chats, commNotificationsEnabled);
      } catch {
        // Non-blocking background sync
      }
    };

    const unsubManager = subscribeManagerUpdate(() => {
      void checkChats();
    });
    const appStateSub = AppState.addEventListener("change", nextState => {
      if (nextState === "active") {
        void checkChats();
      }
    });

    const initialTimer = setTimeout(() => {
      void checkChats();
    }, 2500);

    return () => {
      clearTimeout(initialTimer);
      unsubManager();
      appStateSub.remove();
    };
  }, [account, commNotificationsEnabled]);
}
