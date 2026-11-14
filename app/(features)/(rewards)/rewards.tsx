import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettingsStore } from "@/stores/settings";
import TabHeader from "@/ui/components/TabHeader";
import TabHeaderTitle from "@/ui/components/TabHeaderTitle";
import Typography from "@/ui/new/Typography";
import {
  CustomPersonalReward,
  getRewardById,
  REWARDS_CATALOG,
} from "@/utils/rewards/rewardsCatalog";
import {
  addCustomPersonalReward,
  AdhdRewardsLocalState,
  awardFocusSprintPoints,
  awardTaskKickoffPoints,
  deleteCustomPersonalReward,
  equipRewardItem,
  getAdhdRewardsState,
  getCustomPersonalRewards,
  getSpendablePoints,
  redeemCustomPersonalReward,
  syncRewardsWithPocketBaseBackup,
} from "@/utils/rewards/rewardsService";

const SPRINT_PRESETS = [
  { minutes: 5, label: "5 min", hint: "Juste démarrer (+8 pts)" },
  { minutes: 10, label: "10 min", hint: "Sprint rapide (+15 pts)" },
  { minutes: 15, label: "15 min", hint: "Focus TDAH (+25 pts)" },
  { minutes: 25, label: "25 min", hint: "Pomodoro (+35 pts)" },
];

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusRewardsHubScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { homeworkId, subject } = useLocalSearchParams<{
    homeworkId?: string;
    subject?: string;
  }>();

  const personalization = useSettingsStore(s => s.personalization);
  const mutateProperty = useSettingsStore(s => s.mutateProperty);
  const backupEnabled = personalization.rewardsPocketBaseBackupEnabled ?? true;

  const [headerHeight, setHeaderHeight] = useState(105);
  const [state, setState] = useState<AdhdRewardsLocalState>(() => getAdhdRewardsState());
  const [customRewards, setCustomRewards] = useState<CustomPersonalReward[]>(() =>
    getCustomPersonalRewards()
  );
  const [syncing, setSyncing] = useState(false);

  // ADHD Focus Sprint timer state
  const [selectedMinutes, setSelectedMinutes] = useState(10);
  const [secondsLeft, setSecondsLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const startedAtElapsedRef = useRef(0);

  // Add personal reward inputs
  const [newTitle, setNewTitle] = useState("");
  const [newEmoji, setNewEmoji] = useState("🎁");
  const [newCost, setNewCost] = useState("30");

  const refreshData = useCallback(async () => {
    setState(getAdhdRewardsState());
    setCustomRewards(getCustomPersonalRewards());
    if (backupEnabled) {
      setSyncing(true);
      try {
        const synced = await syncRewardsWithPocketBaseBackup();
        setState(synced);
      } finally {
        setSyncing(false);
      }
    }
  }, [backupEnabled]);

  useFocusEffect(
    useCallback(() => {
      void refreshData();
    }, [refreshData])
  );

  const handleFinishSprint = useCallback(
    async (elapsedSeconds: number) => {
      setRunning(false);
      setPaused(false);
      const workedMinutes = Math.max(
        elapsedSeconds >= 120 ? Math.round(elapsedSeconds / 60) : 0,
        elapsedSeconds >= selectedMinutes * 60 ? selectedMinutes : 0
      );
      setSecondsLeft(selectedMinutes * 60);

      if (workedMinutes < 2) {
        Alert.alert(
          "Début enregistré",
          "Même 1 minute compte pour apprivoiser la tâche. Travaille au moins 2 minutes pour gagner un bonus Focus !"
        );
        return;
      }

      const res = await awardFocusSprintPoints(workedMinutes, homeworkId);
      setState(getAdhdRewardsState());
      notificationAsync(NotificationFeedbackType.Success);
      Alert.alert(
        "Session terminée !",
        res.awarded
          ? `Bravo ! +${res.delta} pts pour ${workedMinutes} min d'effort.`
          : "Beau travail !"
      );
    },
    [homeworkId, selectedMinutes]
  );

  useEffect(() => {
    if (!running || paused) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        startedAtElapsedRef.current += 1;
        if (prev <= 1) {
          clearInterval(interval);
          void handleFinishSprint(selectedMinutes * 60);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [handleFinishSprint, paused, running, selectedMinutes]);

  const handleStartSprint = async () => {
    startedAtElapsedRef.current = 0;
    setSecondsLeft(selectedMinutes * 60);
    setRunning(true);
    setPaused(false);
    if (homeworkId) {
      const bonus = await awardTaskKickoffPoints(homeworkId);
      if (bonus) {
        setState(getAdhdRewardsState());
      }
    }
  };

  const handleSelectPreset = (minutes: number) => {
    if (running) return;
    setSelectedMinutes(minutes);
    setSecondsLeft(minutes * 60);
  };

  const handleAddCustomReward = () => {
    const cost = Number.parseInt(newCost, 10) || 30;
    if (!newTitle.trim()) return;
    setCustomRewards(addCustomPersonalReward(newTitle, newEmoji, cost));
    setNewTitle("");
  };

  const handleRedeem = (reward: CustomPersonalReward) => {
    const res = redeemCustomPersonalReward(reward.id);
    if (!res.ok) {
      Alert.alert("Pas encore assez de points", res.reason ?? "Continue tes efforts !");
      return;
    }
    setState(res.state);
    setCustomRewards(res.rewards);
    notificationAsync(NotificationFeedbackType.Success);
    Alert.alert("Récompense débloquée !", `Profite de : ${reward.emoji} ${reward.title}`);
  };

  const spendable = getSpendablePoints(state);
  const totalEarned = state.totalEarnedPoints;
  const unlockedIds = personalization.rewardsUnlockedIds ?? ["badge_starter"];
  const equippedBadge = personalization.rewardsEquippedBadge ?? "badge_starter";
  const equippedThemeId = personalization.rewardsCustomThemeId ?? null;
  const currentBadge = getRewardById(equippedBadge);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabHeader
        showAndroidBackButton
        modal
        onHeightChanged={setHeaderHeight}
        title={
          <TabHeaderTitle
            color={String(colors.text)}
            leading="Focus & Récompenses"
            subtitle={
              subject
                ? `${subject} • ${spendable} pts dispos`
                : `${spendable} pts disponibles • ${state.focusMinutesToday} min aujourd'hui`
            }
          />
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + 10,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => void refreshData()}
            progressViewOffset={headerHeight}
          />
        }
      >
        {/* Summary & Positive ADHD Feedback Card */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Typography variant="caption" color="textSecondary">
                Points à dépenser (effort personnel)
              </Typography>
              <Typography variant="h2" style={{ color: String(colors.primary) }}>
                {currentBadge?.emoji ?? "🦋"} {spendable} pts
              </Typography>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Typography variant="caption" color="textSecondary">
                Total gagné
              </Typography>
              <Typography variant="title">{totalEarned} pts</Typography>
              <Typography variant="caption" color="textSecondary">
                {state.activeDaysCount} jour(s) actifs
              </Typography>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.background,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <Typography variant="caption" color="textSecondary">
                Focus aujourd&apos;hui
              </Typography>
              <Typography variant="title">{state.focusMinutesToday} min</Typography>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.background,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <Typography variant="caption" color="textSecondary">
                Sessions / Devoirs
              </Typography>
              <Typography variant="title">
                {state.sessionsCompleted} / {state.tasksCompleted}
              </Typography>
            </View>
          </View>

          <Typography variant="caption" color="textSecondary">
            Zéro pénalité si tu fais une pause : chaque micro-étape, démarrage ou reprise te rapporte des points.
          </Typography>
        </View>

        {/* Focus Sprint Timer Card */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Typography variant="title">Minuteur Focus TDAH</Typography>
              <Typography variant="caption" color="textSecondary">
                {subject
                  ? `Cible : ${subject}`
                  : "Choisis un mini-sprint sans pression pour lancer la machine."}
              </Typography>
            </View>
            <Typography variant="h2" style={{ color: String(colors.primary), fontVariant: ["tabular-nums"] }}>
              {formatCountdown(secondsLeft)}
            </Typography>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SPRINT_PRESETS.map(preset => {
              const active = selectedMinutes === preset.minutes;
              return (
                <Pressable
                  key={preset.minutes}
                  disabled={running}
                  onPress={() => handleSelectPreset(preset.minutes)}
                  style={{
                    flexGrow: 1,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? String(colors.primary) + "18" : colors.background,
                    opacity: running && !active ? 0.45 : 1,
                  }}
                >
                  <Typography variant="title" style={{ fontSize: 13 }}>
                    {preset.label}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                    {preset.hint}
                  </Typography>
                </Pressable>
              );
            })}
          </View>

          {!running ? (
            <TouchableOpacity
              onPress={() => void handleStartSprint()}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Papicons name="Clock" size={18} color="#FFFFFF" />
              <Typography variant="title" style={{ color: "#FFFFFF", fontSize: 15 }}>
                Démarrer {selectedMinutes} min
              </Typography>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setPaused(p => !p)}
                style={{
                  flex: 1,
                  backgroundColor: colors.background,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Typography variant="title" style={{ fontSize: 14 }}>
                  {paused ? "Reprendre" : "Pause"}
                </Typography>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleFinishSprint(startedAtElapsedRef.current)}
                style={{
                  flex: 1,
                  backgroundColor: "#16A34A",
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Typography variant="title" style={{ color: "#FFFFFF", fontSize: 14 }}>
                  Valider l&apos;effort
                </Typography>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Personal Real-Life Rewards */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 10,
          }}
        >
          <Typography variant="title">Mes récompenses perso</Typography>
          <Typography variant="caption" color="textSecondary">
            Échange tes points contre de vraies pauses motivantes que tu définis toi-même.
          </Typography>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={newEmoji}
              onChangeText={setNewEmoji}
              maxLength={4}
              style={{
                width: 46,
                textAlign: "center",
                backgroundColor: colors.background,
                color: colors.text,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                fontSize: 18,
              }}
            />
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Ex: 20 min de jeu..."
              placeholderTextColor={String(colors.text) + "66"}
              style={{
                flex: 1,
                backgroundColor: colors.background,
                color: colors.text,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <TextInput
              value={newCost}
              onChangeText={setNewCost}
              keyboardType="numeric"
              maxLength={4}
              style={{
                width: 58,
                textAlign: "center",
                backgroundColor: colors.background,
                color: colors.text,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <TouchableOpacity
              onPress={handleAddCustomReward}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <Typography variant="title" style={{ color: "#FFFFFF", fontSize: 16 }}>
                +
              </Typography>
            </TouchableOpacity>
          </View>

          {customRewards.map(item => {
            const canAfford = spendable >= item.costPoints;
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: colors.background,
                }}
              >
                <Typography variant="h4">{item.emoji}</Typography>
                <View style={{ flex: 1 }}>
                  <Typography variant="title" style={{ fontSize: 14 }}>
                    {item.title}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {item.costPoints} pts • Utilisé {item.redeemedCount}×
                  </Typography>
                </View>
                <TouchableOpacity
                  onPress={() => handleRedeem(item)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: canAfford ? "#16A34A" : colors.border,
                  }}
                >
                  <Typography
                    variant="caption"
                    style={{
                      color: canAfford ? "#FFFFFF" : String(colors.text),
                      fontWeight: "700",
                    }}
                  >
                    Profiter
                  </Typography>
                </TouchableOpacity>
                <Pressable
                  onPress={() => setCustomRewards(deleteCustomPersonalReward(item.id))}
                  hitSlop={8}
                >
                  <Papicons name="Trash" size={16} color={String(colors.text) + "88"} />
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Badges & Themes Catalog */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 10,
          }}
        >
          <Typography variant="title">Badges & Thèmes débloqués (cumul d&apos;effort)</Typography>
          {REWARDS_CATALOG.map(item => {
            const isUnlocked =
              unlockedIds.includes(item.id) || totalEarned >= item.costPoints;
            const isEquipped =
              item.kind === "theme"
                ? equippedThemeId === item.id
                : equippedBadge === item.id;
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: colors.background,
                  opacity: isUnlocked ? 1 : 0.6,
                }}
              >
                <Typography variant="h3">{item.emoji}</Typography>
                <View style={{ flex: 1 }}>
                  <Typography variant="title" style={{ fontSize: 15 }}>
                    {item.title}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {item.description}
                  </Typography>
                </View>
                {isUnlocked ? (
                  <TouchableOpacity
                    onPress={() => void equipRewardItem(item.id, item.kind)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: isEquipped ? "#16A34A" : colors.primary,
                    }}
                  >
                    <Typography variant="caption" style={{ color: "#FFFFFF", fontWeight: "700" }}>
                      {isEquipped ? "Équipé" : "Équiper"}
                    </Typography>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Typography variant="caption" color="textSecondary">
                      {item.costPoints} pts
                    </Typography>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Recent Activity Log */}
        {state.recentActivity.length > 0 && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 8,
            }}
          >
            <Typography variant="title">Victoires récentes</Typography>
            {state.recentActivity.slice(0, 8).map(ev => (
              <View
                key={ev.key}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 4,
                }}
              >
                <Typography variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                  {ev.label}
                </Typography>
                <Typography
                  variant="caption"
                  style={{
                    color: ev.delta >= 0 ? "#16A34A" : "#F59E0B",
                    fontWeight: "700",
                  }}
                >
                  {ev.delta >= 0 ? `+${ev.delta}` : ev.delta} pts
                </Typography>
              </View>
            ))}
          </View>
        )}

        {/* Private PocketBase Backup Toggle */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Typography variant="title">Sauvegarde PocketBase privée</Typography>
            <Typography variant="caption" color="textSecondary">
              Sauvegarde chiffrée liée à ton ID Pronote haché (aucun classement ni partage public).
            </Typography>
          </View>
          <Switch
            value={backupEnabled}
            onValueChange={next => {
              mutateProperty("personalization", {
                rewardsPocketBaseBackupEnabled: next,
              });
              if (next) void refreshData();
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}
