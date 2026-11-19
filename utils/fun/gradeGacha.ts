import { createMMKV } from "react-native-mmkv";

import { Grade } from "@/services/shared/grade";

export type GachaRarityTier =
  | "nul"
  | "commun"
  | "peu_commun"
  | "rare"
  | "super_rare"
  | "epic"
  | "legendary"
  | "mythic";

export type FunOpeningStyle = "envelope" | "gift";

export interface GachaRarityConfig {
  tier: GachaRarityTier;
  label: string;
  iconName:
    | "Ghost"
    | "Mail"
    | "Archive"
    | "Grades"
    | "Star"
    | "Sparkles"
    | "Crown"
    | "Butterfly";
  color: string;
  quips: string[];
}

export const GACHA_RARITIES: Record<GachaRarityTier, GachaRarityConfig> = {
  nul: {
    tier: "nul",
    label: "Nul",
    iconName: "Ghost",
    color: "#64748B",
    quips: [
      "Accident de parcours, la prochaine remontera vite.",
      "On efface et on repart sur le prochain devoir.",
      "Coup dur, mais ce n'est qu'une note parmi d'autres.",
    ],
  },
  commun: {
    tier: "commun",
    label: "Commun",
    iconName: "Mail",
    color: "#78716C",
    quips: [
      "Un point de départ pour progresser au prochain contrôle.",
      "Ça reste à portée, tu peux viser plus haut la prochaine fois.",
      "Noté et enregistré, cap sur la suite.",
    ],
  },
  peu_commun: {
    tier: "peu_commun",
    label: "Peu commun",
    iconName: "Archive",
    color: "#10B981",
    quips: [
      "Des bases encourageantes, encore un petit effort.",
      "Juste en dessous de la moyenne, c'est tout proche.",
      "Ça progresse, le prochain palier est à portée.",
    ],
  },
  rare: {
    tier: "rare",
    label: "Rare",
    iconName: "Grades",
    color: "#3B82F6",
    quips: [
      "Moyenne assurée, le cap est solide.",
      "Résultat propre, tu es dans le rythme.",
      "Palier Rare atteint, continue sur cette lancée.",
    ],
  },
  super_rare: {
    tier: "super_rare",
    label: "Super Rare",
    iconName: "Star",
    color: "#6366F1",
    quips: [
      "Beau résultat, bien au-dessus de la moyenne.",
      "Très solide, ça paye régulièrement.",
      "Mention Super Rare débloquée.",
    ],
  },
  epic: {
    tier: "epic",
    label: "Épique",
    iconName: "Sparkles",
    color: "#A855F7",
    quips: [
      "Excellente maîtrise du sujet, bravo.",
      "Grosse performance, tu fais clairement la différence.",
      "Tirage Épique mérité.",
    ],
  },
  legendary: {
    tier: "legendary",
    label: "Légendaire",
    iconName: "Crown",
    color: "#F59E0B",
    quips: [
      "Quasi sans-faute, niveau impressionnant.",
      "Tout en haut du classement sur ce devoir.",
      "Tirage Légendaire : maîtrise quasi totale.",
    ],
  },
  mythic: {
    tier: "mythic",
    label: "Mythique",
    iconName: "Butterfly",
    color: "#E11D48",
    quips: [
      "Score parfait ! Rien à redire, c'est un sans-faute.",
      "20/20 validé : tu viens de décrocher le rang Mythique.",
      "Perfection absolue sur cette évaluation.",
    ],
  },
};

export const GACHA_TIER_ORDER: GachaRarityTier[] = [
  "nul",
  "commun",
  "peu_commun",
  "rare",
  "super_rare",
  "epic",
  "legendary",
  "mythic",
];

export interface EvaluatedGradeGacha {
  tier: GachaRarityTier;
  config: GachaRarityConfig;
  normalizedOutOf20: number | null;
  upgradePath: [GachaRarityTier, GachaRarityTier, GachaRarityTier, GachaRarityTier];
  quip: string;
  deltaFromClass20: number | null;
  isClassMax: boolean;
}

