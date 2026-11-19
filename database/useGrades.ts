import { Model, Q } from "@nozbe/watermelondb";
import { createMMKV, type MMKV } from "react-native-mmkv";

import { Grade as SharedGrade, Period as SharedPeriod, PeriodGrades as SharedPeriodGrades } from "@/services/shared/grade";
import { useAccountStore } from "@/stores/account";
import { generateId } from "@/utils/generateId";
import { warn } from "@/utils/logger/logger";

import { getDatabaseInstance } from "./DatabaseProvider";
import { mapPeriodToShared } from "./mappers/grade";
import { Grade, Period, PeriodGrades } from "./models/Grades";
import Subject from "./models/Subject";
import { safeWrite } from "./utils/safeTransaction";

function getActiveServiceIdsFromStore(): string[] {
  const state = useAccountStore.getState();
  const active =
    state.accounts.find(acc => acc.id === state.lastUsedAccount) ??
    state.accounts[0];
  return (active?.services ?? []).map(service => service.id).filter(Boolean);
}

export async function addPeriodsToDatabase(periods: SharedPeriod[]) {
  if (!periods || periods.length === 0) return;
  const db = getDatabaseInstance();

  const incomingByKey = new Map<string, SharedPeriod>();
  const refreshedAccounts = new Set<string>();
  for (const item of periods) {
    const id = generateId(item.name + item.createdByAccount);
    incomingByKey.set(id, item);
    if (item.createdByAccount) {
      refreshedAccounts.add(item.createdByAccount);
    }
  }

  await safeWrite(db, async () => {
    const allExisting = await db.get<Period>('periods').query().fetch();
    const kept = new Map<string, Period>();
    const ops: Model[] = [];

    for (const row of allExisting) {
      if (refreshedAccounts.has(row.createdByAccount)) {
        if (!incomingByKey.has(row.periodId) || kept.has(row.periodId)) {
          ops.push(row.prepareDestroyPermanently());
        } else {
          kept.set(row.periodId, row);
        }
      }
    }

    for (const [id, item] of incomingByKey.entries()) {
      const existing = kept.get(id);
      if (existing) {
        ops.push(
          existing.prepareUpdate(record => {
            const period = record as Period;
            period.name = item.name;
            period.start = item.start.getTime();
            period.end = item.end.getTime();
            period.kidName = item.kidName;
          })
        );
      } else {
        ops.push(
          db.get<Period>('periods').prepareCreate(record => {
            const period = record as Period;
            Object.assign(period, {
              periodId: id,
              name: item.name,
              createdByAccount: item.createdByAccount,
              start: item.start.getTime(),
              end: item.end.getTime(),
              kidName: item.kidName,
            });
          })
        );
      }
    }

    if (ops.length > 0) {
      await db.batch(ops);
    }
  }, 10000, 'addPeriodsToDatabase');
}


export async function getPeriodsFromCache(accountIds?: string[]): Promise<SharedPeriod[]> {
  try {
    const allowedIds =
      accountIds && accountIds.length > 0
        ? accountIds
        : getActiveServiceIdsFromStore();
    if (allowedIds.length === 0) {
      return [];
    }

    const database = getDatabaseInstance();

    const periodRows = await database
      .get<Period>('periods')
      .query(Q.where("createdByAccount", Q.oneOf(allowedIds)))
      .fetch();

    const deduped = new Map<string, SharedPeriod>();
    for (const row of periodRows) {
      const shared = mapPeriodToShared(row);
      const key = `${shared.name.trim()}::${shared.createdByAccount}`;
      if (!deduped.has(key)) {
        deduped.set(key, shared);
      }
    }

    return Array.from(deduped.values())
      .sort((a, b) => a.end.getTime() - b.end.getTime());
  } catch (e) {
    warn(String(e));
    return [];
  }
}

