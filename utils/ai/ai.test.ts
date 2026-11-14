import { describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-mmkv", () => {
  const stores = new Map<string, Map<string, string>>();
  return {
    createMMKV: ({ id }: { id: string }) => {
      if (!stores.has(id)) {
        stores.set(id, new Map<string, string>());
      }
      const m = stores.get(id)!;
      return {
        getString: (k: string) => m.get(k),
        set: (k: string, v: string) => m.set(k, v),
        remove: (k: string) => m.delete(k),
      };
    },
  };
});

jest.mock("expo-secure-store", () => {
  const map = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => map.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      map.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      map.delete(k);
    }),
  };
});

jest.mock("@/stores/account", () => ({
  useAccountStore: {
    getState: () => ({
      lastUsedAccount: "acc-1",
      accounts: [{ id: "acc-1", firstName: "Tim", services: [], customisation: { subjects: {} } }],
    }),
  },
}));

jest.mock("@/database/useChat", () => ({ getChatsFromCache: jest.fn(async () => []) }));
jest.mock("@/database/useGrades", () => ({
  getCachedPeriodGrades: jest.fn(() => null),
  getPeriodsFromCache: jest.fn(async () => []),
}));
jest.mock("@/database/useHomework", () => ({
  getHomeworksFromCache: jest.fn(async () => []),
  getWeekNumberFromDate: jest.fn(() => 46),
}));
jest.mock("@/database/useTimetable", () => ({
  getCoursesFromCache: jest.fn(async () => []),
}));
jest.mock("@/utils/grades/helper/period", () => ({
  getCurrentPeriod: jest.fn(),
}));

import { Course, CourseStatus, CourseType } from "@/services/shared/timetable";

import {
  buildProviderRequest,
  buildSocraticSystemPrompt,
  parseAssistantResponse,
} from "./aiClient";
import {
  findFreeStudySlots,
  formatContextForPrompt,
  redactSensitiveText,
} from "./studentContextBuilder";

describe("studentContextBuilder", () => {
  it("redacts tokens, emails, phones and long secrets while collapsing HTML", () => {
    const cleaned = redactSensitiveText(
      "<p>Voir https://pronote.fr?token=secret123&user=abc - prof@ecole.fr - 06 12 34 56 78 - Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9</p>"
    );
    expect(cleaned).not.toContain("secret123");
    expect(cleaned).not.toContain("prof@ecole.fr");
    expect(cleaned).not.toContain("06 12 34 56 78");
    expect(cleaned).not.toContain("eyJhbGci");
    expect(cleaned).toContain("[EMAIL]");
    expect(cleaned).toContain("[TÉL]");
  });

  it("detects daytime gaps and evening revision slots while skipping canceled classes", () => {
    const baseDay = new Date(2026, 10, 16, 0, 0, 0);
    const now = new Date(2026, 10, 16, 7, 30, 0);
    const courses: Course[] = [
      {
        id: "c1",
        subject: "Maths",
        type: CourseType.LESSON,
        from: new Date(2026, 10, 16, 8, 0, 0),
        to: new Date(2026, 10, 16, 9, 0, 0),
        createdByAccount: "acc-1",
      },
      {
        id: "c2-canceled",
        subject: "Physique",
        type: CourseType.LESSON,
        from: new Date(2026, 10, 16, 9, 5, 0),
        to: new Date(2026, 10, 16, 10, 0, 0),
        status: CourseStatus.CANCELED,
        createdByAccount: "acc-1",
      },
      {
        id: "c3",
        subject: "Français",
        type: CourseType.LESSON,
        from: new Date(2026, 10, 16, 10, 30, 0),
        to: new Date(2026, 10, 16, 11, 30, 0),
        createdByAccount: "acc-1",
      },
    ];

    const slots = findFreeStudySlots(courses, now, 1);
    const gaps = slots.filter(s => s.kind === "gap");
    const evenings = slots.filter(s => s.kind === "evening");
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationMinutes).toBe(90);
    expect(evenings).toHaveLength(1);
    expect(baseDay.getDate()).toBe(16);
  });

  it("formats context snapshot under prompt budget", () => {
    const txt = formatContextForPrompt({
      generatedAtIso: "2026-11-16T08:00:00.000Z",
      firstName: "Tim",
      upcomingClasses: [],
      freeStudySlots: [],
      pendingHomeworks: [
        {
          subject: "Maths",
          dueDateLabel: "Mar 17/11",
          dueIso: "2026-11-17T08:00:00.000Z",
          summary: "Exercices 4 et 5",
          evaluation: true,
        },
      ],
      overallAverage: "14.50/20",
      subjectAverages: [],
      recentCommunications: [],
    });
    expect(txt).toContain("[ÉVAL/CONTRÔLE]");
    expect(txt).toContain("14.50/20");
  });
});

describe("aiClient", () => {
  it("enforces Socratic non-cheating rules in system prompt", () => {
    const prompt = buildSocraticSystemPrompt("Devoir de Maths demain");
    expect(prompt).toContain("NE JAMAIS FAIRE À LA PLACE DE L'ÉLÈVE");
    expect(prompt).toContain("Devoir de Maths demain");
  });

  it("parses valid schedule_reminder and flashcard Action Chips from response", () => {
    const raw = [
      "Voici comment structurer ta révision étape par étape.",
      "<<<ACTIONS",
      JSON.stringify([
        {
          type: "schedule_reminder",
          title: "Réviser Maths",
          body: "Relire chapitre dérivées",
          triggerIso: "2026-11-16T18:00:00.000Z",
          subject: "Mathématiques",
        },
        {
          type: "flashcard",
          subject: "Maths",
          front: "Dérivée de x² ?",
          back: "2x",
        },
      ]),
      "ACTIONS>>>",
    ].join("\n");

    const parsed = parseAssistantResponse(raw);
    expect(parsed.displayText).toBe("Voici comment structurer ta révision étape par étape.");
    expect(parsed.reminders).toHaveLength(1);
    expect(parsed.reminders[0].title).toBe("Réviser Maths");
    expect(parsed.flashcards).toHaveLength(1);
    expect(parsed.flashcards[0].back).toBe("2x");
  });

  it("handles malformed action JSON gracefully without losing reply text", () => {
    const parsed = parseAssistantResponse("Conseil utile.\n<<<ACTIONS not-json ACTIONS>>>");
    expect(parsed.displayText).toBe("Conseil utile.");
    expect(parsed.reminders).toEqual([]);
    expect(parsed.flashcards).toEqual([]);
  });

  it("builds Gemini and OpenAI-compatible requests cleanly", () => {
    const gemini = buildProviderRequest({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "AIzaTest",
      systemPrompt: "Sys",
      messages: [{ role: "user", content: "Bonjour" }],
    });
    expect(gemini.url).toContain("generativelanguage.googleapis.com");
    expect(gemini.url).toContain("gemini-2.5-flash");

    const groq = buildProviderRequest({
      provider: "groq",
      apiKey: "gsk_test",
      systemPrompt: "Sys",
      messages: [{ role: "user", content: "Bonjour" }],
    });
    expect(groq.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(groq.headers.Authorization).toBe("Bearer gsk_test");
  });
});