const STORAGE_ID = "papillon-fun-mode";
const OPENED_IDS_KEY = "opened_grade_gacha_ids_v1";
const OPENED_SIGNATURES_KEY = "opened_grade_gacha_sigs_v1";
const STATS_KEY = "gacha_collection_stats_v2";

const funStorage = createMMKV({ id: STORAGE_ID });
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeGradeGachaUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function normalizeScoreTo20(
  value?: number,
  outOf?: number
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const max = typeof outOf === "number" && Number.isFinite(outOf) && outOf > 0 ? outOf : 20;
  return (value / max) * 20;
}

/**
 * Maps a normalized /20 score into the 8-tier rarity scale:
 * - nul: [0, 3)
 * - commun: [3, 6)
 * - peu_commun: [6, 9)
 * - rare: [9, 12)
 * - super_rare: [12, 14)
 * - epic: [14, 17)
 * - legendary: [17, 20) (i.e. 17 to 19.99/20)
 * - mythic: >= 20 (i.e. 20/20 or equivalent like 10/10, 5/5, 100%, or bonus >20)
 */
export function getRarityTierForNormalized20(normalized20: number | null): GachaRarityTier {
  if (normalized20 === null) return "commun";
  if (normalized20 >= 19.999) return "mythic";
  if (normalized20 >= 17) return "legendary";
  if (normalized20 >= 14) return "epic";
  if (normalized20 >= 12) return "super_rare";
  if (normalized20 >= 9) return "rare";
  if (normalized20 >= 6) return "peu_commun";
  if (normalized20 >= 3) return "commun";
  return "nul";
}

export function buildUpgradePath(
  targetTier: GachaRarityTier
): [GachaRarityTier, GachaRarityTier, GachaRarityTier, GachaRarityTier] {
  switch (targetTier) {
    case "nul":
      return ["nul", "nul", "nul", "nul"];
    case "commun":
      return ["nul", "commun", "commun", "commun"];
    case "peu_commun":
      return ["commun", "commun", "peu_commun", "peu_commun"];
    case "rare":
      return ["commun", "peu_commun", "rare", "rare"];
    case "super_rare":
      return ["commun", "rare", "super_rare", "super_rare"];
    case "epic":
      return ["peu_commun", "rare", "super_rare", "epic"];
    case "legendary":
      return ["rare", "super_rare", "epic", "legendary"];
    case "mythic":
      return ["rare", "epic", "legendary", "mythic"];
  }
}

export function evaluateGradeGacha(grade: Grade): EvaluatedGradeGacha {
  const score = grade.studentScore;
  const outOfValue = grade.outOf?.value ?? 20;
  const usable = Boolean(score && !score.disabled && typeof score.value === "number");
  const normalizedOutOf20 = usable ? normalizeScoreTo20(score?.value, outOfValue) : null;

  const classAvg20 =
    grade.averageScore && !grade.averageScore.disabled
      ? normalizeScoreTo20(grade.averageScore.value, outOfValue)
      : null;

  const isClassMax = Boolean(
    usable &&
      grade.maxScore &&
      !grade.maxScore.disabled &&
      typeof grade.maxScore.value === "number" &&
      (score?.value ?? 0) >= grade.maxScore.value &&
      grade.maxScore.value > 0
  );

  const tier = getRarityTierForNormalized20(normalizedOutOf20);
  const config = GACHA_RARITIES[tier];
  const quipIndex = stableHash(`${grade.id}:${grade.description ?? ""}`) % config.quips.length;

  return {
    tier,
    config,
    normalizedOutOf20,
    upgradePath: buildUpgradePath(tier),
    quip: config.quips[quipIndex],
    deltaFromClass20:
      normalizedOutOf20 !== null && classAvg20 !== null
        ? Number((normalizedOutOf20 - classAvg20).toFixed(2))
        : null,
    isClassMax,
  };
}

