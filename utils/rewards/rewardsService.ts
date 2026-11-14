import { createMMKV } from "react-native-mmkv";

import packageJson from "@/package.json";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import { GeographicQuerying } from "@/utils/native/georeverse";

import {
  addOrAcceptFriend,
  awardPointEvent,
  computePronoteHash,
  DEFAULT_POCKETBASE_URL,
  extractPronoteRewardsProfile,
  fetchLeaderboard,
  LeaderboardScope,
  PointEventType,
  PpUserRecord,
  recordShareStat,
  ShareChannel,
  updateUserProfile,
  upsertUserByPronoteHash,
} from "./pocketbaseClient";
import { computeUnlockedRewards } from "./rewardsCatalog";

const rewardsStorage = createMMKV({ id: "papillon-rewards" });

const KEY_USER_RECORD = "user_record_json";
const KEY_AWARDED_EVENTS = "awarded_event_keys";
const KEY_STREAK_LAST_DATE = "streak_last_day";
const KEY_STREAK_COUNT = "streak_count";

function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayYmd(now: Date = new Date()): string {
  return todayYmd(new Date(now.getTime() - 86_400_000));
}

export function getCachedRewardsUser(): PpUserRecord | null {
  const raw = rewardsStorage.getString(KEY_USER_RECORD);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PpUserRecord;
  } catch {
    return null;
  }
}

function saveCachedRewardsUser(user: PpUserRecord): void {
  rewardsStorage.set(KEY_USER_RECORD, JSON.stringify(user));
  const settings = useSettingsStore.getState();
  settings.mutateProperty("personalization", {
    rewardsUnlockedIds: user.unlocked_rewards,
    rewardsEquippedBadge:
      settings.personalization.rewardsEquippedBadge ?? user.equipped_badge ?? "badge_starter",
  });
}

function hasAwardedEventLocally(eventKey: string): boolean {
  const raw = rewardsStorage.getString(KEY_AWARDED_EVENTS);
  if (!raw) return false;
  try {
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) && arr.includes(eventKey);
  } catch {
    return false;
  }
}

function markEventAwardedLocally(eventKey: string): void {
  const raw = rewardsStorage.getString(KEY_AWARDED_EVENTS);
  let arr: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
  }
  if (!arr.includes(eventKey)) {
    arr.push(eventKey);
    rewardsStorage.set(KEY_AWARDED_EVENTS, JSON.stringify(arr.slice(-300)));
  }
}

function getPbUrl(): string {
  return (
    useSettingsStore.getState().personalization.rewardsPocketBaseUrl ||
    DEFAULT_POCKETBASE_URL
  );
}

