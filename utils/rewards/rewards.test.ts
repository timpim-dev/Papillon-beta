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

import { computeUnlockedRewards } from "./rewardsCatalog";
import {
  awardPointEvent,
  makeFriendPairKey,
  shouldShowRewardsOptInPopup,
  updateUserProfile,
} from "./pocketbaseClient";

describe("rewardsCatalog", () => {
  it("unlocks cosmetic rewards matching points tier without duplicates", () => {
    const unlocked = computeUnlockedRewards(760, ["badge_starter"]);
    expect(unlocked).toContain("badge_starter");
    expect(unlocked).toContain("badge_streak");
    expect(unlocked).toContain("theme_aurora");
    expect(unlocked).toContain("badge_scholar");
    expect(unlocked).toContain("theme_gold");
    expect(unlocked).not.toContain("theme_sakura");
  });
});

describe("pocketbaseClient pure helpers & HTTP safety", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("creates order-independent sorted friend pair keys", () => {
    expect(makeFriendPairKey("UserB12345", "usera98765")).toBe(
      makeFriendPairKey("usera98765", "UserB12345")
    );
  });

  it("triggers opt-in modal on join (open 1), app update, and every 50th open", () => {
    expect(
      shouldShowRewardsOptInPopup({
        hasSignedInAccount: true,
        rewardsOptIn: null,
        rewardsAppOpenCount: 1,
        currentAppVersion: "1.0.0",
        rewardsLastPromptVersion: "1.0.0",
      })
    ).toBe(true);

    expect(
      shouldShowRewardsOptInPopup({
        hasSignedInAccount: true,
        rewardsOptIn: false,
        rewardsAppOpenCount: 12,
        currentAppVersion: "1.0.1",
        rewardsLastPromptVersion: "1.0.0",
      })
    ).toBe(true);

    expect(
      shouldShowRewardsOptInPopup({
        hasSignedInAccount: true,
        rewardsOptIn: false,
        rewardsAppOpenCount: 50,
        currentAppVersion: "1.0.1",
        rewardsLastPromptVersion: "1.0.1",
      })
    ).toBe(true);

    expect(
      shouldShowRewardsOptInPopup({
        hasSignedInAccount: true,
        rewardsOptIn: false,
        rewardsAppOpenCount: 49,
        currentAppVersion: "1.0.1",
        rewardsLastPromptVersion: "1.0.1",
      })
    ).toBe(false);

    expect(
      shouldShowRewardsOptInPopup({
        hasSignedInAccount: true,
        rewardsOptIn: true,
        rewardsAppOpenCount: 50,
        currentAppVersion: "1.0.2",
        rewardsLastPromptVersion: "1.0.1",
      })
    ).toBe(false);
  });

  it("never sends pronote_hash when patching pp_users profile", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = jest.fn(async (_url: unknown, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "user12345678901",
          pseudo: "Tim",
          friend_code: "TIM12345",
          points_total: 100,
          streak_days: 2,
          unlocked_rewards: ["badge_starter", "badge_streak"],
          opt_in_leaderboards: true,
        }),
      };
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    await updateUserProfile("https://pocketbase.felixx.dev", "user12345678901", {
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

    const res = await awardPointEvent("https://pocketbase.felixx.dev", {
      userId: "user12345678901",
      currentPoints: 30,
      currentUnlocked: ["badge_starter"],
      eventType: "homework_done",
      eventKey: "hw:abc",
      pointsDelta: 15,
    });

    expect(res.awarded).toBe(false);
    expect(res.newPointsTotal).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
