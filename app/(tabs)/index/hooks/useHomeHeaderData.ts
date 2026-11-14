import { useState, useEffect, useMemo, useRef } from 'react';
import { AccountManager, getManager, subscribeManagerUpdate } from '@/services/shared';
import { Attendance } from '@/services/shared/attendance';
import { Period } from '@/services/shared/grade';
import { getCurrentPeriod } from '@/utils/grades/helper/period';
import { useAccountStore } from '@/stores/account';
import { Services } from '@/stores/account/types';
import { useNews } from '@/database/useNews';
import { getCanteenMenuFromCache } from '@/database/useCanteen';
import { CanteenMenu } from '@/services/shared/canteen';

export const useHomeHeaderData = () => {
  const accounts = useAccountStore((state) => state.accounts);
  const lastUsedAccount = useAccountStore((state) => state.lastUsedAccount);
  const account = accounts.find((a) => a.id === lastUsedAccount);

  const availableCanteenCards = useMemo(
    () =>
      account?.services.filter(service =>
        [
          Services.TURBOSELF,
          Services.ALISE,
          Services.ARD,
          Services.ECOLEDIRECTE,
          Services.IZLY,
        ].includes(service.serviceId)
      ) ?? [],
    [account]
  );

  const attendancesPeriodsRef = useRef<Period[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [weeklyMenus, setWeeklyMenus] = useState<CanteenMenu[]>([]);
  const news = useNews();

  const absencesCount = useMemo(() => {
    if (!attendances) return 0;
    let count = 0;
    attendances.forEach(att => {
      if(att && "absences" in att) {
        if (att.absences) count += att.absences.length;
      }
    });
    return count;
  }, [attendances]);

  useEffect(() => {
    const updateAttendance = async (manager: AccountManager) => {
      const periods = await manager.getAttendancePeriods();
      attendancesPeriodsRef.current = periods;

      const currentPeriod = getCurrentPeriod(periods);
      if (!currentPeriod) {
        setAttendances([]);
        return;
      }

      const fetchedAttendances = await manager.getAttendanceForPeriod(currentPeriod.name);

      setAttendances(fetchedAttendances);
    };

    const updateMenus = async (manager: AccountManager) => {
      try {
        const now = new Date();
        const cached = await getCanteenMenuFromCache(now);
        if (cached.length > 0) {
          setWeeklyMenus(cached);
        }
        const fetched = await manager.getWeeklyCanteenMenu(now);
        if (fetched.length > 0) {
          setWeeklyMenus(fetched);
        }
      } catch {
        // Not all services support canteen menus
      }
    };

    const unsubscribe = subscribeManagerUpdate((_) => {
      const manager = getManager();
      updateAttendance(manager);
      void updateMenus(manager);
    });

    return () => unsubscribe();
  }, []);

  const todayMenuMainDish = useMemo(() => {
    const now = new Date();
    const todayMenu = weeklyMenus.find(menu => {
      const d = new Date(menu.date);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    });
    const dish =
      todayMenu?.lunch?.main?.[0]?.name ||
      todayMenu?.lunch?.entry?.[0]?.name ||
      todayMenu?.dinner?.main?.[0]?.name;
    return dish || undefined;
  }, [weeklyMenus]);

  return {
    availableCanteenCards,
    attendancesPeriods: attendancesPeriodsRef.current,
    attendances,
    absencesCount,
    todayMenuMainDish,
    news
  };
};
