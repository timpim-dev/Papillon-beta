import { getChatsFromCache } from "@/database/useChat";
import { getCachedPeriodGrades, getPeriodsFromCache } from "@/database/useGrades";
import { getHomeworksFromCache, getWeekNumberFromDate } from "@/database/useHomework";
import { getCoursesFromCache } from "@/database/useTimetable";
import { Course } from "@/services/shared/timetable";
import { useAccountStore } from "@/stores/account";
import { getCurrentPeriod } from "@/utils/grades/helper/period";

export interface FreeStudySlot {
  dateLabel: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  kind: "gap" | "evening";
}

export interface StudentContextScope {
  includeTimetable: boolean;
  includeHomework: boolean;
  includeGrades: boolean;
  includeCommunications: boolean;
}

export interface StudentContextSnapshot {
  generatedAtIso: string;
  firstName?: string;
  upcomingClasses: Array<{
    dateLabel: string;
    startTime: string;
    endTime: string;
    subject: string;
    room?: string;
    canceled?: boolean;
  }>;
  freeStudySlots: FreeStudySlot[];
  pendingHomeworks: Array<{
    subject: string;
    dueDateLabel: string;
    dueIso: string;
    summary: string;
    evaluation: boolean;
  }>;
  overallAverage?: string;
  subjectAverages: Array<{
    subject: string;
    studentAverage?: string;
    classAverage?: string;
    recentGrades: string[];
  }>;
  recentCommunications: Array<{
    subject: string;
    author: string;
    dateLabel: string;
  }>;
}

