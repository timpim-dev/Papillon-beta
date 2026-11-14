import { useTheme } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { useGradesData } from "@/app/(tabs)/grades/hooks/useGradesData";
import { usePeriodsData } from "@/app/(tabs)/grades/hooks/usePeriodsData";
import { useTimetableWidgetData } from "@/app/(tabs)/index/hooks/useTimetableWidgetData";
import { getBalancesFromCache } from "@/database/useBalance";
import {
  getHomeworkById,
  getWeekNumberFromDate,
  updateHomeworkIsDone,
  useHomeworkForWeeks,
} from "@/database/useHomework";
import {
  androidWidgetsAreSupported,
  consumePendingWearTaskToggles,
  reloadWidgets,
  syncWidgetsSnapshot,
} from "@/modules/papillon-android-widgets";
import { getManager } from "@/services/shared";
import { Balance } from "@/services/shared/balance";
import { Capabilities } from "@/services/shared/types";
import { useAccountStore } from "@/stores/account";
import { Services } from "@/stores/account/types";
import {
  DEFAULT_MATERIAL_YOU_ENABLED,
  resolveWearConfig,
  useSettingsStore,
} from "@/stores/settings";
import { AppColors } from "@/utils/colors";
import { getGradeDisplayScale } from "@/utils/grades/scale";
import { isGradient, useAccountWallpaper } from "@/utils/gradientWallpaper";
import { warn } from "@/utils/logger/logger";
import { cancelHomeworkReminder } from "@/utils/notifications/homeworkReminders";

import { buildAndroidWidgetsSnapshot } from "./androidWidgetsSnapshot";

const SYNC_DEBOUNCE_MS = 400;
const WEAR_TOGGLE_POLL_MS = 3000;