export function getGradeGachaKey(gradeOrId: Grade | string): string {
  if (typeof gradeOrId === "string") {
    return gradeOrId;
  }
  const datePart = gradeOrId.givenAt
    ? new Date(gradeOrId.givenAt).toISOString().slice(0, 10)
    : "";
  const subjectPart = (gradeOrId.subjectName ?? gradeOrId.subjectId ?? "").trim().toLowerCase();
  const scorePart = gradeOrId.studentScore?.value ?? "";
  const outOfPart = gradeOrId.outOf?.value ?? "";
  const descPart = (gradeOrId.description ?? "").trim().toLowerCase();
  return `gacha:${subjectPart}:${scorePart}/${outOfPart}:${datePart}:${descPart}`;
}

function readOpenedIds(): string[] {
  const raw = funStorage.getString(OPENED_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readOpenedSignatures(): string[] {
  const raw = funStorage.getString(OPENED_SIGNATURES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isGradeGachaOpened(gradeOrId: Grade | string): boolean {
  if (!gradeOrId) return true;
  if (typeof gradeOrId === "string") {
    return readOpenedIds().includes(gradeOrId) || readOpenedSignatures().includes(gradeOrId);
  }
  const id = gradeOrId.id;
  const sig = getGradeGachaKey(gradeOrId);
  if (id && readOpenedIds().includes(id)) return true;
  return readOpenedSignatures().includes(sig);
}

export function getOpenedGradeGachaCount(): number {
  return Math.max(readOpenedIds().length, readOpenedSignatures().length);
}

export function getEmptyGachaStats(): Record<GachaRarityTier, number> {
  return {
    nul: 0,
    commun: 0,
    peu_commun: 0,
    rare: 0,
    super_rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  };
}

export function getGachaCollectionStats(): Record<GachaRarityTier, number> {
  const empty = getEmptyGachaStats();
  const raw = funStorage.getString(STATS_KEY);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<GachaRarityTier, unknown>>;
    for (const tier of GACHA_TIER_ORDER) {
      if (typeof parsed[tier] === "number" && Number.isFinite(parsed[tier])) {
        empty[tier] = parsed[tier] as number;
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

export function markGradeGachaOpened(
  gradeOrId: Grade | string,
  tier?: GachaRarityTier
): void {
  if (!gradeOrId) return;
  const wasAlreadyOpened = isGradeGachaOpened(gradeOrId);
  const id = typeof gradeOrId === "string" ? gradeOrId : gradeOrId.id;
  const sig = typeof gradeOrId === "string" ? undefined : getGradeGachaKey(gradeOrId);

  let changed = false;
  if (id) {
    const existingIds = readOpenedIds();
    if (!existingIds.includes(id)) {
      funStorage.set(OPENED_IDS_KEY, JSON.stringify([...existingIds, id].slice(-500)));
      changed = true;
    }
  }
  if (sig) {
    const existingSigs = readOpenedSignatures();
    if (!existingSigs.includes(sig)) {
      funStorage.set(OPENED_SIGNATURES_KEY, JSON.stringify([...existingSigs, sig].slice(-500)));
      changed = true;
    }
  }

  if (!wasAlreadyOpened && changed && tier) {
    const stats = getGachaCollectionStats();
    stats[tier] = (stats[tier] ?? 0) + 1;
    funStorage.set(STATS_KEY, JSON.stringify(stats));
  }
  if (changed) {
    notifyListeners();
  }
}

export function resetOpenedGradeGachas(): void {
  funStorage.set(OPENED_IDS_KEY, JSON.stringify([]));
  funStorage.set(OPENED_SIGNATURES_KEY, JSON.stringify([]));
  funStorage.set(STATS_KEY, JSON.stringify(getEmptyGachaStats()));
  notifyListeners();
}
