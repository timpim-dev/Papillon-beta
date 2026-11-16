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

import { Grade } from "@/services/shared/grade";

import {
  buildUpgradePath,
  evaluateGradeGacha,
  GACHA_RARITIES,
  GACHA_TIER_ORDER,
  getGachaCollectionStats,
  getOpenedGradeGachaCount,
  isGradeGachaOpened,
  markGradeGachaOpened,
  resetOpenedGradeGachas,
  subscribeGradeGachaUpdates,
} from "./gradeGacha";

function makeGrade(partial: Partial<Grade> = {}): Grade {
  return {
    id: "g-1",
    subjectId: "subj-math",
    subjectName: "Mathématiques",
    description: "Contrôle",
    givenAt: new Date(2026, 10, 14),
    coefficient: 1,
    createdByAccount: "acc-1",
    outOf: { value: 20 },
    studentScore: { value: 15 },
    averageScore: { value: 12 },
    maxScore: { value: 19 },
    ...partial,
  };
}

describe("gradeGacha", () => {
  it("maps scores and non-20 scales across the 8 requested rarities", () => {
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 1.5 }, outOf: { value: 20 } })).tier).toBe("nul");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 4.5 }, outOf: { value: 20 } })).tier).toBe("commun");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 7.5 }, outOf: { value: 20 } })).tier).toBe("peu_commun");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 10.5 }, outOf: { value: 20 } })).tier).toBe("rare");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 13 }, outOf: { value: 20 } })).tier).toBe("super_rare");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 15.5 }, outOf: { value: 20 } })).tier).toBe("epic");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 18 }, outOf: { value: 20 } })).tier).toBe("legendary");
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 20 }, outOf: { value: 20 } })).tier).toBe("mythic");

    // Non-20 conversions
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 5 }, outOf: { value: 5 } })).tier).toBe("mythic"); // 20/20
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 9 }, outOf: { value: 10 } })).tier).toBe("legendary"); // 18/20
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 7.5 }, outOf: { value: 10 } })).tier).toBe("epic"); // 15/20
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 2 }, outOf: { value: 10 } })).tier).toBe("commun"); // 4/20
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 1 }, outOf: { value: 10 } })).tier).toBe("nul"); // 2/20

    // Disabled / absent grades fall back cleanly to commun
    expect(evaluateGradeGacha(makeGrade({ studentScore: { value: 0, disabled: true, status: "Abs" } })).tier).toBe("commun");
  });

  it("contains zero emojis in rarity labels and quips", () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    for (const tier of GACHA_TIER_ORDER) {
      const cfg = GACHA_RARITIES[tier];
      expect(emojiRegex.test(cfg.label)).toBe(false);
      for (const quip of cfg.quips) {
        expect(emojiRegex.test(quip)).toBe(false);
      }
    }
  });

  it("builds 4-step upgrade paths ending at target tier", () => {
    for (const tier of GACHA_TIER_ORDER) {
      const path = buildUpgradePath(tier);
      expect(path).toHaveLength(4);
      expect(path[3]).toBe(tier);
    }
  });

  it("persists opened grade IDs, collection stats, and resets cleanly", () => {
    resetOpenedGradeGachas();
    const listener = jest.fn();
    const unsub = subscribeGradeGachaUpdates(listener);

    expect(isGradeGachaOpened("g-42")).toBe(false);
    markGradeGachaOpened("g-42", "mythic");
    expect(isGradeGachaOpened("g-42")).toBe(true);
    expect(getOpenedGradeGachaCount()).toBe(1);
    expect(getGachaCollectionStats().mythic).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    markGradeGachaOpened("g-42", "mythic");
    expect(getGachaCollectionStats().mythic).toBe(1);

    resetOpenedGradeGachas();
    expect(isGradeGachaOpened("g-42")).toBe(false);
    expect(getOpenedGradeGachaCount()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
  });
});
