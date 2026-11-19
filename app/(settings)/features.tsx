import { Papicons } from "@getpapillon/papicons";
import { Alert, Platform, View } from "react-native";

import { useSettingsStore } from "@/stores/settings";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import NativeSwitch from "@/ui/native/NativeSwitch";
import { useTranslation } from "react-i18next";
import Icon from "@/ui/components/Icon";
import { useEffect, useMemo, useState } from "react";
import { getGradeDisplayScale } from "@/utils/grades/scale";
import Picker from "@/ui/components/Picker";
import { useTheme } from "expo-router/react-navigation";
import * as PapillonKit from "@getpapillon/papillonkit";
import { requestNotificationPermission } from "@/utils/notifications/notificationsSetup";
import {
  FunOpeningStyle,
  GACHA_RARITIES,
  GACHA_TIER_ORDER,
  getGachaCollectionStats,
  getOpenedGradeGachaCount,
  resetOpenedGradeGachas,
  subscribeGradeGachaUpdates,
} from "@/utils/fun/gradeGacha";

export default function SettingsFeatures() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const settingsStore = useSettingsStore(state => state.personalization);
  const mutateProperty = useSettingsStore(state => state.mutateProperty);

  const iOSBottomAccessoryEnabled = settingsStore.iOSBottomAccessoryEnabled ?? true;
  const showTabBarLabels = settingsStore.showTabBarLabels ?? true;
  const liveActivitiesEnabled = settingsStore.liveActivitiesEnabled ?? true;
  const homeworkRemindersEnabled = settingsStore.homeworkRemindersEnabled ?? true;
  const homeworkReminderHour = settingsStore.homeworkReminderHour ?? 18;
  const homeworkReminderMinute = settingsStore.homeworkReminderMinute ?? 30;
  const homeworkReminderDaysBefore = settingsStore.homeworkReminderDaysBefore ?? 1;
  const homeworkDailyDigestEnabled = settingsStore.homeworkDailyDigestEnabled ?? true;
  const communicationNotificationsEnabled = settingsStore.communicationNotificationsEnabled ?? true;
  const funModeEnabled = settingsStore.funModeEnabled ?? false;
  const funModeOpeningStyle: FunOpeningStyle = settingsStore.funModeOpeningStyle ?? "envelope";
  const selectedGradeScale = getGradeDisplayScale(settingsStore.gradesDisplayScale);
  const [, setGachaTick] = useState(0);

  useEffect(() => {
    return subscribeGradeGachaUpdates(() => setGachaTick(t => t + 1));
  }, []);

  const openedDropCount = getOpenedGradeGachaCount();
  const dropStats = getGachaCollectionStats();

  const reminderTimeOptions = useMemo(
    () => [
      { label: "17h00", hour: 17, minute: 0 },
      { label: "18h00", hour: 18, minute: 0 },
      { label: "18h30", hour: 18, minute: 30 },
      { label: "19h30", hour: 19, minute: 30 },
      { label: "20h30", hour: 20, minute: 30 },
    ],
    []
  );

  const selectedReminderTimeIndex = useMemo(() => {
    const idx = reminderTimeOptions.findIndex(
      opt => opt.hour === homeworkReminderHour && opt.minute === homeworkReminderMinute
    );
    return idx >= 0 ? idx : 2;
  }, [homeworkReminderHour, homeworkReminderMinute, reminderTimeOptions]);

  const reminderDayOptions = useMemo(
    () => [
      { label: "La veille", daysBefore: 1 },
      { label: "Le jour même", daysBefore: 0 },
    ],
    []
  );

  const selectedReminderDayIndex = homeworkReminderDaysBefore === 0 ? 1 : 0;

  const gradeScaleOptions = [
    {
      label: "Note sur 20",
      value: "20",
    },
    {
      label: "Note sur 10",
      value: "10",
    },
    {
      label: "Note sur 5",
      value: "5",
    },
    {
      label: "Pourcentage",
      value: "percentage",
    },
  ];

  const selectedGradeScaleIndex = useMemo(() => {
    return Math.max(0, gradeScaleOptions.findIndex(option => option.value === selectedGradeScale));
  }, [selectedGradeScale]);

  return (
    <List
      contentInsetAdjustmentBehavior="automatic"
      safeHorizontalPadding={16}
      contentContainerStyle={{ paddingVertical: 16 }}
      style={{ flex: 1, backgroundColor: colors.overground }}
    >
      <List.Section>
        <List.SectionTitle>
          <List.Label>{t("Settings_Features_TabBar")}</List.Label>
        </List.SectionTitle>

        {Platform.OS === "ios" && (
          <List.Item>
            <List.Leading>
              <Icon>
                <Papicons name={"Sunrise"} />
              </Icon>
            </List.Leading>
            <Typography variant="title">{t("Settings_Features_BottomAccessory")}</Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              {t("Settings_Features_BottomAccessory_Description")}
            </Typography>
            <List.Trailing>
              <NativeSwitch
                value={Platform.OS !== "ios" ? false : iOSBottomAccessoryEnabled}
                disabled={Platform.OS !== "ios"}
                onValueChange={(value) =>
                  mutateProperty("personalization", {
                    ...settingsStore,
                    iOSBottomAccessoryEnabled: value,
                  })
                }
              />
            </List.Trailing>
          </List.Item>
        )}
        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name={"Font"} />
            </Icon>
          </List.Leading>
          <Typography variant="title">{t("Settings_Features_ShowTabBarLabels")}</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            {t("Settings_Features_ShowTabBarLabels_Description")}
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={showTabBarLabels}
              onValueChange={(value) =>
                mutateProperty("personalization", {
                  ...settingsStore,
                  showTabBarLabels: value,
                })
              }
            />
          </List.Trailing>
        </List.Item>
      </List.Section>

      {PapillonKit.features.liveActivities && (
        <List.Section>
          <List.SectionTitle>
            <List.Label>{t("Settings_Features_LockScreen")}</List.Label>
          </List.SectionTitle>

          <List.Item>
            <List.Leading>
              <Icon>
                <Papicons name={"Clock"} />
              </Icon>
            </List.Leading>
            <Typography variant="title">{t("Settings_Features_LiveActivities")}</Typography>
            <Typography color="textSecondary" numberOfLines={3}>
              {t("Settings_Features_LiveActivities_Description")}
            </Typography>
            <List.Trailing>
              <NativeSwitch
                value={liveActivitiesEnabled}
                onValueChange={(value) =>
                  mutateProperty("personalization", {
                    ...settingsStore,
                    liveActivitiesEnabled: value,
                  })
                }
              />
            </List.Trailing>
          </List.Item>
        </List.Section>
      )}

      <List.Section>
        <List.SectionTitle>
          <List.Label>Notifications & Rappels</List.Label>
        </List.SectionTitle>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name={"Tasks"} />
            </Icon>
          </List.Leading>
          <Typography variant="title">Rappels de devoirs</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Planifie une notification pour les devoirs non terminés (annulée dès qu&apos;un devoir est coché).
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={homeworkRemindersEnabled}
              onValueChange={async (value) => {
                if (value) {
                  await requestNotificationPermission();
                }
                mutateProperty("personalization", {
                  homeworkRemindersEnabled: value,
                });
              }}
            />
          </List.Trailing>
        </List.Item>

        {homeworkRemindersEnabled && (
          <>
            <List.Item>
              <List.Leading>
                <Icon>
                  <Papicons name={"Clock"} />
                </Icon>
              </List.Leading>
              <Typography variant="title">Heure du rappel</Typography>
              <Typography color="textSecondary" numberOfLines={2}>
                Horaire local de notification
              </Typography>
              <List.Trailing>
                <View style={{ width: 120, alignItems: "flex-end" }}>
                  <Picker
                    options={reminderTimeOptions.map(opt => opt.label)}
                    selectedIndex={selectedReminderTimeIndex}
                    onValueChange={(index) => {
                      const picked = reminderTimeOptions[index];
                      if (!picked) return;
                      mutateProperty("personalization", {
                        homeworkReminderHour: picked.hour,
                        homeworkReminderMinute: picked.minute,
                      });
                    }}
                  />
                </View>
              </List.Trailing>
            </List.Item>

            <List.Item>
              <List.Leading>
                <Icon>
                  <Papicons name={"Calendar"} />
                </Icon>
              </List.Leading>
              <Typography variant="title">Quand prévenir</Typography>
              <Typography color="textSecondary" numberOfLines={2}>
                Veille de l&apos;échéance ou le jour même
              </Typography>
              <List.Trailing>
                <View style={{ width: 130, alignItems: "flex-end" }}>
                  <Picker
                    options={reminderDayOptions.map(opt => opt.label)}
                    selectedIndex={selectedReminderDayIndex}
                    onValueChange={(index) => {
                      const picked = reminderDayOptions[index];
                      if (!picked) return;
                      mutateProperty("personalization", {
                        homeworkReminderDaysBefore: picked.daysBefore,
                      });
                    }}
                  />
                </View>
              </List.Trailing>
            </List.Item>
          </>
        )}

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name={"Inbox"} />
            </Icon>
          </List.Leading>
          <Typography variant="title">Messages &amp; Discussions</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Alerte locale lors d&apos;une nouvelle discussion ou réponse Pronote.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={communicationNotificationsEnabled}
              onValueChange={async (value) => {
                if (value) {
                  await requestNotificationPermission();
                }
                mutateProperty("personalization", {
                  communicationNotificationsEnabled: value,
                });
              }}
            />
          </List.Trailing>
        </List.Item>

        {homeworkRemindersEnabled && (
          <List.Item>
            <List.Leading>
              <Icon>
                <Papicons name={"Clock"} />
              </Icon>
            </List.Leading>
            <Typography variant="title">Résumé devoirs non faits</Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              Une alerte récapitulative quotidienne s&apos;il reste des devoirs à faire.
            </Typography>
            <List.Trailing>
              <NativeSwitch
                value={homeworkDailyDigestEnabled}
                onValueChange={value => {
                  mutateProperty("personalization", {
                    homeworkDailyDigestEnabled: value,
                  });
                }}
              />
            </List.Trailing>
          </List.Item>
        )}
      </List.Section>

      <List.Section>
        <List.SectionTitle>
          <List.Label>{t("Settings_Features_Grades")}</List.Label>
        </List.SectionTitle>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name={"Grades"} />
            </Icon>
          </List.Leading>
          <Typography variant="body2" color="primary">{t("Global_Experimental")}</Typography>
          <Typography variant="title">{t("Settings_Features_GradeScale")}</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            {t("Settings_Features_GradeScale_Description")}
          </Typography>
          <List.Trailing>
            <View style={{ width: 120, alignItems: "flex-end" }}>
              <Picker
                options={gradeScaleOptions.map(option => option.label)}
                selectedIndex={selectedGradeScaleIndex}
                onValueChange={(index) =>
                  mutateProperty("personalization", {
                    gradesDisplayScale: gradeScaleOptions[index].value as "20" | "10" | "5" | "percentage",
                  })
                }
              />
            </View>
          </List.Trailing>
        </List.Item>
      </List.Section>

      <List.Section>
        <List.SectionTitle>
          <List.Label>Mode Fun</List.Label>
        </List.SectionTitle>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name={"Sparkles"} />
            </Icon>
          </List.Leading>
          <Typography variant="body2" color="primary">{t("Global_Experimental")}</Typography>
          <Typography variant="title">Ouverture gacha des notes</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Masque les nouvelles notes et révèle-les avec animation et raretés selon ta note sur 20.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={funModeEnabled}
              onValueChange={value => {
                mutateProperty("personalization", {
                  funModeEnabled: value,
                });
              }}
            />
          </List.Trailing>
        </List.Item>

        {funModeEnabled && (
          <>
            <List.Item>
              <List.Leading>
                <Icon>
                  <Papicons name={"Mail"} />
                </Icon>
              </List.Leading>
              <Typography variant="title">Style d&apos;ouverture</Typography>
              <Typography color="textSecondary" numberOfLines={2}>
                Choisis l&apos;animation affichée à l&apos;ouverture d&apos;une note.
              </Typography>
              <List.Trailing>
                <View style={{ width: 120, alignItems: "flex-end" }}>
                  <Picker
                    options={["Enveloppe", "Cadeau"]}
                    selectedIndex={funModeOpeningStyle === "gift" ? 1 : 0}
                    onValueChange={index => {
                      mutateProperty("personalization", {
                        funModeOpeningStyle: index === 1 ? "gift" : "envelope",
                      });
                    }}
                  />
                </View>
              </List.Trailing>
            </List.Item>

            <List.Item>
              <List.Leading>
                <Icon>
                  <Papicons name={"Crown"} />
                </Icon>
              </List.Leading>
              <Typography variant="title">Collection de tirages ({openedDropCount})</Typography>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {GACHA_TIER_ORDER.map(tier => {
                  const cfg = GACHA_RARITIES[tier];
                  const count = dropStats[tier] ?? 0;
                  return (
                    <View
                      key={tier}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: `${cfg.color}1C`,
                        borderWidth: 1,
                        borderColor: `${cfg.color}50`,
                      }}
                    >
                      <Typography variant="caption" weight="semibold" style={{ color: cfg.color }}>
                        {cfg.label} : {count}
                      </Typography>
                    </View>
                  );
                })}
              </View>
            </List.Item>

            <List.Item
              onPress={() => {
                resetOpenedGradeGachas();
                Alert.alert(
                  "Notes ré-emballées",
                  "Toutes tes notes sont à nouveau masquées et prêtes à être ouvertes."
                );
              }}
            >
              <List.Leading>
                <Icon>
                  <Papicons name={"Star"} />
                </Icon>
              </List.Leading>
              <Typography variant="title">Ré-emballer toutes les notes</Typography>
              <Typography color="textSecondary" numberOfLines={2}>
                Remet toutes tes notes à ouvrir sans toucher aux vraies notes.
              </Typography>
            </List.Item>
          </>
        )}
      </List.Section>

    </List>
  );
}
