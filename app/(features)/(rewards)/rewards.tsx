import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import TabHeader from "@/ui/components/TabHeader";
import TabHeaderTitle from "@/ui/components/TabHeaderTitle";
import Typography from "@/ui/new/Typography";
import {
  LeaderboardScope,
  PpUserRecord,
} from "@/utils/rewards/pocketbaseClient";
import {
  getRewardById,
  REWARDS_CATALOG,
} from "@/utils/rewards/rewardsCatalog";
import {
  addFriendByCode,
  awardSharePoints,
  ensureRewardsUserSynced,
  equipRewardItem,
  getCachedRewardsUser,
  loadLeaderboardForScope,
  updateRewardsVisibility,
} from "@/utils/rewards/rewardsService";

const SCOPES: Array<{ key: LeaderboardScope; label: string }> = [
  { key: "friends", label: "Amis" },
  { key: "school", label: "Établissement" },
  { key: "city", label: "Ville" },
  { key: "global", label: "Mondial" },
];

const AVATAR_CHOICES = ["🦋", "🦉", "🦊", "🚀", "⚡", "🎓"];
const RELEASE_SHARE_URL = "https://github.com/timpim-dev/Papillon-beta/releases";

export default function RewardsHubScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const personalization = useSettingsStore(s => s.personalization);
  const accounts = useAccountStore(s => s.accounts);
  const lastUsedAccount = useAccountStore(s => s.lastUsedAccount);
  const activeAccount =
    accounts.find(a => a.id === lastUsedAccount) ?? accounts[0];

  const isOptedIn = personalization.rewardsOptIn === true;
  const [headerHeight, setHeaderHeight] = useState(105);
  const [user, setUser] = useState<PpUserRecord | null>(() => getCachedRewardsUser());
  const [scope, setScope] = useState<LeaderboardScope>("friends");
  const [entries, setEntries] = useState<PpUserRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [pseudoInput, setPseudoInput] = useState(
    user?.pseudo || activeAccount?.firstName || "Élève Papillon"
  );
  const [cityInput, setCityInput] = useState(user?.city || "");
  const [schoolInput, setSchoolInput] = useState(
    user?.school_name || activeAccount?.schoolName || ""
  );
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  const refreshData = useCallback(async () => {
    if (!isOptedIn) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const synced = await ensureRewardsUserSynced();
      if (synced) {
        setUser(synced);
        setPseudoInput(synced.pseudo);
        setCityInput(synced.city ?? "");
        setSchoolInput(synced.school_name ?? "");
      }
      const rows = await loadLeaderboardForScope(scope);
      setEntries(rows);
    } catch {
      // Offline cache remains visible
    } finally {
      setLoading(false);
    }
  }, [isOptedIn, scope]);

  useFocusEffect(
    useCallback(() => {
      void refreshData();
    }, [refreshData])
  );

  const handleToggleOptIn = async (next: boolean) => {
    try {
      await updateRewardsVisibility(next);
      if (next) {
        const synced = await ensureRewardsUserSynced({
          pseudo: pseudoInput,
          city: cityInput,
          schoolName: schoolInput,
          optInLeaderboards: true,
        });
        if (synced) setUser(synced);
        await refreshData();
      }
    } catch (err) {
      Alert.alert("Erreur PocketBase", String(err));
    }
  };

  const handleSaveProfile = async (avatarOverride?: string) => {
    try {
      const updated = await ensureRewardsUserSynced({
        pseudo: pseudoInput.trim() || "Élève Papillon",
        city: cityInput.trim(),
        schoolName: schoolInput.trim(),
        avatarEmoji: avatarOverride,
        optInLeaderboards: true,
      });
      if (updated) {
        setUser(updated);
        Alert.alert("Profil mis à jour", "Tes infos publiques ont été synchronisées.");
        void refreshData();
      }
    } catch (err) {
      Alert.alert("Synchronisation impossible", String(err));
    }
  };

  const handleAddFriend = async () => {
    const clean = friendCodeInput.trim().toUpperCase().replace(/^PAPILLON_FRIEND:/, "");
    if (!clean) return;
    setAddingFriend(true);
    try {
      const res = await addFriendByCode(clean);
      setUser(res.user);
      setFriendCodeInput("");
      Alert.alert(
        "Ami ajouté !",
        `${res.friend.pseudo} a été ajouté${res.pointsAwarded ? " (+50 pts)" : ""}.`
      );
      void refreshData();
    } catch (err) {
      Alert.alert("Ajout impossible", err instanceof Error ? err.message : String(err));
    } finally {
      setAddingFriend(false);
    }
  };

  const handleShareFriendAndApp = async () => {
    await Share.share({
      message: `Rejoins-moi sur Papillon + ! Mon code ami : ${
        user?.friend_code ?? "—"
      }\nTéléchargement : ${RELEASE_SHARE_URL}`,
      url: RELEASE_SHARE_URL,
    });
    await awardSharePoints("phone_qr");
    void refreshData();
  };

  const pointsTotal = user?.points_total ?? 0;
  const unlockedIds = user?.unlocked_rewards ?? personalization.rewardsUnlockedIds ?? ["badge_starter"];
  const equippedBadge = personalization.rewardsEquippedBadge ?? user?.equipped_badge ?? "badge_starter";
  const equippedThemeId = personalization.rewardsCustomThemeId ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabHeader
        showAndroidBackButton
        modal
        onHeightChanged={setHeaderHeight}
        title={
          <TabHeaderTitle
            color={String(colors.text)}
            leading="Récompenses & Amis"
            subtitle={isOptedIn ? `${pointsTotal} pts • Série ${user?.streak_days ?? 0}j` : "Mode hors-ligne (opt-out)"}
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
            refreshing={loading}
            onRefresh={() => void refreshData()}
            progressViewOffset={headerHeight}
          />
        }
      >
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Typography variant="title">Participer aux classements</Typography>
              <Typography variant="caption" color="textSecondary">
                Synchronisation chiffrée via identifiant Pronote haché (aucun doublon possible).
              </Typography>
            </View>
            <Switch value={isOptedIn} onValueChange={v => void handleToggleOptIn(v)} />
          </View>

          {isOptedIn && user && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: String(colors.primary) + "14",
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <View>
                  <Typography variant="caption" color="textSecondary">
                    Ton score Papillon +
                  </Typography>
                  <Typography variant="h3" style={{ color: String(colors.primary) }}>
                    {user.avatar_emoji || "🦋"} {pointsTotal} pts
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Code ami : {user.friend_code}
                  </Typography>
                </View>

                <TouchableOpacity
                  onPress={() => setQrModalVisible(true)}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Papicons name="QrCode" size={18} color="#FFFFFF" />
                  <Typography variant="caption" style={{ color: "#FFFFFF", fontWeight: "700" }}>
                    Mon QR
                  </Typography>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {AVATAR_CHOICES.map(emoji => (
                  <Pressable
                    key={emoji}
                    onPress={() => void handleSaveProfile(emoji)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1.5,
                      borderColor: user.avatar_emoji === emoji ? colors.primary : colors.border,
                      backgroundColor: colors.background,
                    }}
                  >
                    <Typography variant="h4">{emoji}</Typography>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                value={pseudoInput}
                onChangeText={setPseudoInput}
                placeholder="Pseudo public"
                placeholderTextColor={String(colors.text) + "66"}
                style={{
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={schoolInput}
                  onChangeText={setSchoolInput}
                  placeholder="Établissement"
                  placeholderTextColor={String(colors.text) + "66"}
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
                <TextInput
                  value={cityInput}
                  onChangeText={setCityInput}
                  placeholder="Ville"
                  placeholderTextColor={String(colors.text) + "66"}
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
              <TouchableOpacity
                onPress={() => void handleSaveProfile()}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 11,
                  alignItems: "center",
                }}
              >
                <Typography variant="title" style={{ color: "#FFFFFF", fontSize: 14 }}>
                  Enregistrer mon profil
                </Typography>
              </TouchableOpacity>
            </>
          )}
        </View>

        {isOptedIn && (
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
            <Typography variant="title">Ajouter un ami (+50 pts)</Typography>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={friendCodeInput}
                onChangeText={setFriendCodeInput}
                placeholder="Code ami (ex: AB12CD34)"
                placeholderTextColor={String(colors.text) + "66"}
                autoCapitalize="characters"
                style={{
                  flex: 1,
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <TouchableOpacity
                disabled={addingFriend}
                onPress={() => void handleAddFriend()}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  justifyContent: "center",
                }}
              >
                {addingFriend ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Typography variant="title" style={{ color: "#FFFFFF", fontSize: 14 }}>
                    Ajouter
                  </Typography>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isOptedIn && (
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
            <Typography variant="title">Classements</Typography>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SCOPES.map(s => {
                const active = scope === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setScope(s.key)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.background,
                    }}
                  >
                    <Typography
                      variant="caption"
                      style={{ color: active ? "#FFFFFF" : String(colors.text), fontWeight: "700" }}
                    >
                      {s.label}
                    </Typography>
                  </Pressable>
                );
              })}
            </ScrollView>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
            ) : entries.length === 0 ? (
              <Typography variant="caption" color="textSecondary">
                Aucun participant affiché dans ce classement pour l'instant.
              </Typography>
            ) : (
              entries.map((entry, idx) => {
                const isSelf = entry.id === user?.id;
                const badge = getRewardById(entry.equipped_badge)?.emoji ?? "";
                return (
                  <View
                    key={entry.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 10,
                      borderRadius: 14,
                      backgroundColor: isSelf ? String(colors.primary) + "16" : colors.background,
                      borderWidth: isSelf ? 1 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    <Typography variant="title" style={{ width: 28, textAlign: "center" }}>
                      #{idx + 1}
                    </Typography>
                    <Typography variant="h4">{entry.avatar_emoji || "🦋"}</Typography>
                    <View style={{ flex: 1 }}>
                      <Typography variant="title" numberOfLines={1}>
                        {entry.pseudo} {badge}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" numberOfLines={1}>
                        {[entry.school_name, entry.city].filter(Boolean).join(" • ") || "Papillon +"}
                      </Typography>
                    </View>
                    <Typography variant="title" style={{ color: String(colors.primary) }}>
                      {entry.points_total} pts
                    </Typography>
                  </View>
                );
              })
            )}
          </View>
        )}

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
          <Typography variant="title">Récompenses & Personnalisation</Typography>
          {REWARDS_CATALOG.map(item => {
            const isUnlocked =
              unlockedIds.includes(item.id) || pointsTotal >= item.costPoints;
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
      </ScrollView>

      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.65)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 24,
              padding: 22,
              alignItems: "center",
              gap: 14,
              width: "100%",
            }}
          >
            <Typography variant="h4">Mon QR Ami & Partage</Typography>
            <View style={{ padding: 14, backgroundColor: "#FFFFFF", borderRadius: 18 }}>
              <QRCode value={`PAPILLON_FRIEND:${user?.friend_code ?? "PAPILLON"}`} size={190} />
            </View>
            <Typography variant="title">Code : {user?.friend_code ?? "—"}</Typography>
            <TouchableOpacity
              onPress={() => void handleShareFriendAndApp()}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 20,
                width: "100%",
                alignItems: "center",
              }}
            >
              <Typography variant="title" style={{ color: "#FFFFFF" }}>
                Partager (+20 pts / jour)
              </Typography>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQrModalVisible(false)}>
              <Typography variant="body2" color="textSecondary">
                Fermer
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
