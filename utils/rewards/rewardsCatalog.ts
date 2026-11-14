export interface RewardCatalogItem {
  id: string;
  kind: "badge" | "theme" | "icon";
  title: string;
  description: string;
  costPoints: number;
  emoji: string;
  gradientColors?: [string, string];
}

export const REWARDS_CATALOG: RewardCatalogItem[] = [
  {
    id: "badge_starter",
    kind: "badge",
    title: "Membre Papillon +",
    description: "Badge de bienvenue affiché sur ta fiche & montre.",
    costPoints: 0,
    emoji: "🦋",
  },
  {
    id: "badge_streak",
    kind: "badge",
    title: "Flamme Assidue",
    description: "Débloqué à 100 points pour ta régularité.",
    costPoints: 100,
    emoji: "🔥",
  },
  {
    id: "theme_aurora",
    kind: "theme",
    title: "Thème Aurore Néon",
    description: "Dégradé Violet / Cyan pour l'en-tête Papillon +.",
    costPoints: 250,
    emoji: "🌌",
    gradientColors: ["#7C3AED", "#06B6D4"],
  },
  {
    id: "badge_scholar",
    kind: "badge",
    title: "Mentor Socratique",
    description: "Badge érudit débloqué à 500 points.",
    costPoints: 500,
    emoji: "🦉",
  },
  {
    id: "theme_gold",
    kind: "theme",
    title: "Thème Or Obsidienne",
    description: "Accent doré chaleureux pour ton espace.",
    costPoints: 750,
    emoji: "✨",
    gradientColors: ["#F59E0B", "#92400E"],
  },
  {
    id: "theme_sakura",
    kind: "theme",
    title: "Thème Sakura Sunset",
    description: "Dégradé rose-violet exclusif à 1 500 points.",
    costPoints: 1500,
    emoji: "🌸",
    gradientColors: ["#EC4899", "#8B5CF6"],
  },
  {
    id: "badge_legend",
    kind: "badge",
    title: "Couronne Élite",
    description: "Badge prestigieux pour les meilleurs élèves (2 000 pts).",
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
