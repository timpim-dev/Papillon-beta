import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async (_alg: string, input: string) => {
    const hex = Array.from(input)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
    return "a".repeat(64 - hex.length) + hex;
  }),
}));

jest.mock("react-native-mmkv", () => {
  const stores = new Map<string, Map<string, string>>();
  return {
    createMMKV: ({ id }: { id: string }) => {
      if (!stores.has(id)) stores.set(id, new Map<string, string>());
      const m = stores.get(id)!;
      return {
        getString: (k: string) => m.get(k),
        set: (k: string, v: string) => m.set(k, v),
        remove: (k: string) => m.delete(k),
      };
    },
  };
});

jest.mock("@/stores/account", () => ({
  useAccountStore: {
    getState: () => ({ accounts: [], lastUsedAccount: "" }),
  },
}));

jest.mock("@/stores/settings", () => {
  let state = {
    personalization: {
      rewardsUnlockedIds: ["badge_starter"],
      rewardsEquippedBadge: "badge_starter",
      rewardsPocketBaseBackupEnabled: false,
      rewardsPocketBaseUrl: "https://pocketbase.felixx.dev",
    },
  };
  return {
    useSettingsStore: {
      getState: () => ({
        ...state,
        mutateProperty: (_section: string, updates: Record<string, unknown>) => {
          state = {
            ...state,
            personalization: { ...state.personalization, ...updates },
          };
        },
      }),
    },
  };
});

import { computeUnlockedRewards } from "./rewardsCatalog";
import {
  backupPointEventToPocketBase,
  toPocketBaseEventType,
  updateUserBackup,
} from "./pocketbaseClient";
import {
  awardAudioHomeworkPoints,
  awardFocusSprintPoints,
  awardMicroStepPoints,
  awardTaskKickoffPoints,
  getAdhdRewardsState,
  getCustomPersonalRewards,
  getSpendablePoints,
  redeemCustomPersonalReward,
} from "./rewardsService";

describe("rewardsCatalog", () => {
  it("unlocks cosmetic rewards matching points tier without duplicates", () => {
    const unlocked = computeUnlockedRewards(760, ["badge_starter"]);
    expect(unlocked).toContain("badge_starter");
    expect(unlocked).toContain("badge_spark");
    expect(unlocked).toContain("badge_streak");
    expect(unlocked).toContain("theme_aurora");
    expect(unlocked).toContain("badge_scholar");
    expect(unlocked).toContain("theme_gold");
    expect(unlocked).not.toContain("theme_sakura");
  });
});

describe("ADHD work rewards loop", () => {
  it("awards points for kickoff, micro-steps, focus sprint, audio upload, and redeems custom treats", async () => {
    expect(await awardTaskKickoffPoints("hw-adhd-1")).toBe(true);
    expect(await awardTaskKickoffPoints("hw-adhd-1")).toBe(false);
    expect(await awardMicroStepPoints("hw-adhd-1", "step-1")).toBe(true);
    expect((await awardFocusSprintPoints(15, "hw-adhd-1")).delta).toBe(25);
    expect(await awardAudioHomeworkPoints("hw-adhd-1")).toBe(true);

    const state = getAdhdRewardsState();
    // 5 kickoff + 5 step + 25 sprint + 20 audio = 55 pts
    expect(state.totalEarnedPoints).toBe(55);
    expect(getSpendablePoints(state)).toBe(55);

    const snack = getCustomPersonalRewards()[0];
    const redeemed = redeemCustomPersonalReward(snack.id);
    expect(redeemed.ok).toBe(true);
    expect(getSpendablePoints(redeemed.state)).toBe(55 - snack.costPoints);
    // Lifetime effort points stay intact for cosmetic unlocks!
    expect(redeemed.state.totalEarnedPoints).toBe(55);
  });
});

describe("pocketbaseClient private backup safety", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("maps ADHD events to PocketBase deployed enum safely", () => {
    expect(toPocketBaseEventType("focus_sprint")).toBe("achievement");
    expect(toPocketBaseEventType("micro_step")).toBe("achievement");
    expect(toPocketBaseEventType("audio_homework")).toBe("homework_done");
    expect(toPocketBaseEventType("comeback_bonus")).toBe("streak_bonus");
  });

  it("never sends pronote_hash when patching pp_users backup", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: unknown, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "user12345678901",
          pseudo: "Tim",
          points_total: 100,
          streak_days: 2,
          unlocked_rewards: ["badge_starter", "badge_spark"],
        }),
      };
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    await updateUserBackup("https://pocketbase.felixx.dev", "user12345678901", {
      pseudo: "Tim",
      points_total: 100,
    });

    const sentBody = JSON.parse(String(capturedInit?.body ?? "{}"));
    expect(capturedInit?.method).toBe("PATCH");
    expect(sentBody.pronote_hash).toBeUndefined();
  });

  it("prevents double-counting when PocketBase rejects duplicate event_key", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"data":{"event_key":{"code":"validation_not_unique"}}}',
    }));
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const res = await backupPointEventToPocketBase("https://pocketbase.felixx.dev", {
      userId: "user12345678901",
      currentRemotePoints: 30,
      currentUnlocked: ["badge_starter"],
      kind: "focus_sprint",
      eventKey: "sprint:1",
      pointsDelta: 25,
    });

    expect(res.backedUp).toBe(false);
    expect(res.newRemotePoints).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
