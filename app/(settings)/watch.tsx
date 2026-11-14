import { Papicons } from "@getpapillon/papicons";
import { Directory, File, Paths } from "expo-file-system";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Share,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import packageJson from "@/package.json";
import {
  androidWidgetsAreSupported,
  getConnectedWearNodes,
  installApkOnPhone,
  reloadWidgets,
  sendApkToWatch,
  syncWatchSnapshotNow,
  WearNodeInfo,
} from "@/modules/papillon-android-widgets";
import {
  DEFAULT_WEAR_CONFIG,
  resolveWearConfig,
  useSettingsStore,
} from "@/stores/settings";
import { awardSharePoints } from "@/utils/rewards/rewardsService";
import {
  WearComplicationMetric,
  WearConfig,
  WearSectionId,
  WearTilePreset,
} from "@/stores/settings/types";
import Icon from "@/ui/components/Icon";
import Stack from "@/ui/components/Stack";
import NativeSwitch from "@/ui/native/NativeSwitch";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";

const REPO_SLUG = "timpim-dev/Papillon-beta";
const RELEASES_PAGE_URL = `https://github.com/${REPO_SLUG}/releases`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`;

interface GitHubReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
}

interface GitHubReleaseInfo {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  body?: string;
  assets: GitHubReleaseAsset[];
}

const SECTION_META: Array<{
  id: WearSectionId;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: "classes",
    title: "Emploi du temps",
    description: "Prochains cours, salles et professeurs",
    icon: "Calendar",
  },
  {
    id: "tasks",
    title: "Devoirs",
    description: "Consulter les détails et cocher comme terminé",
    icon: "tasks",
  },
  {
    id: "grades",
    title: "Notes",
    description: "Moyenne générale et dernières évaluations",
    icon: "Grades",
  },
  {
    id: "canteen",
    title: "Cartes cantine",
    description: "Solde et QR code au poignet",
    icon: "Card",
  },
];

const TILE_PRESET_META: Array<{
  id: WearTilePreset;
  title: string;
  description: string;
}> = [
  {
    id: "next_2_classes",
    title: "2 prochains cours",
    description: "Affiche tes 2 prochains cours avec heure et salle",
  },
  {
    id: "next_class_countdown",
    title: "1 cours + compte à rebours",
    description: "Affiche le temps restant avant ou pendant le cours suivant",
  },
  {
    id: "homework",
    title: "Devoirs à faire",
    description: "Affiche tes prochains devoirs non terminés",
  },
  {
    id: "grade_average",
    title: "Moyenne générale",
    description: "Met en avant ta moyenne générale et ta dernière note",
  },
  {
    id: "latest_grades",
    title: "Dernières notes",
    description: "Affiche tes 2 dernières évaluations reçues",
  },
  {
    id: "overview",
    title: "Résumé mixte",
    description: "Combine le prochain cours et les devoirs restants",
  },
];

const METRIC_META: Array<{
  id: WearComplicationMetric;
  title: string;
  description: string;
}> = [
  {
    id: "next_class",
    title: "Prochain cours",
    description: "Affiche le nom, l'heure et la salle du prochain cours",
  },
  {
    id: "next_class_countdown",
    title: "Compte à rebours cours",
    description: "Affiche le temps restant avant le prochain cours sur le cadran",
  },
  {
    id: "tasks_count",
    title: "Devoirs restants",
    description: "Compte le nombre de devoirs à faire sur la montre",
  },
  {
    id: "overall_average",
    title: "Moyenne générale",
    description: "Affiche ta moyenne générale actuelle sur le cadran",
  },
  {
    id: "latest_grade",
    title: "Dernière note",
    description: "Affiche ta note la plus récente et sa matière",
  },
];

function extractVersionParts(raw: string): number[] {
  const cleaned = raw.replace(/^[^0-9]*/, "");
  const match = cleaned.match(/\d+(?:\.\d+)*/);
  if (!match) {
    return [0];
  }
  return match[0].split(".").map(n => Number.parseInt(n, 10) || 0);
}

function compareVersions(remoteTag: string, localVersion: string): number {
  const a = extractVersionParts(remoteTag);
  const b = extractVersionParts(localVersion);
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) {
      return av > bv ? 1 : -1;
    }
  }
  return 0;
}

async function downloadReleaseAsset(asset: GitHubReleaseAsset): Promise<string> {
  const updatesDir = new Directory(Paths.cache, "papillon-updates");
  if (!updatesDir.exists) {
    updatesDir.create();
  }
  const destFile = new File(updatesDir, asset.name);
  if (destFile.exists) {
    destFile.delete();
  }
  const downloaded = await File.downloadFileAsync(
    asset.browser_download_url,
    destFile
  );
  return downloaded.uri;
}

export default function SettingsWatchPage() {
  const { colors } = useTheme();
  const themeColors = colors as typeof colors & { overground?: string };
  const textColor = String(colors.text);
  const currentVersion = packageJson.version || "0.0.0";

  const personalization = useSettingsStore(state => state.personalization);
  const mutateProperty = useSettingsStore(state => state.mutateProperty);
  const wearConfig = useMemo(
    () => resolveWearConfig(personalization),
    [personalization]
  );

  const [nodes, setNodes] = useState<WearNodeInfo[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [syncingWatch, setSyncingWatch] = useState(false);

  const [checkingRelease, setCheckingRelease] = useState(false);
  const [release, setRelease] = useState<GitHubReleaseInfo | null>(null);
  const [releaseStatusText, setReleaseStatusText] = useState<string>(
    `Version installée : v${currentVersion}`
  );
  const [installingTarget, setInstallingTarget] = useState<
    "phone" | "watch" | null
  >(null);

  const updateWearConfig = useCallback(
    (updater: (prev: WearConfig) => WearConfig) => {
      const next = updater(wearConfig);
      mutateProperty("personalization", { wearConfig: next });
    },
    [mutateProperty, wearConfig]
  );

  const refreshNodes = useCallback(async () => {
    if (!androidWidgetsAreSupported) {
      setNodes([]);
      return;
    }
    setLoadingNodes(true);
    try {
      const found = await getConnectedWearNodes();
      setNodes(found);
    } catch {
      setNodes([]);
    } finally {
      setLoadingNodes(false);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    setCheckingRelease(true);
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (response.status === 404) {
        setRelease(null);
        setReleaseStatusText(
          `Version installée : v${currentVersion} • Aucune release GitHub publiée`
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as GitHubReleaseInfo;
      setRelease(data);
      const cmp = compareVersions(data.tag_name, currentVersion);
      if (cmp > 0) {
        setReleaseStatusText(
          `Nouvelle version disponible : ${data.tag_name} (installée : v${currentVersion})`
        );
      } else {
        setReleaseStatusText(
          `À jour (${data.tag_name || `v${currentVersion}`})`
        );
      }
    } catch (error) {
      setReleaseStatusText(
        `Impossible de vérifier (${String(error)})`
      );
    } finally {
      setCheckingRelease(false);
    }
  }, [currentVersion]);

  useEffect(() => {
    refreshNodes();
    checkForUpdates();
  }, [refreshNodes, checkForUpdates]);

  const phoneAsset = useMemo(() => {
    return release?.assets?.find(
      asset =>
        asset.name.toLowerCase().endsWith(".apk") &&
        !asset.name.toLowerCase().includes("wear")
    );
  }, [release]);

  const wearAsset = useMemo(() => {
    return release?.assets?.find(
      asset =>
        asset.name.toLowerCase().endsWith(".apk") &&
        asset.name.toLowerCase().includes("wear")
    );
  }, [release]);

  const handleSyncNow = async () => {
    setSyncingWatch(true);
    try {
      await reloadWidgets();
      const pushed = await syncWatchSnapshotNow();
      await refreshNodes();
      Alert.alert(
        "Synchronisation",
        pushed
          ? "Les données et le thème ont été envoyés aux widgets et à la montre."
          : "Widgets rafraîchis. Ouvre l'accueil une fois pour générer les données si la montre vient d'être appairée."
      );
    } catch (error) {
      Alert.alert("Erreur", `Synchronisation échouée : ${String(error)}`);
    } finally {
      setSyncingWatch(false);
    }
  };

  const handleInstallPhoneApk = async () => {
    if (!phoneAsset) {
      Linking.openURL(release?.html_url ?? RELEASES_PAGE_URL);
      return;
    }
    setInstallingTarget("phone");
    try {
      const localUri = await downloadReleaseAsset(phoneAsset);
      const ok = await installApkOnPhone(localUri);
      if (!ok) {
        Alert.alert(
          "Installation",
          "Impossible de lancer l'installateur APK. Vérifie l'autorisation « Sources inconnues » pour Papillon +."
        );
      }
    } catch (error) {
      Alert.alert("Téléchargement", `Échec : ${String(error)}`);
    } finally {
      setInstallingTarget(null);
    }
  };

  const handlePushWatchApk = async () => {
    if (!wearAsset) {
      Linking.openURL(release?.html_url ?? RELEASES_PAGE_URL);
      return;
    }
    if (nodes.length === 0) {
      Alert.alert(
        "Aucune montre connectée",
        "Connecte ta montre Wear OS en Bluetooth au téléphone puis réessaie."
      );
      return;
    }
    setInstallingTarget("watch");
    try {
      const localUri = await downloadReleaseAsset(wearAsset);
      const ok = await sendApkToWatch(localUri);
      Alert.alert(
        ok ? "APK envoyé à la montre" : "Envoi impossible",
        ok
          ? "Ouvre Papillon + sur ta montre et touche « Installer mise à jour » si l'invite ne s'affiche pas automatiquement."
          : "Le transfert Wear Data Layer a échoué. Vérifie que la montre est proche et déverrouillée."
      );
    } catch (error) {
      Alert.alert("Téléchargement Wear OS", `Échec : ${String(error)}`);
    } finally {
      setInstallingTarget(null);
    }
  };

  const toggleSection = (sectionId: WearSectionId) => {
    updateWearConfig(prev => {
      const exists = prev.enabledSections.includes(sectionId);
      const enabledSections = exists
        ? prev.enabledSections.filter(id => id !== sectionId)
        : [...prev.enabledSections, sectionId];
      return { ...prev, enabledSections };
    });
  };

  const moveSection = (sectionId: WearSectionId, direction: -1 | 1) => {
    updateWearConfig(prev => {
      const idx = prev.enabledSections.indexOf(sectionId);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= prev.enabledSections.length) {
        return prev;
      }
      const next = [...prev.enabledSections];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return { ...prev, enabledSections: next };
    });
  };

  const orderedSections = useMemo(() => {
    const enabledOrdered = wearConfig.enabledSections
      .map(id => SECTION_META.find(item => item.id === id))
      .filter((item): item is (typeof SECTION_META)[number] => Boolean(item));
    const disabled = SECTION_META.filter(
      item => !wearConfig.enabledSections.includes(item.id)
    );
    return [...enabledOrdered, ...disabled];
  }, [wearConfig.enabledSections]);

  return (
    <List
      animated
      contentInsetAdjustmentBehavior="automatic"
      safeHorizontalPadding={16}
      contentContainerStyle={{ paddingVertical: 16 }}
      style={{
        flex: 1,
        backgroundColor: themeColors.overground ?? String(colors.background),
      }}
    >
      <List.Section id="wear-connection">
        <List.SectionTitle>
          <List.Label>Montre connectée</List.Label>
        </List.SectionTitle>

        {Platform.OS !== "android" ? (
          <List.Item id="wear-ios-info">
            <List.Leading>
              <Icon>
                <Papicons name="Info" />
              </Icon>
            </List.Leading>
            <Typography variant="title">Wear OS sur Android uniquement</Typography>
            <Typography variant="body2" color="textSecondary">
              La synchronisation directe Wear OS utilise Google Play Services sur Android.
            </Typography>
          </List.Item>
        ) : (
          <>
            <List.Item id="wear-node-status" onPress={refreshNodes}>
              <List.Leading>
                <Icon>
                  <Papicons name="Clock" />
                </Icon>
              </List.Leading>
              <Typography variant="title">
                {nodes.length > 0
                  ? nodes.map(n => n.displayName).join(", ")
                  : "Aucune montre détectée"}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {loadingNodes
                  ? "Recherche des appareils Wear OS..."
                  : nodes.length > 0
                    ? `${nodes.length} montre(s) connectée(s) • Toucher pour rafraîchir`
                    : "Vérifie le Bluetooth / compagnon Wear OS puis touche pour rafraîchir"}
              </Typography>
              <List.Trailing>
                {loadingNodes ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Papicons name="ChevronRight" opacity={0.6} />
                )}
              </List.Trailing>
            </List.Item>

            <List.Item id="wear-force-sync" onPress={handleSyncNow}>
              <List.Leading>
                <Icon>
                  <Papicons name="Sparkles" />
                </Icon>
              </List.Leading>
              <Typography variant="title">Synchroniser la montre et les widgets</Typography>
              <Typography variant="body2" color="textSecondary">
                Envoie le thème, le dégradé, les cours, devoirs et notes immédiatement
              </Typography>
              <List.Trailing>
                {syncingWatch ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Papicons name="ChevronRight" opacity={0.6} />
                )}
              </List.Trailing>
            </List.Item>
          </>
        )}
      </List.Section>

      <List.Section id="wear-customization">
        <List.SectionTitle>
          <List.Label>Apparence & Sections sur la montre</List.Label>
        </List.SectionTitle>

        <List.Item id="wear-sync-gradient">
          <List.Leading>
            <Icon>
              <Papicons name="Palette" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Synchroniser le thème et dégradé</Typography>
          <Typography variant="body2" color="textSecondary">
            Applique ta couleur Papillon + et ton dégradé sur l'accueil de la montre
          </Typography>
          <List.Trailing>
            <NativeSwitch
              value={wearConfig.syncThemeGradient}
              onValueChange={value =>
                updateWearConfig(prev => ({
                  ...prev,
                  syncThemeGradient: value,
                }))
              }
            />
          </List.Trailing>
        </List.Item>

        {orderedSections.map(section => {
          const enabledIndex = wearConfig.enabledSections.indexOf(section.id);
          const isEnabled = enabledIndex !== -1;
          const isFirst = enabledIndex === 0;
          const isLast = enabledIndex === wearConfig.enabledSections.length - 1;

          return (
            <List.Item key={section.id} id={`wear-sec-${section.id}`}>
              <List.Leading>
                <Icon>
                  <Papicons name={section.icon} />
                </Icon>
              </List.Leading>
              <Typography variant="title">{section.title}</Typography>
              <Typography variant="body2" color="textSecondary">
                {section.description}
              </Typography>
              <List.Trailing>
                <Stack direction="horizontal" vAlign="center" gap={6}>
                  {isEnabled && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Pressable
                        hitSlop={8}
                        disabled={isFirst}
                        onPress={() => moveSection(section.id, -1)}
                        style={{
                          padding: 6,
                          borderRadius: 10,
                          backgroundColor: textColor + "0F",
                          opacity: isFirst ? 0.3 : 1,
                        }}
                      >
                        <Papicons name="ChevronUp" size={16} color={textColor} />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        disabled={isLast}
                        onPress={() => moveSection(section.id, 1)}
                        style={{
                          padding: 6,
                          borderRadius: 10,
                          backgroundColor: textColor + "0F",
                          opacity: isLast ? 0.3 : 1,
                        }}
                      >
                        <Papicons name="ChevronDown" size={16} color={textColor} />
                      </Pressable>
                    </View>
                  )}
                  <NativeSwitch
                    value={isEnabled}
                    onValueChange={() => toggleSection(section.id)}
                  />
                </Stack>
              </List.Trailing>
            </List.Item>
          );
        })}

        <List.Item
          id="wear-reset-config"
          onPress={() =>
            mutateProperty("personalization", {
              wearConfig: { ...DEFAULT_WEAR_CONFIG },
            })
          }
        >
          <List.Leading>
            <Icon>
              <Papicons name="Trash" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Réinitialiser la montre</Typography>
          <Typography variant="body2" color="textSecondary">
            Restaure les sections et le thème par défaut
          </Typography>
        </List.Item>
      </List.Section>

      <List.Section id="wear-tile-preset">
        <List.SectionTitle>
          <List.Label>Tuile / Widget sur la montre</List.Label>
        </List.SectionTitle>
        {TILE_PRESET_META.map(preset => {
          const selected = (wearConfig.tilePreset ?? DEFAULT_WEAR_CONFIG.tilePreset) === preset.id;
          return (
            <List.Item
              key={preset.id}
              id={`tile-${preset.id}`}
              onPress={() =>
                updateWearConfig(prev => ({
                  ...prev,
                  tilePreset: preset.id,
                }))
              }
            >
              <Typography variant="title">{preset.title}</Typography>
              <Typography variant="body2" color="textSecondary">
                {preset.description}
              </Typography>
              <List.Trailing>
                {selected ? (
                  <Papicons name="Check" color={String(colors.primary)} />
                ) : null}
              </List.Trailing>
            </List.Item>
          );
        })}
      </List.Section>

      <List.Section id="wear-complication-metric">
        <List.SectionTitle>
          <List.Label>Complication du cadran</List.Label>
        </List.SectionTitle>
        {METRIC_META.map(metric => {
          const selected = wearConfig.complicationMetric === metric.id;
          return (
            <List.Item
              key={metric.id}
              id={`metric-${metric.id}`}
              onPress={() =>
                updateWearConfig(prev => ({
                  ...prev,
                  complicationMetric: metric.id,
                }))
              }
            >
              <Typography variant="title">{metric.title}</Typography>
              <Typography variant="body2" color="textSecondary">
                {metric.description}
              </Typography>
              <List.Trailing>
                {selected ? (
                  <Papicons name="Check" color={String(colors.primary)} />
                ) : null}
              </List.Trailing>
            </List.Item>
          );
        })}
      </List.Section>

      <List.Section id="github-updater">
        <List.SectionTitle>
          <List.Label>Mises à jour GitHub (Papillon +)</List.Label>
        </List.SectionTitle>

        <List.Item id="check-updates" onPress={checkForUpdates}>
          <List.Leading>
            <Icon>
              <Papicons name="Gears" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Vérifier les mises à jour</Typography>
          <Typography variant="body2" color="textSecondary">
            {releaseStatusText}
          </Typography>
          <List.Trailing>
            {checkingRelease ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Papicons name="ChevronRight" opacity={0.6} />
            )}
          </List.Trailing>
        </List.Item>

        {Platform.OS === "android" && (
          <>
            <List.Item id="install-phone-apk" onPress={handleInstallPhoneApk}>
              <List.Leading>
                <Icon>
                  <Papicons name="Butterfly" />
                </Icon>
              </List.Leading>
              <Typography variant="title">
                Installer mise à jour téléphone
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {phoneAsset
                  ? `Télécharger et installer ${phoneAsset.name}`
                  : "Ouvrir la page des releases GitHub"}
              </Typography>
              <List.Trailing>
                {installingTarget === "phone" ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Papicons name="ChevronRight" opacity={0.6} />
                )}
              </List.Trailing>
            </List.Item>

            <List.Item id="install-watch-apk" onPress={handlePushWatchApk}>
              <List.Leading>
                <Icon>
                  <Papicons name="Clock" />
                </Icon>
              </List.Leading>
              <Typography variant="title">
                Installer / mettre à jour sur la montre
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {wearAsset
                  ? `Envoyer ${wearAsset.name} vers la montre connectée`
                  : "Aucune release Wear APK trouvée (ouvrir GitHub)"}
              </Typography>
              <List.Trailing>
                {installingTarget === "watch" ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Papicons name="ChevronRight" opacity={0.6} />
                )}
              </List.Trailing>
            </List.Item>
          </>
        )}

        <List.Item
          id="open-releases-page"
          onPress={() => Linking.openURL(release?.html_url ?? RELEASES_PAGE_URL)}
        >
          <List.Leading>
            <Icon>
              <Papicons name="Globe" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Voir toutes les releases</Typography>
          <Typography variant="body2" color="textSecondary">
            github.com/{REPO_SLUG}/releases
          </Typography>
          <List.Trailing>
            <Papicons name="ChevronRight" opacity={0.6} />
          </List.Trailing>
        </List.Item>
      </List.Section>

      <List.Section id="share-papillon-plus">
        <List.SectionTitle>
          <List.Label>Partager Papillon + à tes amis</List.Label>
        </List.SectionTitle>

        <List.View>
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 16,
              gap: 12,
            }}
          >
            <View
              style={{
                backgroundColor: "#FFFFFF",
                padding: 14,
                borderRadius: 18,
              }}
            >
              <QRCode value={RELEASES_PAGE_URL} size={172} />
            </View>
            <Typography
              variant="body2"
              color="textSecondary"
              style={{ textAlign: "center" }}
            >
              Scanne ce QR code pour télécharger Papillon + (téléphone et Wear OS)
            </Typography>
          </View>
        </List.View>

        <List.Item
          id="share-link-action"
          onPress={() => {
            void Share.share({
              message: `Télécharge Papillon + : ${RELEASES_PAGE_URL}`,
              url: RELEASES_PAGE_URL,
            });
            void awardSharePoints("link_share");
          }}
        >
          <List.Leading>
            <Icon>
              <Papicons name="Plus" />
            </Icon>
          </List.Leading>
          <Typography variant="title">Partager le lien de téléchargement</Typography>
          <Typography variant="body2" color="textSecondary">
            {RELEASES_PAGE_URL}
          </Typography>
          <List.Trailing>
            <Papicons name="ChevronRight" opacity={0.6} />
          </List.Trailing>
        </List.Item>
      </List.Section>
    </List>
  );
}
