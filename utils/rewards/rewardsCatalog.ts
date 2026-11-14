export interface RewardCatalogItem {
  id: string;
  kind: "badge" | "theme" | "icon";
  title: string;
  description: string;
  costPoints: number;
  emoji: string;
  gradientColors?: [string, string];
}

export interface CustomPersonalReward {
  id: string;
  title: string;
  emoji: string;
  costPoints: number;
  redeemedCount: number;
  createdAt: number;
}

export const DEFAULT_CUSTOM_REWARDS: CustomPersonalReward[] = [
  {
    id: "custom_snack_music",
    title: "Pause musique & goûter (10 min)",
    emoji: "🎧",
    costPoints: 20,
    redeemedCount: 0,
    createdAt: 1,
  },
  {
    id: "custom_gaming_30",
    title: "30 min de jeu ou vidéo sans culpabilité",
    emoji: "🎮",
    costPoints: 45,
    redeemedCount: 0,
    createdAt: 2,
  },
  {
    id: "custom_episode_treat",
    title: "Un épisode de série / film",
    emoji: "🍿",
    costPoints: 75,
    redeemedCount: 0,
    createdAt: 3,
  },
];

export const REWARDS_CATALOG: RewardCatalogItem[] = [
  {
    id: "badge_starter",
    kind: "badge",
    title: "Premier Pas",
    description: "Lancé dès ton arrivée : démarrer vaut déjà une victoire.",
    costPoints: 0,
    emoji: "🦋",
  },
  {
    id: "badge_spark",
    kind: "badge",
    title: "Étincelle Focus",
    description: "Débloqué à 50 points d'effort (quelques micro-étapes ou 1 sprint).",
    costPoints: 50,
    emoji: "⚡",
  },
  {
    id: "badge_streak",
    kind: "badge",
    title: "Élan Régulier",
    description: "Débloqué à 150 points de travail accumulés.",
    costPoints: 150,
    emoji: "🔥",
  },
  {
    id: "theme_aurora",
    kind: "theme",
    title: "Thème Aurore Calme",
    description: "Dégradé Violet / Cyan apaisant pour ton espace focus.",
    costPoints: 250,
    emoji: "🌌",
    gradientColors: ["#7C3AED", "#06B6D4"],
  },
  {
    id: "badge_scholar",
    kind: "badge",
    title: "Cerveau en Action",
    description: "Débloqué à 500 points d'effort cumulés.",
    costPoints: 500,
    emoji: "🦉",
  },
  {
    id: "theme_gold",
    kind: "theme",
    title: "Thème Or Chaleureux",
    description: "Accent doré motivant pour tes sessions de travail.",
    costPoints: 750,
    emoji: "✨",
    gradientColors: ["#F59E0B", "#92400E"],
  },
  {
    id: "theme_sakura",
    kind: "theme",
    title: "Thème Sakura Doux",
    description: "Dégradé rose-violet débloqué à 1 200 points.",
    costPoints: 1200,
    emoji: "🌸",
    gradientColors: ["#EC4899", "#8B5CF6"],
  },
  {
    id: "badge_legend",
    kind: "badge",
    title: "Maître de la Persévérance",
    description: "Badge honorifique à 2 000 points d'effort personnel.",
    costPoints: 2000,
    emoji: "👑",
  },
];

export function computeUnlockedRewards(
  pointsTotal: number,
  existingUnlocked: string[] = []
): string[] {
  const unlocked = new Set<string>(existingUnlocked);
  for (const item of REWARDS_CATALOG) {
    if (pointsTotal >= item.costPoints) {
      unlocked.add(item.id);
    }
  }
  return Array.from(unlocked);
}

export function getRewardById(id?: string | null): RewardCatalogItem | undefined {
  if (!id) return undefined;
  return REWARDS_CATALOG.find(r => r.id === id);
}
