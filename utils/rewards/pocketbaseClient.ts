import * as Crypto from "expo-crypto";

import type { Account } from "@/stores/account/types";
import { computeUnlockedRewards } from "./rewardsCatalog";

export const DEFAULT_POCKETBASE_URL = "https://pocketbase.felixx.dev";

/**
 * Rich ADHD work reward event categories. Mapped onto PocketBase's deployed
 * `pp_point_events.event_type` enum (`toPocketBaseEventType`) so server-side
 * backup remains 100% compatible with existing collections.
 */
export type AdhdPointEventKind =
  | "task_kickoff"
  | "micro_step"
  | "focus_sprint"
  | "homework_done"
  | "early_bonus"
  | "audio_homework"
  | "comeback_bonus"
  | "daily_check";

export type PbPointEventType =
  | "homework_done"
  | "streak_bonus"
  | "daily_check"
  | "achievement";

export interface PpUserBackupRecord {
  id: string;
  pronote_hash?: string;
  pseudo: string;
  avatar_emoji?: string;
  points_total: number;
  streak_days: number;
  unlocked_rewards: string[];
  equipped_badge?: string;
  opt_in_leaderboards?: boolean;
  app_version?: string;
  created?: string;
  updated?: string;
}

export function toPocketBaseEventType(kind: AdhdPointEventKind): PbPointEventType {
  switch (kind) {
    case "homework_done":
    case "audio_homework":
      return "homework_done";
    case "comeback_bonus":
      return "streak_bonus";
    case "daily_check":
      return "daily_check";
    default:
      return "achievement";
  }
}

function generateInternalSyncCode(seed: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    const code = (seed.charCodeAt(i % Math.max(1, seed.length)) + i * 7) % alphabet.length;
    out += alphabet[code];
  }
  return out;
}

