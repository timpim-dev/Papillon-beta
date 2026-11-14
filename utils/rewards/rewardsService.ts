import { createMMKV } from "react-native-mmkv";

import packageJson from "@/package.json";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";

import {
  AdhdPointEventKind,
  backupPointEventToPocketBase,
  computePronoteHash,
  DEFAULT_POCKETBASE_URL,
  PpUserBackupRecord,
  updateUserBackup,
  upsertPrivateUserBackup,
} from "./pocketbaseClient";
import {
  computeUnlockedRewards,
  CustomPersonalReward,
  DEFAULT_CUSTOM_REWARDS,
} from "./rewardsCatalog";

const rewardsStorage = createMMKV({ id: "papillon-rewards" });

const KEY_LOCAL_STATE = "adhd_rewards_local_state_v2";
const KEY_LEGACY_USER_RECORD = "user_record_json";
const KEY_AWARDED_EVENTS = "awarded_event_keys";
const KEY_PENDING_BACKUP_EVENTS = "pending_pb_events";
const KEY_CUSTOM_REWARDS = "custom_personal_rewards";
const KEY_MICRO_STEPS = "task_micro_steps_map";

export interface TaskMicroStep {
  id: string;
  label: string;
  done: boolean;
}

export interface PointActivityEntry {
  key: string;
  kind: AdhdPointEventKind | "reward_redeemed";
  label: string;
  delta: number;
  at: number;
}

export interface AdhdRewardsLocalState {
  totalEarnedPoints: number;
  spentPoints: number;
  focusMinutesTotal: number;
  focusMinutesToday: number;
  focusTodayYmd: string;
  activeDaysCount: number;
  lastActiveYmd: string;
  sessionsCompleted: number;
  tasksCompleted: number;
  recentActivity: PointActivityEntry[];
  remoteBackupUserId?: string;
  lastBackupAt?: number;
}

interface PendingBackupEvent {
  kind: AdhdPointEventKind;
  eventKey: string;
  pointsDelta: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_LOCAL_STATE: AdhdRewardsLocalState = {
  totalEarnedPoints: 0,
  spentPoints: 0,
  focusMinutesTotal: 0,
  focusMinutesToday: 0,
  focusTodayYmd: "",
  activeDaysCount: 0,
  lastActiveYmd: "",
  sessionsCompleted: 0,
  tasksCompleted: 0,
  recentActivity: [],
};

export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = rewardsStorage.getString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  rewardsStorage.set(key, JSON.stringify(value));
}

function getPbUrl(): string {
  return (
    useSettingsStore.getState().personalization.rewardsPocketBaseUrl ||
    DEFAULT_POCKETBASE_URL
  );
}

function isBackupEnabled(): boolean {
  return useSettingsStore.getState().personalization.rewardsPocketBaseBackupEnabled ?? true;
}

export function getAdhdRewardsState(): AdhdRewardsLocalState {
  const current = readJson<AdhdRewardsLocalState | null>(KEY_LOCAL_STATE, null);
  const today = todayYmd();

  if (current) {
    return {
      ...DEFAULT_LOCAL_STATE,
      ...current,
      focusMinutesToday: current.focusTodayYmd === today ? current.focusMinutesToday : 0,
      focusTodayYmd: today,
    };
  }

  // Migrate any points already accumulated in v1 cache smoothly.
  const legacy = readJson<PpUserBackupRecord | null>(KEY_LEGACY_USER_RECORD, null);
  const migrated: AdhdRewardsLocalState = {
    ...DEFAULT_LOCAL_STATE,
    totalEarnedPoints: Math.max(0, legacy?.points_total ?? 0),
    activeDaysCount: Math.max(0, legacy?.streak_days ?? 0),
    focusTodayYmd: today,
    remoteBackupUserId: legacy?.id,
  };
  writeJson(KEY_LOCAL_STATE, migrated);
  return migrated;
}

