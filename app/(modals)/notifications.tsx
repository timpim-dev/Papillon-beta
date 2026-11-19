import { Papicons } from "@getpapillon/papicons";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useState } from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettingsStore } from "@/stores/settings";
import Icon from "@/ui/components/Icon";
import NativeSwitch from "@/ui/native/NativeSwitch";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from "@/utils/notifications/notificationsSetup";

export default function NotificationsModal() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const personalization = useSettingsStore(s => s.personalization);
  const mutateProperty = useSettingsStore(s => s.mutateProperty);

  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);
  const [scheduled, setScheduled] = useState<Notifications.NotificationRequest[]>([]);

  const loadState = useCallback(async () => {
    const granted = await getNotificationPermissionStatus();
    setPermissionGranted(granted);
    const items = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    setScheduled(items);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadState();
    }, [loadState])
  );

  const homeworkEnabled = personalization.homeworkRemindersEnabled ?? true;
  const digestEnabled = personalization.homeworkDailyDigestEnabled ?? true;
  const chatEnabled = personalization.communicationNotificationsEnabled ?? true;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, 20),
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 32,
        gap: 14,
      }}
    >
      <View style={{ paddingHorizontal: 4, gap: 4 }}>
        <Typography variant="h3">Notifications</Typography>
        <Typography variant="body2" color="textSecondary">
          Gère tes alertes pour les messages, infos &amp; sondages et devoirs non terminés.
        </Typography>
      </View>

      {!permissionGranted && (
        <TouchableOpacity
          onPress={async () => {
            const granted = await requestNotificationPermission();
            setPermissionGranted(granted);
            void loadState();
          }}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 16,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Papicons name="Bell" size={18} color="#FFFFFF" />
          <Typography variant="title" style={{ color: "#FFFFFF", fontSize: 15 }}>
            Autoriser les notifications système
          </Typography>
        </TouchableOpacity>
      )}

      <List scrollEnabled={false} safeHorizontalPadding={false}>
        <List.Section>
          <List.SectionTitle>
            <List.Label>Alertes actives</List.Label>
          </List.SectionTitle>

          <List.Item>
            <List.Leading>
              <Icon><Papicons name="Tasks" /></Icon>
            </List.Leading>
            <Typography variant="title">Devoirs non terminés</Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              Rappels programmés + rattrapage matin si besoin
            </Typography>
            <List.Trailing>
              <NativeSwitch
                value={homeworkEnabled}
                onValueChange={async val => {
                  if (val) await requestNotificationPermission();
                  mutateProperty("personalization", { homeworkRemindersEnabled: val });
                }}
              />
            </List.Trailing>
          </List.Item>

          <List.Item>
            <List.Leading>
              <Icon><Papicons name="Clock" /></Icon>
            </List.Leading>
            <Typography variant="title">Résumé quotidien devoirs</Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              Rappel s&apos;il reste au moins 1 devoir non terminé
            </Typography>
            <List.Trailing>
              <NativeSwitch
                value={digestEnabled}
                onValueChange={val =>
                  mutateProperty("personalization", { homeworkDailyDigestEnabled: val })
                }
              />
            </List.Trailing>
          </List.Item>

          <List.Item>
            <List.Leading>
              <Icon><Papicons name="Inbox" /></Icon>
            </List.Leading>
            <Typography variant="title">Discussions &amp; réponses</Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              Nouveaux fils et réponses reçues
            </Typography>
            <List.Trailing>
              <NativeSwitch
                value={chatEnabled}
                onValueChange={async val => {
                  if (val) await requestNotificationPermission();
                  mutateProperty("personalization", { communicationNotificationsEnabled: val });
                }}
              />
            </List.Trailing>
          </List.Item>
        </List.Section>

        <List.Section>
          <List.SectionTitle>
            <List.Label>Rappels programmés ({scheduled.length})</List.Label>
          </List.SectionTitle>
          {scheduled.length === 0 ? (
            <List.Item>
              <Typography color="textSecondary">
                Aucun rappel en attente pour le moment.
              </Typography>
            </List.Item>
          ) : (
            scheduled.slice(0, 8).map(req => {
              const triggerDate =
                req.trigger && "value" in req.trigger && typeof req.trigger.value === "number"
                  ? new Date(req.trigger.value)
                  : null;
              return (
                <List.Item
                  key={req.identifier}
                  onPress={() => {
                    const route = req.content.data?.route;
                    if (typeof route === "string" && route.startsWith("/")) {
                      router.push(route as never);
                    }
                  }}
                >
                  <Typography variant="title" numberOfLines={1}>
                    {req.content.title || "Rappel"}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" numberOfLines={2}>
                    {req.content.body}
                    {triggerDate && Platform.OS !== "web"
                      ? ` • ${triggerDate.toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </Typography>
                </List.Item>
              );
            })
          )}
        </List.Section>
      </List>
    </ScrollView>
  );
}
