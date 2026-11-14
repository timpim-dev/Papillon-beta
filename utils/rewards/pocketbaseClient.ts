import * as Crypto from "expo-crypto";

import type { Account } from "@/stores/account/types";
import { computeUnlockedRewards } from "./rewardsCatalog";

export const DEFAULT_POCKETBASE_URL = "https://pocketbase.felixx.dev";

export type LeaderboardScope = "friends" | "school" | "city" | "global";

export type PointEventType =
  | "homework_done"
  | "streak_bonus"
  | "friend_added"
  | "share_app"
  | "daily_check"
  | "achievement";

export type ShareChannel = "phone_qr" | "watch_qr" | "link_share";

export interface PpUserRecord {
  id: string;
  pronote_hash?: string;
  pseudo: string;
  avatar_emoji?: string;
  school_name?: string;
  city?: string;
  friend_code: string;
  points_total: number;
  streak_days: number;
  unlocked_rewards: string[];
  equipped_badge?: string;
  opt_in_leaderboards: boolean;
  app_version?: string;
  created?: string;
  updated?: string;
}

export interface PpFriendshipRecord {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  pair_key: string;
}

export interface OptInPopupInput {
  hasSignedInAccount: boolean;
  rewardsOptIn: boolean | null | undefined;
  rewardsAppOpenCount: number;
  currentAppVersion: string;
  rewardsLastPromptVersion?: string;
}

export function shouldShowRewardsOptInPopup(input: OptInPopupInput): boolean {
  if (!input.hasSignedInAccount) return false;
  if (input.rewardsOptIn === true) return false;

  if (input.rewardsAppOpenCount <= 1) return true;
  if (
    Boolean(input.currentAppVersion) &&
    input.currentAppVersion !== (input.rewardsLastPromptVersion ?? "")
  ) {
    return true;
  }
  if (input.rewardsAppOpenCount > 0 && input.rewardsAppOpenCount % 50 === 0) {
    return true;
  }
  return false;
}

export function makeFriendPairKey(idA: string, idB: string): string {
  return [idA.trim().toLowerCase(), idB.trim().toLowerCase()].sort().join("_");
}

export function generateFriendCode(seed?: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  if (seed && seed.length >= 8) {
    let out = "";
    for (let i = 0; i < 8; i++) {
      const code = seed.charCodeAt(i) % alphabet.length;
      out += alphabet[code];
    }
    return out;
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function buildPronoteIdentityInput(account?: Account): string {
  if (!account) return "pp_v1:anon:anon";
  const primaryService = account.services?.[0];
  const extra = primaryService?.additionals ?? {};
  const authExtra = primaryService?.auth?.additionals ?? {};
  const rawInstance =
    String(
      extra.instanceURL ??
        extra.url ??
        authExtra.instanceURL ??
        authExtra.url ??
        account.schoolName ??
        "local"
    )
      .trim()
      .toLowerCase();

  const rawUsername =
    String(
      extra.username ??
        authExtra.username ??
        primaryService?.id ??
        account.id
    )
      .trim()
      .toLowerCase();

  return `pp_v1:${rawInstance}:${rawUsername}`;
}

export async function computePronoteHash(account?: Account): Promise<string> {
  const raw = buildPronoteIdentityInput(account);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw
  );
  return digest.toLowerCase();
}

function normalizeBaseUrl(baseUrl?: string): string {
  const url = (baseUrl || DEFAULT_POCKETBASE_URL).trim().replace(/\/+$/, "");
  return url || DEFAULT_POCKETBASE_URL;
}

function escapePbFilterValue(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function pbJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; errorText: string }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: res.status, data: null, errorText: errText };
  }

  const data = (await res.json()) as T;
  return { ok: true, status: res.status, data, errorText: "" };
}