export async function ensureRewardsUserSynced(overrides?: {
  pseudo?: string;
  city?: string;
  schoolName?: string;
  optInLeaderboards?: boolean;
  avatarEmoji?: string;
}): Promise<PpUserRecord | null> {
  const settings = useSettingsStore.getState().personalization;
  const optIn = overrides?.optInLeaderboards ?? (settings.rewardsOptIn === true);
  if (!optIn) return getCachedRewardsUser();

  const accountState = useAccountStore.getState();
  const activeAccount =
    accountState.accounts.find(a => a.id === accountState.lastUsedAccount) ??
    accountState.accounts[0];
  if (!activeAccount) return null;

  const cached = getCachedRewardsUser();
  const pronoteProfile = extractPronoteRewardsProfile(activeAccount);
  let resolvedCity =
    overrides?.city ??
    ((cached?.city && cached.city.trim()) || pronoteProfile.city);

  if (!resolvedCity && pronoteProfile.schoolName) {
    try {
      const geo = await GeographicQuerying(pronoteProfile.schoolName, 1);
      if (geo?.city) {
        resolvedCity = geo.city;
      }
    } catch {
      // Offline / geocoder unavailable
    }
  }

  const resolvedSchool =
    overrides?.schoolName ??
    ((cached?.school_name && cached.school_name.trim()) || pronoteProfile.schoolName);

  const pronoteHash = await computePronoteHash(activeAccount);
  const pbUrl = getPbUrl();

  const synced = await upsertUserByPronoteHash(pbUrl, {
    cachedUserId: cached?.id,
    pronoteHash,
    pseudo:
      overrides?.pseudo ??
      cached?.pseudo ??
      pronoteProfile.pseudo,
    avatarEmoji: overrides?.avatarEmoji ?? cached?.avatar_emoji ?? "🦋",
    schoolName: resolvedSchool,
    city: resolvedCity,
    optInLeaderboards: true,
    appVersion: String(packageJson.version ?? "1.0.0"),
  });

  const needsProfilePatch =
    Boolean(
      overrides &&
        (overrides.pseudo !== undefined ||
          overrides.city !== undefined ||
          overrides.schoolName !== undefined ||
          overrides.optInLeaderboards !== undefined ||
          overrides.avatarEmoji !== undefined)
    ) ||
    (!synced.school_name && Boolean(resolvedSchool)) ||
    (!synced.city && Boolean(resolvedCity));

  if (needsProfilePatch) {
    const updated = await updateUserProfile(pbUrl, synced.id, {
      ...(overrides?.pseudo !== undefined ? { pseudo: overrides.pseudo.trim() } : {}),
      ...(overrides?.city !== undefined
        ? { city: overrides.city.trim() }
        : !synced.city && resolvedCity
          ? { city: resolvedCity }
          : {}),
      ...(overrides?.schoolName !== undefined
        ? { school_name: overrides.schoolName.trim() }
        : !synced.school_name && resolvedSchool
          ? { school_name: resolvedSchool }
          : {}),
      ...(overrides?.optInLeaderboards !== undefined
        ? { opt_in_leaderboards: overrides.optInLeaderboards }
        : {}),
      ...(overrides?.avatarEmoji !== undefined ? { avatar_emoji: overrides.avatarEmoji } : {}),
      app_version: String(packageJson.version ?? "1.0.0"),
    });
    const finalUser = updated ?? synced;
    saveCachedRewardsUser(finalUser);
    return finalUser;
  }

  saveCachedRewardsUser(synced);
  return synced;
}

export async function updateRewardsVisibility(optIn: boolean): Promise<void> {
  const settings = useSettingsStore.getState();
  settings.mutateProperty("personalization", {
    rewardsOptIn: optIn,
    rewardsLastPromptVersion: String(packageJson.version ?? "1.0.0"),
  });

  const cached = getCachedRewardsUser();
  if (cached?.id) {
    const updated = await updateUserProfile(getPbUrl(), cached.id, {
      opt_in_leaderboards: optIn,
    });
    if (updated) {
      saveCachedRewardsUser(updated);
    } else {
      saveCachedRewardsUser({ ...cached, opt_in_leaderboards: optIn });
    }
  }
}