export function getSpendablePoints(state: AdhdRewardsLocalState = getAdhdRewardsState()): number {
  return Math.max(0, state.totalEarnedPoints - state.spentPoints);
}

function saveAdhdRewardsState(next: AdhdRewardsLocalState): AdhdRewardsLocalState {
  writeJson(KEY_LOCAL_STATE, next);
  const settings = useSettingsStore.getState();
  const unlocked = computeUnlockedRewards(
    next.totalEarnedPoints,
    settings.personalization.rewardsUnlockedIds ?? ["badge_starter"]
  );
  settings.mutateProperty("personalization", {
    rewardsUnlockedIds: unlocked,
    rewardsEquippedBadge: settings.personalization.rewardsEquippedBadge ?? "badge_starter",
  });
  return next;
}

function hasAwardedEvent(eventKey: string): boolean {
  const arr = readJson<string[]>(KEY_AWARDED_EVENTS, []);
  return Array.isArray(arr) && arr.includes(eventKey);
}

function markEventAwarded(eventKey: string): void {
  const arr = readJson<string[]>(KEY_AWARDED_EVENTS, []);
  if (!arr.includes(eventKey)) {
    arr.push(eventKey);
    writeJson(KEY_AWARDED_EVENTS, arr.slice(-400));
  }
}

function enqueueBackupEvent(ev: PendingBackupEvent): void {
  const queue = readJson<PendingBackupEvent[]>(KEY_PENDING_BACKUP_EVENTS, []);
  if (!queue.some(item => item.eventKey === ev.eventKey)) {
    queue.push(ev);
    writeJson(KEY_PENDING_BACKUP_EVENTS, queue.slice(-100));
  }
}

export async function syncRewardsWithPocketBaseBackup(): Promise<AdhdRewardsLocalState> {
  let state = getAdhdRewardsState();
  if (!isBackupEnabled()) return state;

  const accountState = useAccountStore.getState();
  const activeAccount =
    accountState.accounts.find(a => a.id === accountState.lastUsedAccount) ??
    accountState.accounts[0];
  if (!activeAccount) return state;

  try {
    const pronoteHash = await computePronoteHash(activeAccount);
    const pbUrl = getPbUrl();
    const settings = useSettingsStore.getState().personalization;

    const remote = await upsertPrivateUserBackup(pbUrl, {
      cachedUserId: state.remoteBackupUserId,
      pronoteHash,
      displayName: activeAccount.firstName?.trim() || "Élève Papillon",
      initialPoints: state.totalEarnedPoints,
      initialStreak: state.activeDaysCount,
      unlockedRewards: settings.rewardsUnlockedIds ?? ["badge_starter"],
      equippedBadge: settings.rewardsEquippedBadge ?? "badge_starter",
      appVersion: String(packageJson.version ?? "1.0.0"),
    });

    // Replay any queued offline point events idempotently (unique index on event_key).
    const queue = readJson<PendingBackupEvent[]>(KEY_PENDING_BACKUP_EVENTS, []);
    const remaining: PendingBackupEvent[] = [];
    let latestRemotePoints = remote.points_total;

    for (const ev of queue) {
      try {
        const res = await backupPointEventToPocketBase(pbUrl, {
          userId: remote.id,
          currentRemotePoints: latestRemotePoints,
          currentUnlocked: remote.unlocked_rewards,
          kind: ev.kind,
          eventKey: ev.eventKey,
          pointsDelta: ev.pointsDelta,
          metadata: ev.metadata,
        });
        if (res.backedUp) {
          latestRemotePoints = res.newRemotePoints;
        }
      } catch {
        remaining.push(ev);
      }
    }
    writeJson(KEY_PENDING_BACKUP_EVENTS, remaining);

    // If the student already earned points locally before first sync, reconcile upward safely.
    const mergedPoints = Math.max(state.totalEarnedPoints, latestRemotePoints);
    if (mergedPoints > latestRemotePoints) {
      await updateUserBackup(pbUrl, remote.id, {
        points_total: mergedPoints,
        streak_days: Math.max(state.activeDaysCount, remote.streak_days),
        unlocked_rewards: computeUnlockedRewards(mergedPoints, remote.unlocked_rewards),
        equipped_badge: settings.rewardsEquippedBadge ?? remote.equipped_badge ?? "badge_starter",
        opt_in_leaderboards: false,
        app_version: String(packageJson.version ?? "1.0.0"),
      });
    } else if (remote.opt_in_leaderboards !== undefined) {
      // Ensure legacy account is never exposed on public leaderboards.
      void updateUserBackup(pbUrl, remote.id, {
        opt_in_leaderboards: false,
        equipped_badge: settings.rewardsEquippedBadge ?? remote.equipped_badge ?? "badge_starter",
      });
    }

    state = saveAdhdRewardsState({
      ...state,
      totalEarnedPoints: mergedPoints,
      activeDaysCount: Math.max(state.activeDaysCount, remote.streak_days),
      remoteBackupUserId: remote.id,
      lastBackupAt: Date.now(),
    });
  } catch {
    // Non-fatal offline backup; local ADHD rewards continue uninterrupted.
  }

  return state;
}