function normalizeUserRecord(raw: Record<string, unknown>): PpUserRecord {
  const unlockedRaw = raw.unlocked_rewards;
  const unlocked = Array.isArray(unlockedRaw)
    ? unlockedRaw.map(String)
    : [];
  return {
    id: String(raw.id ?? ""),
    pronote_hash: typeof raw.pronote_hash === "string" ? raw.pronote_hash : undefined,
    pseudo: String(raw.pseudo ?? "Élève Papillon"),
    avatar_emoji: typeof raw.avatar_emoji === "string" ? raw.avatar_emoji : "🦋",
    school_name: typeof raw.school_name === "string" ? raw.school_name : "",
    city: typeof raw.city === "string" ? raw.city : "",
    friend_code: String(raw.friend_code ?? ""),
    points_total: Number(raw.points_total ?? 0) || 0,
    streak_days: Number(raw.streak_days ?? 0) || 0,
    unlocked_rewards: computeUnlockedRewards(Number(raw.points_total ?? 0) || 0, unlocked),
    equipped_badge: typeof raw.equipped_badge === "string" ? raw.equipped_badge : "badge_starter",
    opt_in_leaderboards: Boolean(raw.opt_in_leaderboards),
    app_version: typeof raw.app_version === "string" ? raw.app_version : "",
    created: typeof raw.created === "string" ? raw.created : undefined,
    updated: typeof raw.updated === "string" ? raw.updated : undefined,
  };
}

export async function getUserById(
  baseUrl: string,
  userId: string
): Promise<PpUserRecord | null> {
  if (!userId) return null;
  const root = normalizeBaseUrl(baseUrl);
  const res = await pbJson<Record<string, unknown>>(
    `${root}/api/collections/pp_users/records/${encodeURIComponent(userId)}`
  );
  return res.ok && res.data ? normalizeUserRecord(res.data) : null;
}

export async function findUserByPronoteHash(
  baseUrl: string,
  pronoteHash: string
): Promise<PpUserRecord | null> {
  const root = normalizeBaseUrl(baseUrl);
  const filter = encodeURIComponent(`(pronote_hash='${escapePbFilterValue(pronoteHash)}')`);
  const res = await pbJson<{ items?: Record<string, unknown>[] }>(
    `${root}/api/collections/pp_users/records?filter=${filter}&perPage=1`
  );
  if (!res.ok || !res.data?.items?.length) {
    return null;
  }
  return normalizeUserRecord(res.data.items[0]);
}

export async function upsertUserByPronoteHash(
  baseUrl: string,
  params: {
    cachedUserId?: string;
    pronoteHash: string;
    pseudo: string;
    avatarEmoji?: string;
    schoolName?: string;
    city?: string;
    optInLeaderboards: boolean;
    appVersion?: string;
  }
): Promise<PpUserRecord> {
  const root = normalizeBaseUrl(baseUrl);

  if (params.cachedUserId) {
    const existingById = await getUserById(root, params.cachedUserId);
    if (existingById) {
      return existingById;
    }
  }

  const existingByHash = await findUserByPronoteHash(root, params.pronoteHash);
  if (existingByHash) {
    return existingByHash;
  }

  const friendCode = generateFriendCode(params.pronoteHash.toUpperCase());
  const createPayload = {
    pronote_hash: params.pronoteHash,
    pseudo: params.pseudo.trim().slice(0, 32) || "Élève Papillon",
    avatar_emoji: params.avatarEmoji || "🦋",
    school_name: (params.schoolName || "").trim().slice(0, 120),
    city: (params.city || "").trim().slice(0, 80),
    friend_code: friendCode,
    points_total: 0,
    streak_days: 0,
    unlocked_rewards: ["badge_starter"],
    equipped_badge: "badge_starter",
    opt_in_leaderboards: params.optInLeaderboards,
    app_version: (params.appVersion || "").slice(0, 32),
  };

  const created = await pbJson<Record<string, unknown>>(
    `${root}/api/collections/pp_users/records`,
    {
      method: "POST",
      body: JSON.stringify(createPayload),
    }
  );

  if (created.ok && created.data) {
    return normalizeUserRecord(created.data);
  }

  // Retry hash lookup in case another device created it concurrently
  const raceExisting = await findUserByPronoteHash(root, params.pronoteHash);
  if (raceExisting) {
    return raceExisting;
  }

  throw new Error(
    `Impossible de synchroniser le profil PocketBase (${created.status}): ${created.errorText.slice(0, 140)}`
  );
}

/**
 * NOTE: PocketBase pp_users updateRule enforces `@request.body.pronote_hash:isset = false`,
 * so `pronote_hash` must NEVER be sent inside PATCH requests.
 */
