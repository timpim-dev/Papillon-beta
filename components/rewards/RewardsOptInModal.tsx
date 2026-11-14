import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "expo-router/react-navigation";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import packageJson from "@/package.json";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import Typography from "@/ui/new/Typography";
import { shouldShowRewardsOptInPopup } from "@/utils/rewards/pocketbaseClient";
import { ensureRewardsUserSynced } from "@/utils/rewards/rewardsService";

export default function RewardsOptInModal() {
  const { colors } = useTheme();
  const accounts = useAccountStore(s => s.accounts);
  const lastUsedAccount = useAccountStore(s => s.lastUsedAccount);
  const activeAccount =
    accounts.find(a => a.id === lastUsedAccount) ?? accounts[0];

  const personalization = useSettingsStore(s => s.personalization);
  const mutateProperty = useSettingsStore(s => s.mutateProperty);

  const [visible, setVisible] = useState(false);
  const [pseudo, setPseudo] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const currentVersion = String(packageJson.version ?? "1.0.0");
    const shouldShow = shouldShowRewardsOptInPopup({
      hasSignedInAccount: Boolean(activeAccount),
      rewardsOptIn: personalization.rewardsOptIn,
      rewardsAppOpenCount: personalization.rewardsAppOpenCount ?? 0,
      currentAppVersion: currentVersion,
      rewardsLastPromptVersion: personalization.rewardsLastPromptVersion,
    });
    if (shouldShow) {
      setPseudo(activeAccount?.firstName || "Élève Papillon");
      setVisible(true);
    }
  }, [
    activeAccount,
    personalization.rewardsOptIn,
    personalization.rewardsAppOpenCount,
    personalization.rewardsLastPromptVersion,
  ]);

  if (!visible) return null;

  const currentVersion = String(packageJson.version ?? "1.0.0");

  const handleJoin = async () => {
    setSaving(true);
    try {
      mutateProperty("personalization", {
        rewardsOptIn: true,
        rewardsLastPromptVersion: currentVersion,
      });
      await ensureRewardsUserSynced({
        pseudo: pseudo.trim() || activeAccount?.firstName || "Élève Papillon",
        city: city.trim(),
        optInLeaderboards: true,
      });
      setVisible(false);
    } catch {
      setVisible(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    mutateProperty("personalization", {
      rewardsOptIn: false,
      rewardsLastPromptVersion: currentVersion,
    });
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.58)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Papicons name="Crown" size={26} color="#F59E0B" />
            <Typography variant="h4" style={{ flex: 1 }}>
              Papillon + Récompenses
            </Typography>
          </View>

          <Typography variant="body2" color="textSecondary">
            Gagne des points quand tu termines tes devoirs, enchaînes les séries ou ajoutes des amis. Débloque des thèmes & badges pour téléphone et montre ! Strictement facultatif (opt-in) : seul ton pseudo choisi est visible.
          </Typography>

          <TextInput
            value={pseudo}
            onChangeText={setPseudo}
            placeholder="Ton pseudo dans le classement"
            placeholderTextColor={String(colors.text) + "66"}
            maxLength={32}
            style={{
              backgroundColor: colors.background,
              color: colors.text,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />

          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Ville (optionnel, pour le classement local)"
            placeholderTextColor={String(colors.text) + "66"}
            maxLength={60}
            style={{
              backgroundColor: colors.background,
              color: colors.text,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />

          <TouchableOpacity
            disabled={saving}
            onPress={() => void handleJoin()}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 4,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Typography variant="title" style={{ color: "#FFFFFF" }}>
                Rejoindre & choisir mon pseudo
              </Typography>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            disabled={saving}
            onPress={handleSkip}
            style={{
              borderRadius: 16,
              paddingVertical: 11,
              alignItems: "center",
            }}
          >
            <Typography variant="body2" color="textSecondary">
              Plus tard (me redemander à la prochaine MAJ)
            </Typography>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