export function buildPronoteIdentityInput(account?: Account): string {
  if (!account) return "pp_v1:anon:anon";
  const primaryService = account.services?.[0];
  const extra = primaryService?.additionals ?? {};
  const authExtra = primaryService?.auth?.additionals ?? {};
  const rawInstance = String(
    extra.instanceURL ??
      extra.url ??
      authExtra.instanceURL ??
      authExtra.url ??
      account.schoolName ??
      "local"
  )
    .trim()
    .toLowerCase();

  const rawUsername = String(
    extra.username ?? authExtra.username ?? primaryService?.id ?? account.id
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

function normalizeUserRecord(raw: Record<string, unknown>): PpUserBackupRecord {
  const unlockedRaw = raw.unlocked_rewards;
  const unlocked = Array.isArray(unlockedRaw) ? unlockedRaw.map(String) : [];
  const points = Math.max(0, Number(raw.points_total ?? 0) || 0);
  return {
    id: String(raw.id ?? ""),
    pronote_hash: typeof raw.pronote_hash === "string" ? raw.pronote_hash : undefined,
    pseudo: String(raw.pseudo ?? "Élève Papillon"),
    avatar_emoji: typeof raw.avatar_emoji === "string" ? raw.avatar_emoji : "🦋",
    points_total: points,
    streak_days: Math.max(0, Number(raw.streak_days ?? 0) || 0),
    unlocked_rewards: computeUnlockedRewards(points, unlocked),
    equipped_badge: typeof raw.equipped_badge === "string" ? raw.equipped_badge : "badge_starter",
    app_version: typeof raw.app_version === "string" ? raw.app_version : "",
    created: typeof raw.created === "string" ? raw.created : undefined,
    updated: typeof raw.updated === "string" ? raw.updated : undefined,
  };
}

export async function getUserBackupById(
  baseUrl: string,
  userId: string
): Promise<PpUserBackupRecord | null> {
  if (!userId) return null;
  const root = normalizeBaseUrl(baseUrl);
  const res = await pbJson<Record<string, unknown>>(
    `${root}/api/collections/pp_users/records/${encodeURIComponent(userId)}`
  );
  return res.ok && res.data ? normalizeUserRecord(res.data) : null;
}

export async function findUserBackupByPronoteHash(
  baseUrl: string,
  pronoteHash: string
): Promise<PpUserBackupRecord | null> {
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

export async function upsertPrivateUserBackup(
  baseUrl: string,
  params: {
    cachedUserId?: string;
    pronoteHash: string;
    displayName: string;
    initialPoints?: number;
    initialStreak?: number;
    unlockedRewards?: string[];
    equippedBadge?: string;
    appVersion?: string;
  }
): Promise<PpUserBackupRecord> {
  const root = normalizeBaseUrl(baseUrl);

  if (params.cachedUserId) {
    const existingById = await getUserBackupById(root, params.cachedUserId);
    if (existingById) return existingById;
  }

  const existingByHash = await findUserBackupByPronoteHash(root, params.pronoteHash);
  if (existingByHash) return existingByHash;

  const initialPoints = Math.max(0, Math.round(params.initialPoints ?? 0));
  const createPayload = {
    pronote_hash: params.pronoteHash,
    pseudo: (params.displayName.trim() || "Élève Papillon").slice(0, 32),
    avatar_emoji: "🦋",
    friend_code: generateInternalSyncCode(params.pronoteHash.toUpperCase()),
    points_total: initialPoints,
    streak_days: Math.max(0, Math.round(params.initialStreak ?? 0)),
    unlocked_rewards: computeUnlockedRewards(initialPoints, params.unlockedRewards ?? ["badge_starter"]),
    equipped_badge: params.equippedBadge || "badge_starter",
    opt_in_leaderboards: false,
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

  const raceExisting = await findUserBackupByPronoteHash(root, params.pronoteHash);
  if (raceExisting) return raceExisting;

  throw new Error(
    `Impossible de sauvegarder sur PocketBase (${created.status}): ${created.errorText.slice(0, 140)}`
  );
}

/**
 * NOTE: PocketBase `pp_users` updateRule enforces `@request.body.pronote_hash:isset = false`,
 * so `pronote_hash` must NEVER be sent in PATCH requests.
 */
export async function updateUserBackup(
  baseUrl: string,
  userId: string,
  patch: Partial<{
    pseudo: string;
    points_total: number;
    streak_days: number;
    unlocked_rewards: string[];
    equipped_badge: string;
    opt_in_leaderboards: boolean;
    app_version: string;
  }>
): Promise<PpUserBackupRecord | null> {
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

export async function backupPointEventToPocketBase(
  baseUrl: string,
  params: {
    userId: string;
    currentRemotePoints: number;
    currentUnlocked?: string[];
    kind: AdhdPointEventKind;
    eventKey: string;
    pointsDelta: number;
    metadata?: Record<string, unknown>;
  }
): Promise<{
  backedUp: boolean;
  newRemotePoints: number;
  unlockedRewards: string[];
}> {
  const root = normalizeBaseUrl(baseUrl);
  const clampedDelta = Math.max(1, Math.min(500, Math.round(params.pointsDelta)));
  const res = await pbJson<Record<string, unknown>>(
    `${root}/api/collections/pp_point_events/records`,
    {
      method: "POST",
      body: JSON.stringify({
        user_id: params.userId,
        event_type: toPocketBaseEventType(params.kind),
        event_key: params.eventKey.slice(0, 120),
        points_delta: clampedDelta,
        metadata: {
          adhd_action: params.kind,
          ...(params.metadata ?? {}),
        },
      }),
    }
  );

  if (!res.ok) {
    return {
      backedUp: false,
      newRemotePoints: params.currentRemotePoints,
      unlockedRewards: computeUnlockedRewards(
        params.currentRemotePoints,
        params.currentUnlocked
      ),
    };
  }

  const freshUser = await getUserBackupById(root, params.userId);
  const basePoints = freshUser?.points_total ?? params.currentRemotePoints;
  const nextPoints = Math.max(0, basePoints + clampedDelta);
  const unlockedRewards = computeUnlockedRewards(
    nextPoints,
    freshUser?.unlocked_rewards ?? params.currentUnlocked
  );

  await updateUserBackup(root, params.userId, {
    points_total: nextPoints,
    unlocked_rewards: unlockedRewards,
    opt_in_leaderboards: false,
  });

  return {
    backedUp: true,
    newRemotePoints: nextPoints,
    unlockedRewards,
  };
}
