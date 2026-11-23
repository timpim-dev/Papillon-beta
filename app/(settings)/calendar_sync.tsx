import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  View,
} from "react-native";

import {
  resolveCalendarSyncConfig,
  useSettingsStore,
} from "@/stores/settings";
import { CalendarSyncConfig } from "@/stores/settings/types";
import Icon from "@/ui/components/Icon";
import NativeSwitch from "@/ui/native/NativeSwitch";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import {
  CalendarProviderKind,
  clearSyncedCalendarEvents,
  createDedicatedPapillonCalendar,
  DeviceCalendarOption,
  exportCoursesToIcsFile,
  getCalendarPermissionStatus,
  getTrackedCalendarEventCount,
  listWritableDeviceCalendars,
  requestCalendarPermission,
} from "@/utils/calendar/calendarSync";
import {
  collectUpcomingCoursesForSync,
  runCalendarSync,
} from "@/utils/calendar/useCalendarAutoSync";

const WEEK_OPTIONS = [2, 4, 6, 8];

function formatProviderLabel(provider: CalendarProviderKind): string {
  switch (provider) {
    case "icloud":
      return "iCloud";
    case "google":
      return "Google";
    case "exchange":
      return "Exchange / Outlook";
    case "local":
      return "Appareil";
    default:
      return "Calendrier";
  }
}