async function tryAwardPoints(params: {
  eventType: PointEventType;
  eventKey: string;
  pointsDelta: number;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const settings = useSettingsStore.getState().personalization;
  if (settings.rewardsOptIn !== true) return false;
  if (hasAwardedEventLocally(params.eventKey)) return false;

  try {
    const user = await ensureRewardsUserSynced();
    if (!user) return false;

    const result = await awardPointEvent(getPbUrl(), {
      userId: user.id,
      currentPoints: user.points_total,
      currentUnlocked: user.unlocked_rewards,
      eventType: params.eventType,
      eventKey: params.eventKey,
      pointsDelta: params.pointsDelta,
      metadata: params.metadata,
    });

    markEventAwardedLocally(params.eventKey);
    saveCachedRewardsUser({
      ...user,
      points_total: result.newPointsTotal,
      unlocked_rewards: computeUnlockedRewards(
        result.newPointsTotal,
        result.unlockedRewards
      ),
    });
    return result.awarded;
  } catch {
    return false;
  }
}

export async function awardHomeworkPoints(homeworkId: string): Promise<void> {
  if (!homeworkId) return;
  await tryAwardPoints({
    eventType: "homework_done",
    eventKey: `hw:${homeworkId}`,
    pointsDelta: 15,
    metadata: { homework_id: homeworkId },
  });

  const today = todayYmd();
  const lastDay = rewardsStorage.getString(KEY_STREAK_LAST_DATE);
  let streak = Number(rewardsStorage.getString(KEY_STREAK_COUNT) || "0") || 0;

  if (lastDay !== today) {
    streak = lastDay === yesterdayYmd() ? streak + 1 : 1;
    rewardsStorage.set(KEY_STREAK_LAST_DATE, today);
    rewardsStorage.set(KEY_STREAK_COUNT, String(streak));

    const cached = getCachedRewardsUser();
    if (cached?.id && useSettingsStore.getState().personalization.rewardsOptIn === true) {
      void updateUserProfile(getPbUrl(), cached.id, { streak_days: streak });
      saveCachedRewardsUser({ ...cached, streak_days: streak });
    }

    if (streak === 3 || streak === 7 || streak === 14 || streak === 30) {
      const bonusByMilestone: Record<number, number> = {
        3: 25,
        7: 50,
        14: 100,
        30: 150,
      };
      await tryAwardPoints({
        eventType: "streak_bonus",
        eventKey: `streak:${streak}:${today}`,
        pointsDelta: bonusByMilestone[streak],
        metadata: { streak_days: streak },
      });
    }
  }
}

export async function awardDailyCheckPoints(): Promise<void> {
  const today = todayYmd();
  await tryAwardPoints({
    eventType: "daily_check",
    eventKey: `daily:${today}`,
    pointsDelta: 5,
  });
}

export async function awardSharePoints(channel: ShareChannel): Promise<void> {
  const user = await ensureRewardsUserSynced();
  if (user?.id) {
    try {
      await recordShareStat(getPbUrl(), user.id, channel);
    } catch {
      // Non-fatal analytics failure
    }
  }
  const today = todayYmd();
  await tryAwardPoints({
    eventType: "share_app",
    eventKey: `share:${today}`,
    pointsDelta: 20,
    metadata: { channel },
  });
}

export async function addFriendByCode(friendCode: string) {
  const user = await ensureRewardsUserSynced();
  if (!user) {
    throw new Error("Active d'abord les Récompenses Papillon + pour ajouter des amis.");
  }
  const res = await addOrAcceptFriend(getPbUrl(), user, friendCode);
  const refreshed = await ensureRewardsUserSynced();
  return { ...res, user: refreshed ?? user };
}

export async function loadLeaderboardForScope(
  scope: LeaderboardScope
): Promise<PpUserRecord[]> {
  const user = await ensureRewardsUserSynced();
  if (!user) return [];
  return fetchLeaderboard(getPbUrl(), scope, user);
}

export async function equipRewardItem(rewardId: string, kind: "badge" | "theme" | "icon"): Promise<void> {
  const settings = useSettingsStore.getState();
  if (kind === "theme") {
    settings.mutateProperty("personalization", {
      rewardsCustomThemeId:
        settings.personalization.rewardsCustomThemeId === rewardId ? null : rewardId,
    });
    return;
  }

  settings.mutateProperty("personalization", { rewardsEquippedBadge: rewardId });
  const cached = getCachedRewardsUser();
  if (cached?.id && settings.personalization.rewardsOptIn === true) {
    const updated = await updateUserProfile(getPbUrl(), cached.id, {
      equipped_badge: rewardId,
    });
    if (updated) {
      saveCachedRewardsUser(updated);
    } else {
      saveCachedRewardsUser({ ...cached, equipped_badge: rewardId });
    }
  }
}
