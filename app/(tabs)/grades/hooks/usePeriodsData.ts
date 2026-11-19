import { useCallback, useEffect, useRef, useState } from "react";

import { useManagerSubscription } from "@/hooks/useManagerSubscription";
import { allowAllAuthRetries } from "@/services/auth/coordinator";
import type { AccountManager } from "@/services/shared";
import { getManager, initializeAccountManager } from "@/services/shared";
import { Period } from "@/services/shared/grade";
import { Capabilities, ServiceFailure } from "@/services/shared/types";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import { getCurrentPeriod } from "@/utils/grades/helper/period";
import { warn } from "@/utils/logger/logger";

export interface UsePeriodsDataResult {
  /** All periods available for the account, "Trimestre"/"Semestre" first, chronological. */
  periods: Period[];
  /** The selected period. Defaults to whatever is "now", or the last period the user picked. */
  currentPeriod: Period | undefined;
  /** Select a period. Persisted so it's restored the next time this hook is used. */
  setCurrentPeriod: (period: Period) => void;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  failures: ServiceFailure[];
  refresh: () => Promise<void>;
}

/** "Trimestre"/"Semestre" periods first (chronologically), everything else (mock exams,
 * whole year, ...) pushed to the end. */
const sortPeriods = (periods: Period[]): Period[] =>
  [...periods].sort((a, b) => {
    const isAKey = a.name.startsWith("Semestre") || a.name.startsWith("Trimestre");
    const isBKey = b.name.startsWith("Semestre") || b.name.startsWith("Trimestre");

    if (isAKey && !isBKey) { return -1; }
    if (!isAKey && isBKey) { return 1; }

    return a.start.getTime() - b.start.getTime();
  });

/**
 * Fetches and exposes every grade period for the current account, along with a
 * currently-selected period (remembered across sessions).
 *
 * Pair with `useGradesData(currentPeriod)` to get the grades for that period.
 */
export function usePeriodsData(): UsePeriodsDataResult {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [currentPeriod, setCurrentPeriodState] = useState<Period | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [failures, setFailures] = useState<ServiceFailure[]>([]);

  const savedPeriodName = useSettingsStore(state => state.personalization.gradesPeriodName);
  const mutateSettings = useSettingsStore(state => state.mutateProperty);
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);

  // Avoids re-applying the saved period every time the periods list is refreshed
  // once the user has actively picked one for this session.
  const hasUserSelection = useRef(false);
  const retriedAuthRef = useRef(false);

  useEffect(() => {
    hasUserSelection.current = false;
    retriedAuthRef.current = false;
    setPeriods([]);
    setCurrentPeriodState(undefined);
    setError(null);
    setFailures([]);
  }, [lastUsedAccount]);

  const applyPeriods = useCallback(
    (rawPeriods: Period[]) => {
      const dedupedByName = new Map<string, Period>();
      for (const period of rawPeriods) {
        const key = `${period.name.trim()}::${period.createdByAccount}`;
        const existing = dedupedByName.get(key);
        if (!existing || (existing.fromCache && !period.fromCache)) {
          dedupedByName.set(key, period);
        }
      }
      const sorted = sortPeriods(Array.from(dedupedByName.values()));
      setPeriods(sorted);

      setCurrentPeriodState(prev => {
        // Match by both id AND name so cached DB period seamlessly promotes to live period.
        if (prev) {
          const stillThere =
            sorted.find(p => p.id === prev.id && p.createdByAccount === prev.createdByAccount) ??
            sorted.find(p => p.name.trim() === prev.name.trim() && p.createdByAccount === prev.createdByAccount) ??
            sorted.find(p => p.id === prev.id || p.name.trim() === prev.name.trim());
          if (stillThere) { return stillThere; }
        }

        if (!hasUserSelection.current && savedPeriodName) {
          const saved = sorted.find(p => p.name.trim() === savedPeriodName.trim());
          if (saved) { return saved; }
        }

        return sorted.length > 0 ? getCurrentPeriod(sorted) : undefined;
      });
    },
    [savedPeriodName]
  );

  const fetchPeriods = useCallback(async (managerToUse: AccountManager, isRefresh = false) => {
    if (isRefresh) { setRefreshing(true); } else { setLoading(true); }
    setError(null);
    setFailures([]);

    try {
      let activeManager = managerToUse;
      if (isRefresh && !activeManager.hasReadyClients(Capabilities.GRADES)) {
        allowAllAuthRetries();
        activeManager = await initializeAccountManager(undefined, { force: true }).catch(() => activeManager);
      }

      let result = await activeManager.getGradesPeriods();
      const currentFailures = activeManager.getFailures(Capabilities.GRADES);

      if (result.length === 0 && currentFailures.length > 0 && !retriedAuthRef.current) {
        retriedAuthRef.current = true;
        allowAllAuthRetries();
        activeManager = await initializeAccountManager(undefined, { force: true }).catch(() => activeManager);
        result = await activeManager.getGradesPeriods();
      }

      setFailures(activeManager.getFailures(Capabilities.GRADES));
      applyPeriods(result);
    } catch (e) {
      warn(String(e), "usePeriodsData");
      setFailures(managerToUse.getFailures(Capabilities.GRADES));
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyPeriods]);

  const handleManager = useCallback((manager: AccountManager) => {
    fetchPeriods(manager);
  }, [fetchPeriods]);

  // Nothing else ever ends the load if no manager turns up, so the spinner
  // would stay on screen indefinitely.
  const handleManagerUnavailable = useCallback(() => {
    setLoading(false);
    setRefreshing(false);
    setError(new Error("Account manager unavailable"));
  }, []);

  useManagerSubscription(handleManager, handleManagerUnavailable);

  const setCurrentPeriod = useCallback((period: Period) => {
    hasUserSelection.current = true;
    setCurrentPeriodState(period);

    if (period.name && period.name !== savedPeriodName) {
      mutateSettings("personalization", { gradesPeriodName: period.name });
    }
  }, [mutateSettings, savedPeriodName]);

  const refresh = useCallback(async () => {
    const manager = getManager();
    if (!manager) {
      // A pull-to-refresh has to end in something the user can see.
      setRefreshing(false);
      setError(new Error("Account manager unavailable"));
      return;
    }
    await fetchPeriods(manager, true);
  }, [fetchPeriods]);

  return {
    periods,
    currentPeriod,
    setCurrentPeriod,
    loading,
    refreshing,
    error,
    failures,
    refresh,
  };
}