export async function updateUserProfile(
  baseUrl: string,
  userId: string,
  patch: Partial<{
    pseudo: string;
    avatar_emoji: string;
    school_name: string;
    city: string;
    points_total: number;
    streak_days: number;
    unlocked_rewards: string[];
    equipped_badge: string;
    opt_in_leaderboards: boolean;
    app_version: string;
  }>
): Promise<PpUserRecord | null> {
  if (!userId) return null;
  const root = normalizeBaseUrl(baseUrl);
  const safeBody: Record<string, unknown> = { ...patch };
  delete safeBody.pronote_hash;

  const res = await pbJson<Record<string, unknown>>(
    `${root}/api/collections/pp_users/records/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(safeBody),
    }
  );

  return res.ok && res.data ? normalizeUserRecord(res.data) : null;
}

export async function awardPointEvent(
  baseUrl: string,
  params: {
    userId: string;
    currentPoints: number;
    currentUnlocked?: string[];
    eventType: PointEventType;
    eventKey: string;
    pointsDelta: number;
    metadata?: Record<string, unknown>;
  }
): Promise<{
  awarded: boolean;
  newPointsTotal: number;
  unlockedRewards: string[];
}> {
  const root = normalizeBaseUrl(baseUrl);
  const res = await pbJson<Record<string, unknown>>(
    `${root}/api/collections/pp_point_events/records`,
    {
      method: "POST",
      body: JSON.stringify({
        user_id: params.userId,
        event_type: params.eventType,
        event_key: params.eventKey.slice(0, 120),
        points_delta: Math.max(1, Math.min(500, Math.round(params.pointsDelta))),
        metadata: params.metadata ?? {},
      }),
    }
  );

  if (!res.ok) {
    // Unique constraint on event_key means this event was already credited
    return {
      awarded: false,
      newPointsTotal: params.currentPoints,
      unlockedRewards: computeUnlockedRewards(
        params.currentPoints,
        params.currentUnlocked
      ),
    };
  }

  const freshUser = await getUserById(root, params.userId);
  const basePoints = freshUser?.points_total ?? params.currentPoints;
  const nextPoints = basePoints + params.pointsDelta;
  const unlockedRewards = computeUnlockedRewards(
    nextPoints,
    freshUser?.unlocked_rewards ?? params.currentUnlocked
  );

  await updateUserProfile(root, params.userId, {
    points_total: nextPoints,
    unlocked_rewards: unlockedRewards,
  });

  return {
    awarded: true,
    newPointsTotal: nextPoints,
    unlockedRewards,
  };
}

export async function findUserByFriendCode(
  baseUrl: string,
  friendCode: string
): Promise<PpUserRecord | null> {
  const root = normalizeBaseUrl(baseUrl);
  const cleaned = friendCode.trim().toUpperCase();
  if (!cleaned) return null;
  const filter = encodeURIComponent(`(friend_code='${escapePbFilterValue(cleaned)}')`);
  const res = await pbJson<{ items?: Record<string, unknown>[] }>(
    `${root}/api/collections/pp_users/records?filter=${filter}&perPage=1`
  );
  if (!res.ok || !res.data?.items?.length) return null;
  return normalizeUserRecord(res.data.items[0]);
}

export async function addOrAcceptFriend(
  baseUrl: string,
  myUser: PpUserRecord,
  friendCode: string
): Promise<{ friend: PpUserRecord; pointsAwarded: boolean }> {
  const root = normalizeBaseUrl(baseUrl);
  const target = await findUserByFriendCode(root, friendCode);
  if (!target) {
    throw new Error("Code ami introuvable sur Papillon +.");
  }
  if (target.id === myUser.id) {
    throw new Error("Tu ne peux pas t'ajouter toi-même.");
  }

  const pairKey = makeFriendPairKey(myUser.id, target.id);
  const filter = encodeURIComponent(`(pair_key='${escapePbFilterValue(pairKey)}')`);
  const existing = await pbJson<{ items?: PpFriendshipRecord[] }>(
    `${root}/api/collections/pp_friendships/records?filter=${filter}&perPage=1`
  );

  if (existing.ok && existing.data?.items?.length) {
    const row = existing.data.items[0];
    if (row.status === "pending") {
      await pbJson(
        `${root}/api/collections/pp_friendships/records/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "accepted" }),
        }
      );
    }
  } else {
    const created = await pbJson(
      `${root}/api/collections/pp_friendships/records`,
      {
        method: "POST",
        body: JSON.stringify({
          requester_id: myUser.id,
          addressee_id: target.id,
          status: "accepted",
          pair_key: pairKey,
        }),
      }
    );
    if (!created.ok) {
      throw new Error("Impossible d'ajouter cet ami pour le moment.");
    }
  }

  const reward = await awardPointEvent(root, {
    userId: myUser.id,
    currentPoints: myUser.points_total,
    currentUnlocked: myUser.unlocked_rewards,
    eventType: "friend_added",
    eventKey: `friend:${pairKey}:${myUser.id}`,
    pointsDelta: 50,
    metadata: { friend_id: target.id },
  });

  return { friend: target, pointsAwarded: reward.awarded };
}

