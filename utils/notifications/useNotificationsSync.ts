import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { getWeekNumberFromDate, useHomeworkForWeeks } from "@/database/useHomework";
import { getManager, subscribeManagerUpdate } from "@/services/shared";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";

import {
  detectAndNotifyNewChats,
} from "./communicationsNotifications";
import { syncHomeworkReminders } from "./homeworkReminders";
import {
  configureNotificationHandler,
  ensureNotificationReadyIfEnabled,
} from "./notificationsSetup";

const COMM_POLL_MIN_INTERVAL_MS = 2 * 60 * 1000;
const FOREGROUND_POLL_INTERVAL_MS = 5 * 60 * 1000;

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
  const weeks = useMemo(
    () => [currentWeek - 1, currentWeek, currentWeek + 1],
    [currentWeek]
  );
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
      dailyDigestEnabled: personalization.homeworkDailyDigestEnabled ?? true,
    }),
    [
      personalization.homeworkRemindersEnabled,
      personalization.homeworkReminderHour,
      personalization.homeworkReminderMinute,
      personalization.homeworkReminderDaysBefore,
      personalization.homeworkDailyDigestEnabled,
    ]
  );

  const commNotificationsEnabled =
    personalization.communicationNotificationsEnabled ?? true;

  const lastPollRef = useRef<number>(0);

  useEffect(() => {
    configureNotificationHandler();

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as
        | { route?: unknown; params?: Record<string, string> }
        | undefined;
      const route = data?.route;
      if (typeof route === "string" && route.startsWith("/")) {
        try {
          if (data?.params && typeof data.params === "object") {
            router.push({ pathname: route as never, params: data.params });
          } else {
            router.push(route as never);
          }
        } catch {
          // Ignore invalid routes during cold start
        }
      }
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    const anyEnabled = reminderConfig.enabled || commNotificationsEnabled;
    if (!account || !anyEnabled) {
      return;
    }
    void ensureNotificationReadyIfEnabled(anyEnabled);
  }, [account, reminderConfig.enabled, commNotificationsEnabled]);

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

    const checkMessagesAndNews = async () => {
      const now = Date.now();
      if (now - lastPollRef.current < COMM_POLL_MIN_INTERVAL_MS) {
        return;
      }
      const manager = getManager();
      if (!manager) {
        return;
      }
      lastPollRef.current = now;

      try {
        const chats = await manager.getChats();
        await detectAndNotifyNewChats(chats, commNotificationsEnabled);
      } catch {
        // Non-blocking background sync
      }
    };

    const unsubManager = subscribeManagerUpdate(() => {
      void checkMessagesAndNews();
    });
    const appStateSub = AppState.addEventListener("change", nextState => {
      if (nextState === "active") {
        void checkMessagesAndNews();
      }
    });

    const initialTimer = setTimeout(() => {
      void checkMessagesAndNews();
    }, 2500);
    const periodicTimer = setInterval(() => {
      void checkMessagesAndNews();
    }, FOREGROUND_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(periodicTimer);
      unsubManager();
      appStateSub.remove();
    };
  }, [account, commNotificationsEnabled]);
}