export async function addGradesToDatabase(grades: SharedGrade[], subject: string) {
  const db = getDatabaseInstance();
  for (const item of grades) {
    const id = generateId(item.createdByAccount + item.description + item.givenAt)

    const existing = await db.get('grades').query(Q.where('gradeId', id)).fetch();

    if(existing.length === 0) {
      await safeWrite(db, async () => {
        await db.get('grades').create((record: Model) => {
          const grade = record as Grade
          Object.assign(grade, {
            gradeId: id,
            createdByAccount: item.createdByAccount,
            subjectName: item.subjectName,
            subjectId: generateId(subject),
            description: item.description,
            givenAt: (item.givenAt ?? new Date()).getTime(),
            subjectFile: JSON.stringify(item.subjectFile),
            correctionFile: JSON.stringify(item.correctionFile),
            bonus: item.bonus,
            optional: item.optional,
            outOf: JSON.stringify(item.outOf),
            coefficient: item.coefficient,
            studentScore: JSON.stringify(item.studentScore),
            averageScore: JSON.stringify(item.averageScore),
            minScore: JSON.stringify(item.minScore),
            maxScore: JSON.stringify(item.maxScore)
          })
        })
      }, 10000, 'addGradesToDatabase')
    }
  }
}

// ponytail: the whole PeriodGrades as JSON in MMKV. The periodgrades/subjects
// tables were never filled with subjects or grades, so they could not serve as a cache.
let periodGradesCacheInstance: MMKV | null | undefined;

function getPeriodGradesCacheStorage(): MMKV | null {
  if (periodGradesCacheInstance !== undefined) return periodGradesCacheInstance;
  try {
    periodGradesCacheInstance = createMMKV({ id: "period-grades-cache" });
  } catch {
    periodGradesCacheInstance = null;
  }
  return periodGradesCacheInstance;
}

export function cachePeriodGrades(item: SharedPeriodGrades, key: string) {
  getPeriodGradesCacheStorage()?.set(key, JSON.stringify(item));
}

export function getCachedPeriodGrades(key: string): SharedPeriodGrades | null {
  const storage = getPeriodGradesCacheStorage();
  if (!storage) return null;
  const raw = storage.getString(key);
  if (!raw) { return null; }

  try {
    return JSON.parse(raw, (k, v) => (k === "givenAt" && typeof v === "string" ? new Date(v) : v));
  } catch {
    storage.remove(key);
    return null;
  }
}

export function clearPeriodGradesCacheForAccount(accountId: string): void {
  const storage = getPeriodGradesCacheStorage();
  if (!storage || !accountId) return;
  for (const key of storage.getAllKeys()) {
    if (key.startsWith(`${accountId}:`)) {
      storage.remove(key);
    }
  }
}

export async function pruneOrphanedGradesCache(validServiceIds: string[]): Promise<void> {
  const validSet = new Set(validServiceIds.filter(Boolean));
  const storage = getPeriodGradesCacheStorage();
  if (storage) {
    for (const key of storage.getAllKeys()) {
      const clientId = key.split(":")[0];
      if (!clientId || !validSet.has(clientId)) {
        storage.remove(key);
      }
    }
  }

  try {
    const db = getDatabaseInstance();
    await safeWrite(db, async () => {
      const ops: Model[] = [];

      const orphanPeriodGrades = await db.get<PeriodGrades>('periodgrades').query().fetch();
      for (const pg of orphanPeriodGrades) {
        if (!validSet.has(pg.createdByAccount)) {
          const subjects = await db.get<Subject>('subjects').query(Q.where("periodGradeId", pg.id)).fetch();
          for (const subject of subjects) {
            const grades = await db.get<Grade>('grades').query(Q.where("subjectId", subject.id)).fetch();
            for (const g of grades) ops.push(g.prepareDestroyPermanently());
            ops.push(subject.prepareDestroyPermanently());
          }
          ops.push(pg.prepareDestroyPermanently());
        }
      }

      const periodRows = await db.get<Period>('periods').query().fetch();
      for (const row of periodRows) {
        if (!validSet.has(row.createdByAccount)) {
          ops.push(row.prepareDestroyPermanently());
        }
      }

      const gradeRows = await db.get<Grade>('grades').query().fetch();
      for (const row of gradeRows) {
        if (!validSet.has(row.createdByAccount)) {
          ops.push(row.prepareDestroyPermanently());
        }
      }

      if (ops.length > 0) {
        await db.batch(ops);
      }
    }, 10000, 'pruneOrphanedGradesCache');
  } catch (e) {
    warn(`Failed pruning orphaned grades cache: ${String(e)}`);
  }
}