export function stripHtmlAndCollapse(input: string): string {
  return String(input ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function redactSensitiveText(input: string): string {
  let out = stripHtmlAndCollapse(input);
  // Strip auth tokens, bearer secrets, session params and full auth query strings
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  out = out.replace(
    /([?&](?:token|session|auth|cookie|sid|key|secret|password|mdp)=)[^&\s]+/gi,
    "$1[REDACTED]"
  );
  // Strip email addresses
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]");
  // Strip French/international phone numbers (10 digits starting with 0 or +33)
  out = out.replace(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g, "[TÉL]");
  // Strip long opaque credential strings (>= 24 hex/base64url chars without spaces)
  out = out.replace(/\b[A-Za-z0-9_-]{28,}\b/g, "[SECRET]");
  return out.trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDayLabel(date: Date): string {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return `${days[date.getDay()]} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

function formatTimeHm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function findFreeStudySlots(
  courses: Course[],
  now: Date = new Date(),
  daysCount: number = 7
): FreeStudySlot[] {
  const slots: FreeStudySlot[] = [];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let offset = 0; offset < daysCount; offset++) {
    const dayStart = new Date(startOfToday.getTime() + offset * 86_400_000);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const dayCourses = courses
      .filter(c => {
        if (c.status === 0) return false; // CANCELED = 0 in CourseStatus
        const fromMs = c.from instanceof Date ? c.from.getTime() : new Date(c.from).getTime();
        return fromMs >= dayStart.getTime() && fromMs < dayEnd.getTime();
      })
      .sort((a, b) => new Date(a.from).getTime() - new Date(b.from).getTime());

    const dateLabel = formatDayLabel(dayStart);

    for (let i = 0; i < dayCourses.length - 1; i++) {
      const endCur = new Date(dayCourses[i].to).getTime();
      const startNext = new Date(dayCourses[i + 1].from).getTime();
      const gapMinutes = Math.floor((startNext - endCur) / 60_000);
      if (gapMinutes >= 50 && startNext > now.getTime()) {
        slots.push({
          dateLabel,
          startIso: new Date(Math.max(endCur, now.getTime())).toISOString(),
          endIso: new Date(startNext).toISOString(),
          durationMinutes: gapMinutes,
          kind: "gap",
        });
      }
    }

    const eveningStart = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate(),
      17,
      30,
      0
    );
    const lastEndMs = dayCourses.length > 0
      ? new Date(dayCourses[dayCourses.length - 1].to).getTime()
      : eveningStart.getTime();
    const studyStartMs = Math.max(eveningStart.getTime(), lastEndMs + 15 * 60_000, now.getTime() + 15 * 60_000);
    const studyLimitMs = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate(),
      20,
      30,
      0
    ).getTime();

    const eveningMinutes = Math.floor((studyLimitMs - studyStartMs) / 60_000);
    if (eveningMinutes >= 45) {
      slots.push({
        dateLabel,
        startIso: new Date(studyStartMs).toISOString(),
        endIso: new Date(Math.min(studyStartMs + 90 * 60_000, studyLimitMs)).toISOString(),
        durationMinutes: Math.min(eveningMinutes, 90),
        kind: "evening",
      });
    }
  }

  return slots.slice(0, 12);
}

function getPreferredSubjectName(rawSubject: string): string {
  try {
    const store = useAccountStore.getState();
    const account = store.accounts.find(a => a.id === store.lastUsedAccount) ?? store.accounts[0];
    const key = rawSubject.trim().toLowerCase();
    const mapped = account?.customisation?.subjects?.[key];
    return mapped?.name || rawSubject;
  } catch {
    return rawSubject;
  }
}

export async function buildStudentContextSnapshot(
  scope: StudentContextScope,
  now: Date = new Date()
): Promise<StudentContextSnapshot> {
  const accountState = useAccountStore.getState();
  const activeAccount =
    accountState.accounts.find(a => a.id === accountState.lastUsedAccount) ??
    accountState.accounts[0];

  const snapshot: StudentContextSnapshot = {
    generatedAtIso: now.toISOString(),
    firstName: activeAccount?.firstName ? redactSensitiveText(activeAccount.firstName) : undefined,
    upcomingClasses: [],
    freeStudySlots: [],
    pendingHomeworks: [],
    subjectAverages: [],
    recentCommunications: [],
  };

  const currentWeek = getWeekNumberFromDate(now);
  const nextWeekDate = new Date(now.getTime() + 7 * 86_400_000);
  const nextWeek = getWeekNumberFromDate(nextWeekDate);

  if (scope.includeTimetable) {
    try {
      const days = await getCoursesFromCache([currentWeek, nextWeek], now.getFullYear());
      const horizonMs = now.getTime() + 7 * 86_400_000;
      const allCourses = days.flatMap(d => d.courses ?? []);

      snapshot.upcomingClasses = allCourses
        .filter(c => {
          const toMs = new Date(c.to).getTime();
          const fromMs = new Date(c.from).getTime();
          return toMs >= now.getTime() - 3600_000 && fromMs <= horizonMs;
        })
        .sort((a, b) => new Date(a.from).getTime() - new Date(b.from).getTime())
        .slice(0, 28)
        .map(c => ({
          dateLabel: formatDayLabel(new Date(c.from)),
          startTime: formatTimeHm(new Date(c.from)),
          endTime: formatTimeHm(new Date(c.to)),
          subject: redactSensitiveText(getPreferredSubjectName(c.subject)),
          room: c.room ? redactSensitiveText(c.room) : undefined,
          canceled: c.status === 0,
        }));

      snapshot.freeStudySlots = findFreeStudySlots(allCourses, now, 7);
    } catch {
      // Read-only best effort
    }
  }

  if (scope.includeHomework) {
    try {
      const hwCurrent = await getHomeworksFromCache(currentWeek);
      const hwNext = await getHomeworksFromCache(nextWeek);
      const merged = [...hwCurrent, ...hwNext];
      const seen = new Set<string>();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      snapshot.pendingHomeworks = merged
        .filter(hw => {
          const key = `${hw.id}-${hw.dueDate.toISOString().slice(0, 10)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return !hw.isDone && hw.dueDate.getTime() >= startToday - 86_400_000;
        })
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
        .slice(0, 20)
        .map(hw => ({
          subject: redactSensitiveText(getPreferredSubjectName(hw.subject)),
          dueDateLabel: formatDayLabel(hw.dueDate),
          dueIso: hw.dueDate.toISOString(),
          summary: redactSensitiveText(hw.content).slice(0, 220),
          evaluation: Boolean(hw.evaluation),
        }));
    } catch {
      // Read-only best effort
    }
  }

  if (scope.includeGrades) {
    try {
      const periods = await getPeriodsFromCache();
      if (periods.length > 0 && activeAccount) {
        const currentPeriod = getCurrentPeriod(periods) ?? periods[periods.length - 1];
        if (currentPeriod) {
          const candidateKeys: string[] = [];
          for (const svc of activeAccount.services) {
            candidateKeys.push(`${svc.id}::${currentPeriod.name}`);
          }
          candidateKeys.push(`${activeAccount.id}::${currentPeriod.name}`);

          let periodGrades = null;
          for (const key of candidateKeys) {
            periodGrades = getCachedPeriodGrades(key);
            if (periodGrades) break;
          }

          if (periodGrades) {
            if (
              periodGrades.studentOverall &&
              typeof periodGrades.studentOverall.value === "number" &&
              !periodGrades.studentOverall.disabled
            ) {
              snapshot.overallAverage = `${periodGrades.studentOverall.value.toFixed(2)}/20`;
            }

            snapshot.subjectAverages = (periodGrades.subjects ?? [])
              .map(sub => {
                const outOf = sub.outOf?.value || 20;
                const stu = sub.studentAverage && !sub.studentAverage.disabled
                  ? `${sub.studentAverage.value.toFixed(2)}/${outOf}`
                  : undefined;
                const cls = sub.classAverage && !sub.classAverage.disabled
                  ? `${sub.classAverage.value.toFixed(2)}/${outOf}`
                  : undefined;
                const recentGrades = (sub.grades ?? [])
                  .slice(0, 4)
                  .map(g => {
                    const score = g.studentScore && !g.studentScore.disabled
                      ? `${g.studentScore.value}/${g.outOf?.value ?? 20}`
                      : g.studentScore?.status ?? "?";
                    const label = g.description ? redactSensitiveText(g.description).slice(0, 40) : "Note";
                    return `${score} (${label})`;
                  });
                return {
                  subject: redactSensitiveText(getPreferredSubjectName(sub.name)),
                  studentAverage: stu,
                  classAverage: cls,
                  recentGrades,
                };
              })
              .slice(0, 16);
          }
        }
      }
    } catch {
      // Read-only best effort
    }
  }

  if (scope.includeCommunications) {
    try {
      const chats = await getChatsFromCache();
      snapshot.recentCommunications = chats
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6)
        .map(c => ({
          subject: redactSensitiveText(c.subject || "Discussion"),
          author: redactSensitiveText(c.creator || c.recipient || "Établissement"),
          dateLabel: formatDayLabel(new Date(c.date)),
        }));
    } catch {
      // Read-only best effort
    }
  }

  return snapshot;
}