function recordActiveWorkDay(
  state: AdhdRewardsLocalState,
  now: Date = new Date()
): { nextState: AdhdRewardsLocalState; isComeback: boolean } {
  const today = todayYmd(now);
  if (state.lastActiveYmd === today) {
    return { nextState: state, isComeback: false };
  }

  let isComeback = false;
  if (state.lastActiveYmd) {
    const prevMs = new Date(`${state.lastActiveYmd}T12:00:00`).getTime();
    const todayMs = new Date(`${today}T12:00:00`).getTime();
    const gapDays = Math.round((todayMs - prevMs) / 86_400_000);
    if (gapDays >= 2) {
      isComeback = true;
    }
  }

  return {
    nextState: {
      ...state,
      activeDaysCount: state.activeDaysCount + 1,
      lastActiveYmd: today,
    },
    isComeback,
  };
}

export async function awardWorkPoints(params: {
  kind: AdhdPointEventKind;
  eventKey: string;
  pointsDelta: number;
  label: string;
  focusMinutes?: number;
  completedTask?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<{ awarded: boolean; delta: number; totalEarnedPoints: number }> {
  if (params.pointsDelta <= 0) {
    return {
      awarded: false,
      delta: 0,
      totalEarnedPoints: getAdhdRewardsState().totalEarnedPoints,
    };
  }
  if (hasAwardedEvent(params.eventKey)) {
    return {
      awarded: false,
      delta: 0,
      totalEarnedPoints: getAdhdRewardsState().totalEarnedPoints,
    };
  }

  markEventAwarded(params.eventKey);
  const now = new Date();
  const base = getAdhdRewardsState();
  const { nextState: withDay, isComeback } = recordActiveWorkDay(base, now);

  let totalDelta = Math.round(params.pointsDelta);
  const activity = [...withDay.recentActivity];
  activity.unshift({
    key: params.eventKey,
    kind: params.kind,
    label: params.label,
    delta: totalDelta,
    at: now.getTime(),
  });

  if (isComeback) {
    const comebackKey = `comeback:${todayYmd(now)}`;
    if (!hasAwardedEvent(comebackKey)) {
      markEventAwarded(comebackKey);
      totalDelta += 15;
      activity.unshift({
        key: comebackKey,
        kind: "comeback_bonus",
        label: "Bonus reprise sans pression",
        delta: 15,
        at: now.getTime(),
      });
      enqueueBackupEvent({
        kind: "comeback_bonus",
        eventKey: comebackKey,
        pointsDelta: 15,
      });
    }
  }

  const next = saveAdhdRewardsState({
    ...withDay,
    totalEarnedPoints: withDay.totalEarnedPoints + totalDelta,
    focusMinutesTotal: withDay.focusMinutesTotal + (params.focusMinutes ?? 0),
    focusMinutesToday: withDay.focusMinutesToday + (params.focusMinutes ?? 0),
    sessionsCompleted: withDay.sessionsCompleted + (params.focusMinutes ? 1 : 0),
    tasksCompleted: withDay.tasksCompleted + (params.completedTask ? 1 : 0),
    recentActivity: activity.slice(0, 25),
  });

  enqueueBackupEvent({
    kind: params.kind,
    eventKey: params.eventKey,
    pointsDelta: params.pointsDelta,
    metadata: params.metadata,
  });

  // Fire-and-forget private PocketBase backup sync.
  void syncRewardsWithPocketBaseBackup();

  return {
    awarded: true,
    delta: totalDelta,
    totalEarnedPoints: next.totalEarnedPoints,
  };
}

export async function awardTaskKickoffPoints(homeworkId: string): Promise<boolean> {
  if (!homeworkId) return false;
  const res = await awardWorkPoints({
    kind: "task_kickoff",
    eventKey: `kickoff:${homeworkId}`,
    pointsDelta: 5,
    label: "Démarrage sans blocage",
    metadata: { homework_id: homeworkId },
  });
  return res.awarded;
}

export async function awardMicroStepPoints(
  homeworkId: string,
  stepId: string
): Promise<boolean> {
  if (!homeworkId || !stepId) return false;
  const res = await awardWorkPoints({
    kind: "micro_step",
    eventKey: `step:${homeworkId}:${stepId}`,
    pointsDelta: 5,
    label: "Micro-étape terminée",
    metadata: { homework_id: homeworkId, step_id: stepId },
  });
  return res.awarded;
}

export async function awardFocusSprintPoints(
  workedMinutes: number,
  homeworkId?: string
): Promise<{ awarded: boolean; delta: number }> {
  const mins = Math.max(0, Math.round(workedMinutes));
  if (mins < 2) return { awarded: false, delta: 0 };

  const points = mins >= 25 ? 35 : mins >= 15 ? 25 : mins >= 10 ? 15 : 8;
  const bucket = Math.floor(Date.now() / 60_000);
  const res = await awardWorkPoints({
    kind: "focus_sprint",
    eventKey: `sprint:${homeworkId || "general"}:${bucket}:${mins}`,
    pointsDelta: points,
    label: `Session Focus (${mins} min)`,
    focusMinutes: mins,
    metadata: { minutes: mins, homework_id: homeworkId ?? null },
  });
  return { awarded: res.awarded, delta: res.delta };
}

export async function awardAudioHomeworkPoints(homeworkId: string): Promise<boolean> {
  if (!homeworkId) return false;
  const res = await awardWorkPoints({
    kind: "audio_homework",
    eventKey: `audio_hw:${homeworkId}`,
    pointsDelta: 20,
    label: "Devoir audio envoyé",
    metadata: { homework_id: homeworkId },
  });
  return res.awarded;
}

export async function awardHomeworkPoints(
  homeworkId: string,
  dueDate?: Date | number | string
): Promise<void> {
  if (!homeworkId) return;
  const dueMs = dueDate ? new Date(dueDate).getTime() : NaN;
  const isEarly = Number.isFinite(dueMs) && dueMs - Date.now() >= 24 * 3_600_000;

  await awardWorkPoints({
    kind: "homework_done",
    eventKey: `hw:${homeworkId}`,
    pointsDelta: isEarly ? 25 : 15,
    label: isEarly ? "Devoir terminé en avance" : "Devoir terminé",
    completedTask: true,
    metadata: { homework_id: homeworkId, early: isEarly },
  });
}

export async function awardDailyCheckPoints(): Promise<void> {
  const today = todayYmd();
  await awardWorkPoints({
    kind: "daily_check",
    eventKey: `daily:${today}`,
    pointsDelta: 5,
    label: "Ouverture & organisation du jour",
  });
}

export function getTaskMicroSteps(homeworkId: string): TaskMicroStep[] {
  if (!homeworkId) return [];
  const all = readJson<Record<string, TaskMicroStep[]>>(KEY_MICRO_STEPS, {});
  return all[homeworkId] ?? [];
}

export function saveTaskMicroSteps(homeworkId: string, steps: TaskMicroStep[]): TaskMicroStep[] {
  if (!homeworkId) return steps;
  const all = readJson<Record<string, TaskMicroStep[]>>(KEY_MICRO_STEPS, {});
  all[homeworkId] = steps;
  writeJson(KEY_MICRO_STEPS, all);
  return steps;
}

export function getCustomPersonalRewards(): CustomPersonalReward[] {
  const saved = readJson<CustomPersonalReward[] | null>(KEY_CUSTOM_REWARDS, null);
  if (saved && saved.length > 0) return saved;
  writeJson(KEY_CUSTOM_REWARDS, DEFAULT_CUSTOM_REWARDS);
  return DEFAULT_CUSTOM_REWARDS;
}

export function addCustomPersonalReward(
  title: string,
  emoji: string,
  costPoints: number
): CustomPersonalReward[] {
  const trimmed = title.trim();
  if (!trimmed) return getCustomPersonalRewards();
  const next: CustomPersonalReward[] = [
    {
      id: `custom_${Date.now()}`,
      title: trimmed.slice(0, 60),
      emoji: (emoji.trim() || "🎁").slice(0, 4),
      costPoints: Math.max(5, Math.min(1000, Math.round(costPoints))),
      redeemedCount: 0,
      createdAt: Date.now(),
    },
    ...getCustomPersonalRewards(),
  ];
  writeJson(KEY_CUSTOM_REWARDS, next);
  return next;
}

export function deleteCustomPersonalReward(id: string): CustomPersonalReward[] {
  const next = getCustomPersonalRewards().filter(r => r.id !== id);
  writeJson(KEY_CUSTOM_REWARDS, next);
  return next;
}

export function redeemCustomPersonalReward(id: string): {
  ok: boolean;
  reason?: string;
  state: AdhdRewardsLocalState;
  rewards: CustomPersonalReward[];
} {
  const rewards = getCustomPersonalRewards();
  const target = rewards.find(r => r.id === id);
  const state = getAdhdRewardsState();
  if (!target) {
    return { ok: false, reason: "Récompense introuvable.", state, rewards };
  }
  const available = getSpendablePoints(state);
  if (available < target.costPoints) {
    return {
      ok: false,
      reason: `Il te manque ${target.costPoints - available} pts pour cette récompense.`,
      state,
      rewards,
    };
  }

  const nextRewards = rewards.map(r =>
    r.id === id ? { ...r, redeemedCount: (r.redeemedCount || 0) + 1 } : r
  );
  writeJson(KEY_CUSTOM_REWARDS, nextRewards);

  const nextState = saveAdhdRewardsState({
    ...state,
    spentPoints: state.spentPoints + target.costPoints,
    recentActivity: [
      {
        key: `redeem:${id}:${Date.now()}`,
        kind: "reward_redeemed" as const,
        label: `Récompense débloquée : ${target.title}`,
        delta: -target.costPoints,
        at: Date.now(),
      },
      ...state.recentActivity,
    ].slice(0, 25),
  });

  return { ok: true, state: nextState, rewards: nextRewards };
}

export async function equipRewardItem(
  rewardId: string,
  kind: "badge" | "theme" | "icon"
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (kind === "theme") {
    settings.mutateProperty("personalization", {
      rewardsCustomThemeId:
        settings.personalization.rewardsCustomThemeId === rewardId ? null : rewardId,
    });
    return;
  }

  settings.mutateProperty("personalization", { rewardsEquippedBadge: rewardId });
  const state = getAdhdRewardsState();
  if (state.remoteBackupUserId && isBackupEnabled()) {
    await updateUserBackup(getPbUrl(), state.remoteBackupUserId, {
      equipped_badge: rewardId,
    });
  }
}
