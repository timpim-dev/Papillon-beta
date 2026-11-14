import { useEffect, useMemo, useRef, useState } from "react";

import { useGradesData } from "@/app/(tabs)/grades/hooks/useGradesData";
import { usePeriodsData } from "@/app/(tabs)/grades/hooks/usePeriodsData";
import { useTimetableWidgetData } from "@/app/(tabs)/index/hooks/useTimetableWidgetData";
import { getBalancesFromCache } from "@/database/useBalance";
import {
  getWeekNumberFromDate,
  useHomeworkForWeeks,
} from "@/database/useHomework";
import {
  androidWidgetsAreSupported,
  syncWidgetsSnapshot,
} from "@/modules/papillon-android-widgets";
import { getManager } from "@/services/shared";
import { Balance } from "@/services/shared/balance";
import { Capabilities } from "@/services/shared/types";
import { useAccountStore } from "@/stores/account";
import { Services } from "@/stores/account/types";
import { useSettingsStore } from "@/stores/settings";
import { getGradeDisplayScale } from "@/utils/grades/scale";
import { warn } from "@/utils/logger/logger";

import { buildAndroidWidgetsSnapshot } from "./androidWidgetsSnapshot";

const SYNC_DEBOUNCE_MS = 400;

const useAndroidSync = () => {
  const accounts = useAccountStore(state => state.accounts);
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);
  const account = useMemo(
    () => accounts.find(a => a.id === lastUsedAccount),
    [accounts, lastUsedAccount]
  );

  const gradesDisplayScale = useSettingsStore(
    state => state.personalization.gradesDisplayScale
  );
  const displayScale = getGradeDisplayScale(gradesDisplayScale);

  const { upcomingDays, loading: timetableLoading } = useTimetableWidgetData({
    showCancelled: true,
  });
  const { currentPeriod } = usePeriodsData();
  const { subjects, averages } = useGradesData(currentPeriod);

  const currentWeek = getWeekNumberFromDate(new Date());
  const weeks = useMemo(() => [currentWeek, currentWeek + 1], [currentWeek]);
  const homeworkByWeek = useHomeworkForWeeks(weeks);

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
        courses: allCourses,
        subjects,
        overallAverage: averages.student,
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
    allCourses,
    subjects,
    averages.student,
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
