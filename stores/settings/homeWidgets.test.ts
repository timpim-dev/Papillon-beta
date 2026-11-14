import { describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native", () => ({
  Platform: {
    OS: "android",
    Version: 34,
  },
}));

jest.mock("@/stores/global", () => ({
  createMMKVStorage: () => ({
    getItem: () => null,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  }),
}));

jest.mock("@/modules/papillon-android-widgets", () => ({}));

jest.mock("@/stores/account", () => ({
  useAccountStore: {
    getState: () => ({
      lastUsedAccount: "acc-1",
      accounts: [
        {
          id: "acc-1",
          customisation: {
            subjects: {
              mathematiques: {
                name: "Maths",
                color: "#15803D",
                emoji: "📐",
              },
              histoire: {
                name: "Histoire",
                color: "#B45309",
                emoji: "🏛️",
              },
            },
          },
        },
      ],
      setSubjectName: jest.fn(),
      setSubjectColor: jest.fn(),
    }),
  },
}));

import { Course, CourseStatus, CourseType } from "@/services/shared/timetable";
import { Services } from "@/stores/account/types";
import {
  DEFAULT_HOME_WIDGETS,
  DEFAULT_WEAR_CONFIG,
  getHomeWidgetsForAccount,
  resolveWearConfig,
} from "@/stores/settings";
import type { Personalization } from "@/stores/settings/types";
import { getCodeType, getServiceName } from "@/utils/services/helper";
import { buildAndroidWidgetsSnapshot } from "@/utils/widgets/androidWidgetsSnapshot";

describe("Home Tab widgets settings helpers", () => {
  it("returns default widgets when personalization or account override is absent", () => {
    const result = getHomeWidgetsForAccount(undefined, "acc-1");
    expect(result).toEqual(DEFAULT_HOME_WIDGETS);
    expect(result).not.toBe(DEFAULT_HOME_WIDGETS);
  });

  it("uses per-account configuration when available and merges missing defaults", () => {
    const personalization: Partial<Personalization> = {
      homeWidgets: [
        { id: "news", enabled: false },
        { id: "timetable", enabled: true },
      ],
      homeWidgetsByAccount: {
        "acc-2": [
          { id: "latest_grades", enabled: true },
          { id: "tasks", enabled: false },
          { id: "latest_grades", enabled: false },
        ],
      },
    };

    const acc2Widgets = getHomeWidgetsForAccount(
      personalization as Personalization,
      "acc-2"
    );
    expect(acc2Widgets.map(w => w.id)).toEqual([
      "latest_grades",
      "tasks",
      "timetable",
      "grades_average",
      "news",
    ]);
    expect(acc2Widgets.find(w => w.id === "latest_grades")?.enabled).toBe(true);
    expect(acc2Widgets.find(w => w.id === "tasks")?.enabled).toBe(false);
    expect(acc2Widgets.find(w => w.id === "news")?.enabled).toBe(true);
  });

  it("falls back to global homeWidgets when the requested account has no override", () => {
    const personalization: Partial<Personalization> = {
      homeWidgets: [
        { id: "tasks", enabled: true },
        { id: "timetable", enabled: false },
      ],
      homeWidgetsByAccount: {},
    };

    const acc1Widgets = getHomeWidgetsForAccount(
      personalization as Personalization,
      "acc-1"
    );
    expect(acc1Widgets.map(w => w.id)).toEqual([
      "tasks",
      "timetable",
      "grades_average",
      "latest_grades",
      "news",
    ]);
    expect(acc1Widgets.find(w => w.id === "timetable")?.enabled).toBe(false);
  });
});

