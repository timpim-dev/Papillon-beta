import { Papicons } from "@getpapillon/papicons";
import { HeaderBackButton, useHeaderHeight, useTheme } from "expo-router/react-navigation";
import * as ImagePicker from "expo-image-picker"
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OnboardingInput from "@/components/onboarding/OnboardingInput";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import Avatar from "@/ui/components/Avatar";
import Button from "@/ui/components/Button";
import Icon from "@/ui/components/Icon";
import { NativeHeaderPressable, NativeHeaderSide } from "@/ui/components/NativeHeader";
import Typography from "@/ui/components/Typography";
import { getInitials } from "@/utils/chats/initials";
import ActionMenu, { type NativeActionEvent } from "@/ui/components/ActionMenu";
import {
  extractPronoteRewardsProfile,
  PpUserRecord,
} from "@/utils/rewards/pocketbaseClient";
import { getRewardById } from "@/utils/rewards/rewardsCatalog";
import {
  ensureRewardsUserSynced,
  getCachedRewardsUser,
} from "@/utils/rewards/rewardsService";

export default function CustomProfileScreen() {
  const { t } = useTranslation();
  const store = useAccountStore.getState();
  const accounts = useAccountStore((state) => state.accounts);
  const lastUsedAccount = useAccountStore((state) => state.lastUsedAccount);
  const personalization = useSettingsStore((state) => state.personalization);

  const account = accounts.find((a) => a.id === lastUsedAccount);
  const [rewardsUser, setRewardsUser] = useState<PpUserRecord | null>(() => getCachedRewardsUser());
  const pronoteProfile = extractPronoteRewardsProfile(account);

  useFocusEffect(
    useCallback(() => {
      setRewardsUser(getCachedRewardsUser());
      if (personalization.rewardsOptIn) {
        void ensureRewardsUserSynced().then(synced => {
          if (synced) setRewardsUser(synced);
        });
      }
    }, [personalization.rewardsOptIn])
  );

  const [firstName, setFirstName] = useState<string>(account?.firstName ?? "");
  const [lastName, setLastName] = useState<string>(account?.lastName ?? "");
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(account?.customisation?.profilePicture ? `data:image/png;base64,${account.customisation.profilePicture}` : null);

  useEffect(() => {
    if (account) {
      setFirstName(account.firstName);
      setLastName(account.lastName);
      setProfilePictureUrl(account.customisation?.profilePicture ? `data:image/png;base64,${account.customisation.profilePicture}` : null);
    }
  }, [account]);

  // Saved however the screen is left: the header button, the Android system
  // back or a swipe-to-dismiss, which skip any button handler.
  const nameRef = useRef({ firstName, lastName });
  nameRef.current = { firstName, lastName };
  useEffect(() => () => {
    useAccountStore.getState().setAccountName(lastUsedAccount, nameRef.current.firstName, nameRef.current.lastName);
  }, [lastUsedAccount]);

  const insets = useSafeAreaInsets()

  const updateProfilePictureFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      base64: true
    });

    if (!result.canceled) {
      const b64 = result.assets[0].base64 ?? "";
      store.setAccountProfilePicture(lastUsedAccount, b64);
    }
  }

  const updateProfilePictureFromService = async () => {
    Alert.alert(
      t("Feature_Soon"),
      "Cette fonctionnalité n'est pas encore disponible, mais elle le sera dans une prochaine mise à jour.",
      [{ text: "OK" }]
    );
  }

  const { colors } = useTheme();
  const height = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      behavior={"position"}
      keyboardVerticalOffset={-insets.top * 3.2}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ height: "100%" }}
      >
        <View style={{ paddingHorizontal: 50, alignItems: "center", gap: 15, paddingTop: 20 }}>
          <Avatar
            size={117}
            initials={getInitials(`${firstName} ${lastName}`)}
            imageUrl={profilePictureUrl || undefined}
          />

          <ActionMenu
            actions={[
              {
                id: 'photo_library',
                title: t("Button_Change_ProfilePicture_FromLibrary"),
                papicon: 'gallery',
                image: Platform.select({
                  ios: 'photo',
                  android: 'ic_menu_gallery',
                }),
                imageColor: colors.text
              },
              {
                id: 'from_service',
                title: t("Button_Change_ProfilePicture_FromService"),
                papicon: 'crown',
                image: Platform.select({
                  ios: 'square.and.arrow.down',
                  android: 'ic_menu_save',
                }),
                imageColor: colors.text
              },
              {
                id: 'remove_photo',
                title: t("Button_Change_ProfilePicture_Remove"),
                attributes: { destructive: true },
                papicon: 'trash',
                image: Platform.select({
                  ios: 'trash',
                  android: 'ic_menu_delete',
                }),
                imageColor: "#FF0000"
              }
            ]}
            onPressAction={(e: NativeActionEvent) => {
              switch (e.nativeEvent.event) {
                case 'photo_library':
                  updateProfilePictureFromLibrary();
                  break;
                case 'from_service':
                  updateProfilePictureFromService();
                  break;
                case 'remove_photo':
                  store.setAccountProfilePicture(lastUsedAccount, "");
                  break;
              }
            }}
          >
            <Button
              inline
              size="small"
              icon={<Papicons name="Camera" />}
              title={t("Button_Change_ProfilePicture")}
            />
          </ActionMenu>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 30, gap: 15 }}>
          <View style={{ gap: 10 }}>
            <Typography color="secondary">Prénom</Typography>
            <OnboardingInput
              placeholder={"Prénom"}
              text={firstName}
              setText={setFirstName}
              icon={"Font"}
              inputProps={{}}
            />
            <Typography color="secondary">Nom</Typography>
            <OnboardingInput
              placeholder={"Nom"}
              text={lastName}
              setText={setLastName}
              icon={"Bold"}
              inputProps={{}}
            />
          </View>

          <View
            style={{
              marginTop: 10,
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <Papicons name="Crown" size={24} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Typography variant="title">Récompenses & Classements</Typography>
                  <Typography variant="caption" color="secondary" numberOfLines={1}>
                    {[rewardsUser?.school_name || pronoteProfile.schoolName, rewardsUser?.city || pronoteProfile.city]
                      .filter(Boolean)
                      .join(" • ") || "Profil Pronote synchronisé"}
                  </Typography>
                </View>
              </View>
              <Typography variant="title" style={{ color: String(colors.primary) }}>
                {rewardsUser?.points_total ?? 0} pts
              </Typography>
            </View>

            <Typography variant="body2" color="secondary">
              {personalization.rewardsOptIn
                ? `${rewardsUser?.avatar_emoji || "🦋"} Série : ${rewardsUser?.streak_days ?? 0}j • Badge : ${
                    getRewardById(personalization.rewardsEquippedBadge)?.title ?? "Papillon Argenté"
                  }`
                : "Active les classements (Amis, Établissement, Ville, Mondial) et débloque des badges & thèmes."}
            </Typography>

            <TouchableOpacity
              onPress={() => {
                router.back();
                setTimeout(() => {
                  router.push("/(features)/(rewards)/rewards");
                }, 120);
              }}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Papicons name="Crown" size={18} color="#FFFFFF" />
              <Typography variant="body1" style={{ color: "#FFFFFF", fontWeight: "700" }}>
                Ouvrir les récompenses & classements
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
        <NativeHeaderSide side="Left">
          {Platform.OS === "android" ? (
            <HeaderBackButton onPress={() => router.back()} />
          ) : (
            <NativeHeaderPressable onPressIn={() => router.back()}>
              <Icon papicon size={26}>
                <Papicons name="ArrowLeft" />
              </Icon>
            </NativeHeaderPressable>
          )}
        </NativeHeaderSide>
      </ScrollView>
    </ KeyboardAvoidingView >
  );
}