export default function SettingsCalendarSync() {
  const { colors } = useTheme();
  const themeColors = colors as typeof colors & { overground?: string };

  const personalization = useSettingsStore(state => state.personalization);
  const mutateProperty = useSettingsStore(state => state.mutateProperty);
  const config = useMemo(
    () => resolveCalendarSyncConfig(personalization),
    [personalization]
  );

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [canAskAgain, setCanAskAgain] = useState<boolean>(true);
  const [calendars, setCalendars] = useState<DeviceCalendarOption[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState<boolean>(false);
  const [syncingNow, setSyncingNow] = useState<boolean>(false);
  const [exportingIcs, setExportingIcs] = useState<boolean>(false);
  const [creatingCalendar, setCreatingCalendar] = useState<boolean>(false);
  const [trackedCount, setTrackedCount] = useState<number>(() =>
    getTrackedCalendarEventCount()
  );

  const updateConfig = useCallback(
    (patch: Partial<CalendarSyncConfig>) => {
      const latest = resolveCalendarSyncConfig(
        useSettingsStore.getState().personalization
      );
      mutateProperty("personalization", {
        calendarSync: {
          ...latest,
          ...patch,
        },
      });
    },
    [mutateProperty]
  );

  const loadPermissionsAndCalendars = useCallback(async () => {
    setLoadingCalendars(true);
    try {
      const perm = await getCalendarPermissionStatus();
      setPermissionGranted(Boolean(perm.granted));
      setCanAskAgain(perm.canAskAgain);

      if (perm.granted) {
        const list = await listWritableDeviceCalendars();
        setCalendars(list);
      } else {
        setCalendars([]);
      }
      setTrackedCount(getTrackedCalendarEventCount());
    } catch {
      setCalendars([]);
    } finally {
      setLoadingCalendars(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPermissionsAndCalendars();
    }, [loadPermissionsAndCalendars])
  );

  useEffect(() => {
    setTrackedCount(getTrackedCalendarEventCount());
  }, [config.lastSyncedAt]);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const current = await getCalendarPermissionStatus();
    if (current.granted) {
      setPermissionGranted(true);
      return true;
    }
    const requested = await requestCalendarPermission();
    setPermissionGranted(Boolean(requested.granted));
    setCanAskAgain(requested.canAskAgain);
    if (requested.granted) {
      const list = await listWritableDeviceCalendars();
      setCalendars(list);
      return true;
    }
    if (!requested.canAskAgain) {
      Alert.alert(
        "Autorisation calendrier requise",
        "Active l'accès complet au calendrier dans les réglages de ton téléphone pour choisir où synchroniser tes cours.",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Ouvrir Réglages", onPress: () => void Linking.openSettings() },
        ]
      );
    }
    return false;
  }, []);

  const handleToggleEnabled = async (next: boolean) => {
    if (!next) {
      updateConfig({ enabled: false });
      return;
    }
    const ok = await ensurePermission();
    if (ok) {
      updateConfig({ enabled: true });
    }
  };

  const handleToggleCalendar = (cal: DeviceCalendarOption) => {
    const selected = config.targetCalendarIds.includes(cal.id);
    if (selected) {
      const nextIds = config.targetCalendarIds.filter(id => id !== cal.id);
      const existingForCal = getTrackedCalendarEventCount([cal.id]);
      updateConfig({ targetCalendarIds: nextIds });
      if (existingForCal > 0) {
        Alert.alert(
          `Retirer « ${cal.title} »`,
          `Veux-tu aussi supprimer les ${existingForCal} cours déjà ajoutés dans ce calendrier ?`,
          [
            { text: "Garder", style: "cancel" },
            {
              text: "Supprimer",
              style: "destructive",
              onPress: async () => {
                await clearSyncedCalendarEvents([cal.id]);
                setTrackedCount(getTrackedCalendarEventCount());
              },
            },
          ]
        );
      }
      return;
    }

    updateConfig({
      enabled: true,
      targetCalendarIds: [...config.targetCalendarIds, cal.id],
    });
  };

  const handleCreateDedicatedCalendar = async () => {
    if (creatingCalendar) return;
    const ok = await ensurePermission();
    if (!ok) return;
    setCreatingCalendar(true);
    try {
      const created = await createDedicatedPapillonCalendar();
      if (!created) {
        Alert.alert(
          "Création indisponible",
          "Impossible de créer un calendrier dédié automatiquement. Sélectionne simplement un calendrier existant dans la liste ci-dessus."
        );
        return;
      }
      await loadPermissionsAndCalendars();
      const nextIds = config.targetCalendarIds.includes(created.id)
        ? config.targetCalendarIds
        : [...config.targetCalendarIds, created.id];
      updateConfig({ enabled: true, targetCalendarIds: nextIds });
    } catch (error) {
      Alert.alert(
        "Erreur",
        `Impossible de créer le calendrier dédié : ${String(error)}`
      );
    } finally {
      setCreatingCalendar(false);
    }
  };

  const handleSyncNow = async () => {
    if (syncingNow) return;
    const ok = await ensurePermission();
    if (!ok) return;
    if (config.targetCalendarIds.length === 0) {
      Alert.alert(
        "Aucun calendrier sélectionné",
        "Choisis d'abord au moins un calendrier (iCloud ou Google) dans la liste ci-dessus."
      );
      return;
    }
    if (!config.enabled) {
      updateConfig({ enabled: true });
    }
    setSyncingNow(true);
    try {
      const result = await runCalendarSync({ fetchRemote: true, force: true });
      setTrackedCount(getTrackedCalendarEventCount());
      if (result) {
        Alert.alert(
          "Synchronisation terminée",
          `${result.created} ajouté(s), ${result.updated} modifié(s), ${result.deleted} supprimé(s), ${result.skipped} déjà à jour.`
        );
      }
    } catch (error) {
      Alert.alert("Erreur de synchronisation", String(error));
    } finally {
      setSyncingNow(false);
    }
  };

  const handleExportIcs = async () => {
    if (exportingIcs) return;
    setExportingIcs(true);
    try {
      const { courses } = await collectUpcomingCoursesForSync(config.weeksAhead, {
        fetchRemote: true,
      });
      if (courses.length === 0) {
        Alert.alert(
          "Aucun cours à exporter",
          "Aucun cours trouvé sur la période sélectionnée."
        );
        return;
      }
      await exportCoursesToIcsFile(courses, {
        includeCanceled: config.includeCanceled,
        includeEmoji: config.includeEmoji,
        includeDetails: config.includeDetails,
      });
    } catch (error) {
      Alert.alert("Erreur d'export .ics", String(error));
    } finally {
      setExportingIcs(false);
    }
  };

  const handleClearSyncedEvents = () => {
    Alert.alert(
      "Supprimer les cours synchronisés",
      "Seuls les événements ajoutés par Papillon + seront supprimés de tes calendriers. Tes événements personnels ne seront pas touchés.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const removed = await clearSyncedCalendarEvents();
            setTrackedCount(getTrackedCalendarEventCount());
            updateConfig({
              lastSyncedAt: new Date().toISOString(),
              lastSyncSummary: `${removed} cours retiré(s) du calendrier`,
            });
          },
        },
      ]
    );
  };

  const cycleWeeksAhead = () => {
    const idx = WEEK_OPTIONS.indexOf(config.weeksAhead);
    const next = WEEK_OPTIONS[(idx + 1) % WEEK_OPTIONS.length];
    updateConfig({ weeksAhead: next });
  };

  const isGranted = permissionGranted === true;
  const formattedLastSync = config.lastSyncedAt
    ? new Date(config.lastSyncedAt).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : undefined;

  return (
    <List
      style={{
        flex: 1,
        backgroundColor: themeColors.overground ?? colors.background,
      }}
      contentInsetAdjustmentBehavior="automatic"
      safeHorizontalPadding={16}
      contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
    >
      <List.Section>
        <List.SectionTitle>
          <List.Label>Synchronisation native</List.Label>
        </List.SectionTitle>

        {!isGranted && (
          <List.Item
            onPress={() => {
              if (!canAskAgain && permissionGranted !== null) {
                void Linking.openSettings();
              } else {
                void ensurePermission();
              }
            }}
          >
            <List.Leading>
              <Icon papicon opacity={0.8}>
                <Papicons name="Info" />
              </Icon>
            </List.Leading>
            <Typography variant="title">Autoriser l&apos;accès au calendrier</Typography>
            <Typography color="textSecondary" numberOfLines={3}>
              {!canAskAgain && permissionGranted !== null
                ? "Accès refusé. Touche pour ouvrir Réglages et activer l'accès complet."
                : "Requis pour afficher tes calendriers iCloud / Google et y synchroniser tes cours sans passer par l'API Google."}
            </Typography>
          </List.Item>
        )}

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name="Calendar" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Synchroniser les cours</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Écrit tes cours directement dans les calendriers choisis ci-dessous.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={config.enabled}
              onValueChange={val => void handleToggleEnabled(val)}
            />
          </List.Trailing>
        </List.Item>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name="Clock" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Synchronisation automatique</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Met à jour tes calendriers automatiquement lorsque ton emploi du temps change.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={config.autoSync}
              onValueChange={val => updateConfig({ autoSync: val })}
            />
          </List.Trailing>
        </List.Item>
      </List.Section>

      <List.Section>
        <List.SectionTitle>
          <List.Label>
            Calendriers de destination ({config.targetCalendarIds.length} sélectionné{config.targetCalendarIds.length > 1 ? "s" : ""})
          </List.Label>
        </List.SectionTitle>

        {loadingCalendars ? (
          <List.Item>
            <List.Leading>
              <ActivityIndicator />
            </List.Leading>
            <Typography color="textSecondary">
              Chargement des calendriers...
            </Typography>
          </List.Item>
        ) : !isGranted ? (
          <List.Item onPress={() => void ensurePermission()}>
            <Typography color="textSecondary">
              Autorise l&apos;accès au calendrier pour voir tes comptes iCloud et Google.
            </Typography>
          </List.Item>
        ) : calendars.length === 0 ? (
          <List.Item onPress={() => void loadPermissionsAndCalendars()}>
            <Typography variant="title">Aucun calendrier modifiable trouvé</Typography>
            <Typography color="textSecondary" numberOfLines={3}>
              {Platform.OS === "ios"
                ? "Ajoute ton compte iCloud ou Google dans Réglages iOS → Calendrier → Comptes, puis appuie ici pour actualiser."
                : "Ajoute ton compte Google dans l'application Google Agenda puis appuie ici pour actualiser."}
            </Typography>
          </List.Item>
        ) : (
          calendars.map(cal => {
            const isSelected = config.targetCalendarIds.includes(cal.id);
            const providerLabel = formatProviderLabel(cal.provider);
            const subtitle = cal.sourceName && cal.sourceName !== cal.title
              ? `${providerLabel} • ${cal.sourceName}`
              : providerLabel;
            return (
              <List.Item
                key={cal.id}
                onPress={() => handleToggleCalendar(cal)}
              >
                <List.Leading>
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: cal.color || String(colors.primary),
                      marginHorizontal: 6,
                    }}
                  />
                </List.Leading>
                <Typography variant="title" numberOfLines={1}>
                  {cal.title}
                </Typography>
                <Typography color="textSecondary" numberOfLines={1}>
                  {subtitle}
                </Typography>
                {isSelected && (
                  <List.Trailing>
                    <Icon papicon color={String(colors.primary)}>
                      <Papicons name="Check" />
                    </Icon>
                  </List.Trailing>
                )}
              </List.Item>
            );
          })
        )}

        {Platform.OS === "ios" && (
          <List.Item onPress={() => void handleCreateDedicatedCalendar()}>
            <List.Leading>
              {creatingCalendar ? (
                <ActivityIndicator />
              ) : (
                <Icon>
                  <Papicons name="Plus" />
                </Icon>
              )}
            </List.Leading>
            <Typography variant="title">Créer un calendrier « Papillon + »</Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              Crée un calendrier iCloud/local dédié pour garder tes cours séparés.
            </Typography>
          </List.Item>
        )}

        <List.Item onPress={() => void loadPermissionsAndCalendars()}>
          <List.Leading>
            <Icon>
              <Papicons name="ArrowDownBox" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Actualiser la liste</Typography>
          <Typography color="textSecondary" numberOfLines={3}>
            {Platform.OS === "ios"
              ? "Astuce iOS : pour Google Agenda, ajoute ton compte Google dans Réglages iOS → Calendrier → Comptes (sans limite d'API)."
              : "Astuce Android : crée un sous-calendrier « Cours » dans Google Agenda (sur le web) si tu veux séparer tes cours."}
          </Typography>
        </List.Item>
      </List.Section>

      <List.Section>
        <List.SectionTitle>
          <List.Label>Options</List.Label>
        </List.SectionTitle>

        <List.Item onPress={cycleWeeksAhead}>
          <List.Leading>
            <Icon>
              <Papicons name="Calendar" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Période synchronisée</Typography>
          <Typography color="textSecondary">
            Semaine en cours + {config.weeksAhead - 1} semaine(s) suivante(s)
          </Typography>
          <List.Trailing>
            <Typography variant="body1" color="primary" weight="semibold">
              {config.weeksAhead} sem.
            </Typography>
          </List.Trailing>
        </List.Item>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name="Sparkles" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Emoji de matière dans le titre</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Utilise tes noms et emojis personnalisés de matières.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={config.includeEmoji}
              onValueChange={val => updateConfig({ includeEmoji: val })}
            />
          </List.Trailing>
        </List.Item>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name="Pen" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Professeur, salle et infos</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Ajoute la salle en lieu et le professeur/groupe dans les notes.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={config.includeDetails}
              onValueChange={val => updateConfig({ includeDetails: val })}
            />
          </List.Trailing>
        </List.Item>

        <List.Item>
          <List.Leading>
            <Icon>
              <Papicons name="Cross" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Garder les cours annulés</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Préfixe par « [Annulé] » au lieu de retirer le cours du calendrier.
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={config.includeCanceled}
              onValueChange={val => updateConfig({ includeCanceled: val })}
            />
          </List.Trailing>
        </List.Item>
      </List.Section>

      <List.Section>
        <List.SectionTitle>
          <List.Label>Actions &amp; Export</List.Label>
        </List.SectionTitle>

        <List.Item onPress={() => void handleSyncNow()}>
          <List.Leading>
            {syncingNow ? (
              <ActivityIndicator />
            ) : (
              <Icon>
                <Papicons name="Check" />
              </Icon>
            )}
          </List.Leading>
          <Typography variant="title">Synchroniser maintenant</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            {formattedLastSync
              ? `Dernière synchro (${formattedLastSync})${config.lastSyncSummary ? ` • ${config.lastSyncSummary}` : ""}`
              : `${trackedCount} cours actuellement suivis`}
          </Typography>
        </List.Item>

        <List.Item onPress={() => void handleExportIcs()}>
          <List.Leading>
            {exportingIcs ? (
              <ActivityIndicator />
            ) : (
              <Icon>
                <Papicons name="ArrowUpBox" />
              </Icon>
            )}
          </List.Leading>
          <Typography variant="title">Exporter en fichier .ics</Typography>
          <Typography color="textSecondary" numberOfLines={2}>
            Génère un fichier iCalendar compatible Google Agenda, Apple Calendrier et Outlook.
          </Typography>
        </List.Item>

        {trackedCount > 0 && (
          <List.Item onPress={handleClearSyncedEvents}>
            <List.Leading>
              <Icon color="#D60046">
                <Papicons name="Trash" />
              </Icon>
            </List.Leading>
            <Typography variant="title" style={{ color: "#D60046" }}>
              Supprimer les cours synchronisés ({trackedCount})
            </Typography>
            <Typography color="textSecondary" numberOfLines={2}>
              Retire uniquement les événements créés par Papillon +.
            </Typography>
          </List.Item>
        )}
      </List.Section>
    </List>
  );
}