const useAndroidSync = () => {
  const theme = useTheme();
  const { wallpaper, wallpaperGradient } = useAccountWallpaper();
  const accounts = useAccountStore(state => state.accounts);
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);
  const account = useMemo(
    () => accounts.find(a => a.id === lastUsedAccount),
    [accounts, lastUsedAccount]
  );

  const personalization = useSettingsStore(state => state.personalization);
  const gradesDisplayScale = personalization.gradesDisplayScale;
  const displayScale = getGradeDisplayScale(gradesDisplayScale);
  const wearConfig = useMemo(
    () => resolveWearConfig(personalization),
    [personalization]
  );
  const activeThemeColor = useMemo(() => {
    const selectedColor =
      AppColors.find(c => c.colorEnum === personalization.colorSelected) ??
      AppColors[0];
    const useMaterialYou =
      personalization.useMaterialYou ?? DEFAULT_MATERIAL_YOU_ENABLED;
    if (useMaterialYou) {
      const themeColors = theme.colors as typeof theme.colors & {
        tint?: unknown;
      };
      if (typeof themeColors.tint === "string" && themeColors.tint.length > 0) {
        return themeColors.tint;
      }
      if (
        typeof theme.colors.primary === "string" &&
        theme.colors.primary.length > 0
      ) {
        return theme.colors.primary;
      }
    }
    return selectedColor.mainColor;
  }, [
    personalization.colorSelected,
    personalization.useMaterialYou,
    theme.colors,
  ]);
  const gradientColors = useMemo(() => {
    if (isGradient(wallpaper) && wallpaperGradient?.colors?.length) {
      return wallpaperGradient.colors;
    }
    return [activeThemeColor];
  }, [activeThemeColor, wallpaper, wallpaperGradient?.colors]);

  const { upcomingDays, loading: timetableLoading } = useTimetableWidgetData({
    showCancelled: true,
  });
  const { currentPeriod } = usePeriodsData();
  const { subjects, averages, history } = useGradesData(currentPeriod);

  const currentWeek = getWeekNumberFromDate(new Date());
  const weeks = useMemo(() => [currentWeek, currentWeek + 1], [currentWeek]);
  const [homeworkRefreshTick, setHomeworkRefreshTick] = useState(0);
  const homeworkByWeek = useHomeworkForWeeks(weeks, homeworkRefreshTick);

  const [balances, setBalances] = useState<Balance[]>([]);
  const [qrCodesByServiceId, setQrCodesByServiceId] = useState<
    Record<string, string | null>
  >({});
  const lastPayloadHashRef = useRef<string>("");

  const serviceIds = useMemo(
    () => account?.services?.map(service => service.id) ?? [],
    [account?.services]
  );

  const serviceTypesByServiceId = useMemo(() => {
    const map: Record<string, Services> = {};
    for (const service of account?.services ?? []) {
      map[service.id] = service.serviceId;
    }
    return map;
  }, [account?.services]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cachedBalances = await getBalancesFromCache();
        if (cancelled) {
          return;
        }
        const accountBalances = cachedBalances.filter(b =>
          serviceIds.includes(b.createdByAccount)
        );
        setBalances(accountBalances);

        const manager = getManager();
        if (!manager || accountBalances.length === 0) {
          return;
        }

        const nextQrs: Record<string, string | null> = {};
        for (const balance of accountBalances) {
          const canFetchQr = manager.clientHasCapatibility?.(
            Capabilities.CANTEEN_QRCODE,
            balance.createdByAccount
          );
          if (!canFetchQr) {
            continue;
          }
          try {
            const qrResult = await manager.getCanteenQRCodes(
              balance.createdByAccount
            );
            nextQrs[balance.createdByAccount] = qrResult?.data ?? null;
          } catch {
            // Keep previously cached or null QR when offline
          }
        }
        if (!cancelled && Object.keys(nextQrs).length > 0) {
          setQrCodesByServiceId(prev => ({ ...prev, ...nextQrs }));
        }
      } catch (error) {
        warn(
          `Android widget balance load failed: ${String(error)}`,
          "useAndroidWidgetsSync"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceIds]);

  const allCourses = useMemo(
    () => upcomingDays.flatMap(day => day.courses),
    [upcomingDays]
  );

  const accountTasks = useMemo(() => {
    const all = weeks.flatMap(week => homeworkByWeek[week] ?? []);
    return all.filter(task =>
      task.custom
        ? task.createdByAccount === account?.id
        : serviceIds.includes(task.createdByAccount)
    );
  }, [weeks, homeworkByWeek, account?.id, serviceIds]);

  const processWearTaskToggles = useCallback(async () => {
    try {
      const toggles = await consumePendingWearTaskToggles();
      if (!toggles || toggles.length === 0) {
        return;
      }
      const manager = getManager();
      let updatedAny = false;
      for (const toggle of toggles) {
        const task =
          accountTasks.find(item => item.id === toggle.id) ??
          (await getHomeworkById(toggle.id));
        if (task && !task.custom) {
          try {
            await manager?.setHomeworkCompletion(task, toggle.isDone);
          } catch (error) {
            warn(
              `Unable to push watch task completion to school service: ${String(error)}`,
              "useAndroidWidgetsSync"
            );
          }
        }
        await updateHomeworkIsDone(toggle.id, toggle.isDone);
        if (toggle.isDone) {
          void cancelHomeworkReminder(toggle.id);
        }
        updatedAny = true;
      }
      if (updatedAny) {
        lastPayloadHashRef.current = "";
        setHomeworkRefreshTick(prev => prev + 1);
      }
    } catch (error) {
      warn(
        `Failed to process pending watch task toggles: ${String(error)}`,
        "useAndroidWidgetsSync"
      );
    }
  }, [accountTasks]);

  useEffect(() => {
    reloadWidgets().catch(() => {});
    processWearTaskToggles();
    const interval = setInterval(processWearTaskToggles, WEAR_TOGGLE_POLL_MS);
    const sub = AppState.addEventListener("change", nextState => {
      if (nextState === "active") {
        reloadWidgets().catch(() => {});
        processWearTaskToggles();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [processWearTaskToggles]);

  useEffect(() => {
    if (timetableLoading || !account) {
      return;
    }

    const timer = setTimeout(() => {
      const accountName =
        [account.firstName, account.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || null;
      const snapshot = buildAndroidWidgetsSnapshot({
        accountName,
        themeColor: activeThemeColor,
        wallpaperGradientColors: gradientColors,
        wearConfig,
        equippedBadge: null,
        courses: allCourses,
        subjects,
        overallAverage: averages.student,
        averageHistoryPoints: history?.subject,
        displayScale,
        tasks: accountTasks,
        balances,
        qrCodesByServiceId,
        serviceTypesByServiceId,
      });

      const comparable = JSON.stringify({ ...snapshot, updatedAt: 0 });
      if (comparable === lastPayloadHashRef.current) {
        return;
      }
      lastPayloadHashRef.current = comparable;

      syncWidgetsSnapshot(snapshot).catch(error => {
        warn(
          `Android widgets sync failed: ${String(error)}`,
          "useAndroidWidgetsSync"
        );
      });
    }, SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    timetableLoading,
    account,
    activeThemeColor,
    gradientColors,
    wearConfig,
    allCourses,
    subjects,
    averages.student,
    history?.subject,
    displayScale,
    accountTasks,
    balances,
    qrCodesByServiceId,
    serviceTypesByServiceId,
  ]);
};

export const useAndroidWidgetsSync = androidWidgetsAreSupported
  ? useAndroidSync
  : () => undefined;