export async function fetchLeaderboard(
  baseUrl: string,
  scope: LeaderboardScope,
  viewerUser: PpUserRecord
): Promise<PpUserRecord[]> {
  const root = normalizeBaseUrl(baseUrl);

  if (scope === "friends") {
    const relFilter = encodeURIComponent(
      `((requester_id='${escapePbFilterValue(viewerUser.id)}' || addressee_id='${escapePbFilterValue(
        viewerUser.id
      )}') && status='accepted')`
    );
    const relRes = await pbJson<{ items?: PpFriendshipRecord[] }>(
      `${root}/api/collections/pp_friendships/records?filter=${relFilter}&perPage=100`
    );

    const friendIds = new Set<string>([viewerUser.id]);
    for (const rel of relRes.data?.items ?? []) {
      if (rel.requester_id) friendIds.add(rel.requester_id);
      if (rel.addressee_id) friendIds.add(rel.addressee_id);
    }

    const idFilter = Array.from(friendIds)
      .slice(0, 40)
      .map(id => `id='${escapePbFilterValue(id)}'`)
      .join(" || ");

    const usersRes = await pbJson<{ items?: Record<string, unknown>[] }>(
      `${root}/api/collections/pp_users/records?filter=${encodeURIComponent(
        `(${idFilter})`
      )}&sort=-points_total&perPage=50`
    );
    return (usersRes.data?.items ?? []).map(normalizeUserRecord);
  }

  let filterExpr = "opt_in_leaderboards=true";
  if (scope === "school") {
    const school = (viewerUser.school_name || "").trim();
    if (!school) return [viewerUser];
    filterExpr += ` && school_name='${escapePbFilterValue(school)}'`;
  } else if (scope === "city") {
    const city = (viewerUser.city || "").trim();
    if (!city) return [viewerUser];
    filterExpr += ` && city='${escapePbFilterValue(city)}'`;
  }

  const res = await pbJson<{ items?: Record<string, unknown>[] }>(
    `${root}/api/collections/pp_users/records?filter=${encodeURIComponent(
      `(${filterExpr})`
    )}&sort=-points_total&perPage=50`
  );
  return (res.data?.items ?? []).map(normalizeUserRecord);
}

export async function recordShareStat(
  baseUrl: string,
  userId: string,
  channel: ShareChannel
): Promise<void> {
  if (!userId) return;
  const root = normalizeBaseUrl(baseUrl);
  const filter = encodeURIComponent(
    `(user_id='${escapePbFilterValue(userId)}' && channel='${channel}')`
  );
  const existing = await pbJson<{ items?: Array<{ id: string; share_count: number }> }>(
    `${root}/api/collections/pp_share_stats/records?filter=${filter}&perPage=1`
  );

  if (existing.ok && existing.data?.items?.length) {
    const item = existing.data.items[0];
    await pbJson(
      `${root}/api/collections/pp_share_stats/records/${encodeURIComponent(item.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ share_count: (item.share_count || 0) + 1 }),
      }
    );
    return;
  }

  await pbJson(`${root}/api/collections/pp_share_stats/records`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      channel,
      share_count: 1,
    }),
  });
}