export function formatContextForPrompt(snapshot: StudentContextSnapshot): string {
  const lines: string[] = [];
  lines.push(`Date actuelle : ${snapshot.generatedAtIso.slice(0, 16)}`);
  if (snapshot.firstName) {
    lines.push(`Prénom élève : ${snapshot.firstName}`);
  }

  if (snapshot.pendingHomeworks.length > 0) {
    lines.push("\n### Devoirs à venir (non terminés)");
    for (const hw of snapshot.pendingHomeworks) {
      const tag = hw.evaluation ? "[ÉVAL/CONTRÔLE] " : "";
      lines.push(`- ${hw.dueDateLabel} | ${hw.subject} : ${tag}${hw.summary}`);
    }
  }

  if (snapshot.upcomingClasses.length > 0) {
    lines.push("\n### Emploi du temps (prochains cours)");
    for (const c of snapshot.upcomingClasses) {
      const room = c.room ? ` (${c.room})` : "";
      const cancel = c.canceled ? " [ANNULÉ]" : "";
      lines.push(`- ${c.dateLabel} ${c.startTime}-${c.endTime} : ${c.subject}${room}${cancel}`);
    }
  }

  if (snapshot.freeStudySlots.length > 0) {
    lines.push("\n### Créneaux libres disponibles pour réviser");
    for (const s of snapshot.freeStudySlots) {
      const start = s.startIso.slice(11, 16);
      const end = s.endIso.slice(11, 16);
      lines.push(`- ${s.dateLabel} ${start}-${end} (${s.durationMinutes} min, startIso=${s.startIso})`);
    }
  }

  if (snapshot.overallAverage || snapshot.subjectAverages.length > 0) {
    lines.push("\n### Notes & Moyennes");
    if (snapshot.overallAverage) {
      lines.push(`- Moyenne générale : ${snapshot.overallAverage}`);
    }
    for (const sub of snapshot.subjectAverages) {
      const parts: string[] = [];
      if (sub.studentAverage) parts.push(`élève ${sub.studentAverage}`);
      if (sub.classAverage) parts.push(`classe ${sub.classAverage}`);
      if (sub.recentGrades.length > 0) parts.push(`notes: ${sub.recentGrades.join(", ")}`);
      lines.push(`- ${sub.subject} : ${parts.join(" | ")}`);
    }
  }

  if (snapshot.recentCommunications.length > 0) {
    lines.push("\n### Dernières communications");
    for (const m of snapshot.recentCommunications) {
      lines.push(`- ${m.dateLabel} | ${m.author} : ${m.subject}`);
    }
  }

  return lines.join("\n").slice(0, 6500);
}
