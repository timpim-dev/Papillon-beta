import {
  AndroidWidgetCanteenCard,
  AndroidWidgetCourse,
  AndroidWidgetGrade,
  AndroidWidgetsSnapshot,
  AndroidWidgetTask,
} from "@/modules/papillon-android-widgets";
import { Balance } from "@/services/shared/balance";
import { Grade, GradeScore, Subject } from "@/services/shared/grade";
import { Homework } from "@/services/shared/homework";
import { Course, CourseStatus } from "@/services/shared/timetable";
import { Services } from "@/stores/account/types";
import type { WearConfig } from "@/stores/settings/types";
import { formatHTML } from "@/utils/format/html";
import {
  formatGradeScoreForDisplay,
  GradeDisplayScale,
} from "@/utils/grades/scale";
import { getCodeType, getServiceName } from "@/utils/services/helper";
import { getSubjectColor } from "@/utils/subjects/colors";
import { getSubjectEmoji } from "@/utils/subjects/emoji";
import { getSubjectName } from "@/utils/subjects/name";

export interface BuildSnapshotInput {
  accountName?: string | null;
  themeColor?: string | null;
  wallpaperGradientColors?: string[];
  wearConfig?: WearConfig;
  courses: Course[];
  subjects: Subject[];
  overallAverage?: GradeScore | null;
  displayScale: GradeDisplayScale;
  tasks: Homework[];
  balances?: Balance[];
  qrCodesByServiceId?: Record<string, string | null>;
  serviceTypesByServiceId?: Record<string, Services>;
  now?: number;
}

export type GradeWithSubject = Grade & { subject: Subject };

function safeSubjectEmoji(subject: string): string {
  try {
    return getSubjectEmoji(subject);
  } catch {
    return "📚";
  }
}

export function buildAndroidWidgetsSnapshot({
  accountName = null,
  themeColor = null,
  wallpaperGradientColors,
  wearConfig,
  courses,
  subjects,
  overallAverage,
  displayScale,
  tasks,
  balances = [],
  qrCodesByServiceId = {},
  serviceTypesByServiceId = {},
  now = Date.now(),
}: BuildSnapshotInput): AndroidWidgetsSnapshot {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const nextClasses: AndroidWidgetCourse[] = courses
    .filter(course => course.to.getTime() > now)
    .sort((a, b) => a.from.getTime() - b.from.getTime())
    .slice(0, 10)
    .map(course => ({
      id: course.id,
      subject: getSubjectName(course.subject),
      emoji: safeSubjectEmoji(course.subject),
      room: course.room || null,
      teacher: course.teacher || null,
      color: getSubjectColor(course.subject),
      from: course.from.getTime(),
      to: course.to.getTime(),
      isCanceled: course.status === CourseStatus.CANCELED,
    }));

  const flattenedGrades: GradeWithSubject[] = subjects.flatMap(subject =>
    (subject.grades ?? []).map(grade => ({ ...grade, subject }))
  );

  const latestGrades: AndroidWidgetGrade[] = flattenedGrades
    .sort((a, b) => (b.givenAt?.getTime() ?? 0) - (a.givenAt?.getTime() ?? 0))
    .slice(0, 10)
    .map(item => {
      const formatted = formatGradeScoreForDisplay(
        item.studentScore,
        item.outOf,
        displayScale
      );
      return {
        id: item.id,
        subject: getSubjectName(item.subject.name),
        emoji: safeSubjectEmoji(item.subject.name),
        description: item.description || getSubjectName(item.subject.name),
        score: formatted.value,
        outOf: formatted.denominator,
        color: getSubjectColor(item.subject.name),
        date: item.givenAt?.getTime() ?? 0,
      };
    });

  let formattedOverall: string | null = null;
  if (
    overallAverage &&
    !overallAverage.disabled &&
    typeof overallAverage.value === "number"
  ) {
    const formatted = formatGradeScoreForDisplay(
      overallAverage,
      { value: 20 },
      displayScale
    );
    formattedOverall = `${formatted.value}${formatted.denominator}`;
  }

  const upcomingTasks: AndroidWidgetTask[] = tasks
    .filter(
      task =>
        !task.isDone &&
        new Date(task.dueDate).getTime() >= startOfToday.getTime()
    )
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
    .slice(0, 15)
    .map((task, index) => ({
      id: task.id ?? `${task.subject}-${index}`,
      subject: getSubjectName(task.subject),
      emoji: safeSubjectEmoji(task.subject),
      description: formatHTML(task.content || "", true),
      color: getSubjectColor(task.subject),
      dueDate: new Date(task.dueDate).getTime(),
      isDone: task.isDone,
    }));

  const canteenCards: AndroidWidgetCanteenCard[] = balances.map(
    (balance, index) => {
      const serviceType =
        serviceTypesByServiceId[balance.createdByAccount] ?? Services.TURBOSELF;
      const qrData = qrCodesByServiceId[balance.createdByAccount] ?? null;
      return {
        id: `${balance.createdByAccount}-${index}`,
        label: balance.label || getServiceName(serviceType),
        serviceName: getServiceName(serviceType),
        balanceText: `${(balance.amount / 100).toFixed(2)} ${balance.currency || "€"}`,
        qrData,
        qrType: qrData ? getCodeType(serviceType) : null,
      };
    }
  );

  return {
    updatedAt: now,
    accountName,
    themeColor,
    ...(wallpaperGradientColors ? { wallpaperGradientColors } : {}),
    ...(wearConfig ? { wearConfig } : {}),
    overallAverage: formattedOverall,
    nextClasses,
    latestGrades,
    tasks: upcomingTasks,
    canteenCards,
  };
}