describe("buildAndroidWidgetsSnapshot", () => {
  it("filters, sorts, formats, and caps classes, grades, tasks, and canteen cards", () => {
    const now = new Date("2026-05-14T10:00:00.000Z").getTime();

    const courses: Course[] = [
      {
        id: "past",
        subject: "MATHEMATIQUES",
        type: CourseType.LESSON,
        from: new Date("2026-05-14T08:00:00.000Z"),
        to: new Date("2026-05-14T09:00:00.000Z"),
        createdByAccount: "svc-1",
      },
      {
        id: "second",
        subject: "HISTOIRE",
        type: CourseType.LESSON,
        from: new Date("2026-05-14T13:00:00.000Z"),
        to: new Date("2026-05-14T14:00:00.000Z"),
        room: "B204",
        teacher: "Mme Martin",
        status: CourseStatus.CANCELED,
        createdByAccount: "svc-1",
      },
      {
        id: "first",
        subject: "MATHEMATIQUES",
        type: CourseType.LESSON,
        from: new Date("2026-05-14T10:30:00.000Z"),
        to: new Date("2026-05-14T11:30:00.000Z"),
        room: "A101",
        teacher: "M. Dupont",
        createdByAccount: "svc-1",
      },
    ];

    const snapshot = buildAndroidWidgetsSnapshot({
      accountName: "Camille",
      courses,
      subjects: [
        {
          id: "sub-math",
          name: "MATHEMATIQUES",
          classAverage: { value: 12 },
          outOf: { value: 20 },
          grades: [
            {
              id: "g-old",
              subjectId: "sub-math",
              subjectName: "MATHEMATIQUES",
              description: "Interro 1",
              givenAt: new Date("2026-05-01T09:00:00.000Z"),
              coefficient: 1,
              studentScore: { value: 14 },
              outOf: { value: 20 },
              createdByAccount: "svc-1",
            },
            {
              id: "g-new",
              subjectId: "sub-math",
              subjectName: "MATHEMATIQUES",
              description: "DS Analyse",
              givenAt: new Date("2026-05-13T09:00:00.000Z"),
              coefficient: 2,
              studentScore: { value: 18 },
              outOf: { value: 20 },
              createdByAccount: "svc-1",
            },
          ],
        },
      ],
      overallAverage: { value: 15.5 },
      displayScale: "20",
      tasks: [
        {
          id: "t-done",
          subject: "MATHEMATIQUES",
          content: "<p>Fini</p>",
          dueDate: new Date("2026-05-15T08:00:00.000Z"),
          isDone: true,
          attachments: [],
          evaluation: false,
          custom: false,
          createdByAccount: "svc-1",
        },
        {
          id: "t-past",
          subject: "HISTOIRE",
          content: "<p>Hier</p>",
          dueDate: new Date("2026-05-13T08:00:00.000Z"),
          isDone: false,
          attachments: [],
          evaluation: false,
          custom: false,
          createdByAccount: "svc-1",
        },
        {
          id: "t-next",
          subject: "HISTOIRE",
          content: "<p>Réviser&nbsp;le <b>chapitre 3</b></p>",
          dueDate: new Date("2026-05-15T08:00:00.000Z"),
          isDone: false,
          attachments: [],
          evaluation: true,
          custom: false,
          createdByAccount: "svc-1",
        },
      ],
      balances: [
        {
          amount: 1250,
          currency: "€",
          lunchRemaining: 4,
          lunchPrice: 310,
          label: "Cantine",
          createdByAccount: "svc-canteen",
        },
      ],
      qrCodesByServiceId: {
        "svc-canteen": "1234567890",
      },
      serviceTypesByServiceId: {
        "svc-canteen": Services.TURBOSELF,
      },
      now,
    });

    expect(snapshot.updatedAt).toBe(now);
    expect(snapshot.accountName).toBe("Camille");
    expect(snapshot.nextClasses.map(c => c.id)).toEqual(["first", "second"]);
    expect(snapshot.nextClasses[0]).toMatchObject({
      subject: "Maths",
      room: "A101",
      teacher: "M. Dupont",
      color: "#15803D",
      isCanceled: false,
    });
    expect(snapshot.nextClasses[1].isCanceled).toBe(true);

    expect(snapshot.latestGrades.map(g => g.id)).toEqual(["g-new", "g-old"]);
    expect(snapshot.latestGrades[0]).toMatchObject({
      subject: "Maths",
      description: "DS Analyse",
      score: "18.00",
      outOf: "/20",
    });
    expect(snapshot.overallAverage).toBe("15.50/20");

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]).toMatchObject({
      id: "t-next",
      subject: "Histoire",
      color: "#B45309",
      isDone: false,
    });
    expect(snapshot.tasks[0].description).toContain("Réviser");
    expect(snapshot.tasks[0].description).not.toContain("<b>");

    expect(snapshot.canteenCards).toEqual([
      {
        id: "svc-canteen-0",
        label: "Cantine",
        serviceName: getServiceName(Services.TURBOSELF),
        balanceText: "12.50 €",
        qrData: "1234567890",
        qrType: getCodeType(Services.TURBOSELF),
      },
    ]);
  });

  it("populates overallAverageValue, scale, and averageHistory from history fallback", () => {
    const now = new Date("2026-05-14T10:00:00.000Z").getTime();
    const snapshot = buildAndroidWidgetsSnapshot({
      courses: [],
      subjects: [],
      displayScale: "20",
      tasks: [],
      averageHistoryPoints: [
        { date: new Date("2026-05-01T12:00:00.000Z"), average: 11.2 },
        { date: new Date("2026-05-10T12:00:00.000Z"), average: 12.75 },
      ],
      now,
    });

    expect(snapshot.overallAverage).toBe("12.75/20");
    expect(snapshot.overallAverageValue).toBe("12.75");
    expect(snapshot.overallAverageScale).toBe("/20");
    expect(snapshot.overallAverageSubtitle).toContain("estimée au");
    expect(snapshot.averageHistory).toHaveLength(2);
    expect(snapshot.averageHistory?.[1].value).toBe(12.75);
  });
});

describe("resolveWearConfig", () => {
  it("normalizes tilePreset and expanded complication metrics with safe fallbacks", () => {
    expect(resolveWearConfig(undefined)).toEqual(DEFAULT_WEAR_CONFIG);

    const custom = resolveWearConfig({
      wearConfig: {
        syncThemeGradient: false,
        enabledSections: ["tasks", "grades"],
        complicationMetric: "next_class_countdown",
        tilePreset: "latest_grades",
      },
    });
    expect(custom).toEqual({
      syncThemeGradient: false,
      enabledSections: ["tasks", "grades"],
      complicationMetric: "next_class_countdown",
      tilePreset: "latest_grades",
    });

    const latestGradeMetric = resolveWearConfig({
      wearConfig: {
        syncThemeGradient: true,
        enabledSections: ["classes"],
        complicationMetric: "latest_grade",
        tilePreset: "homework",
      },
    });
    expect(latestGradeMetric.complicationMetric).toBe("latest_grade");
    expect(latestGradeMetric.tilePreset).toBe("homework");

    const invalid = resolveWearConfig({
      wearConfig: {
        syncThemeGradient: true,
        enabledSections: ["classes"],
        // @ts-expect-error testing invalid runtime values
        complicationMetric: "unknown_metric",
        // @ts-expect-error testing invalid runtime values
        tilePreset: "unknown_preset",
      },
    });
    expect(invalid.complicationMetric).toBe(DEFAULT_WEAR_CONFIG.complicationMetric);
    expect(invalid.tilePreset).toBe(DEFAULT_WEAR_CONFIG.tilePreset);
  });
});
