import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "expo-router/react-navigation";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { File } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";

import {
  AttachmentPreviewKind,
  CachedAttachmentFile,
  classifyAttachment,
  downloadAttachmentToCache,
  extractAttachmentExtension,
  formatAttachmentTitle,
  getAttachmentPreviewBadge,
  previewLocalOrRemoteAttachment,
  PRONOTE_MOBILE_USER_AGENT,
} from "@/utils/attachments/attachmentViewer";

export interface AttachmentViewerModalProps {
  name?: string;
  url: string;
  type?: number;
  onClose: () => void;
}

function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function InlineAudioPlayer({
  sourceUri,
  title,
  accentColor,
}: {
  sourceUri: string;
  title?: string;
  accentColor?: string;
}) {
  const { colors } = useTheme();
  const accent = accentColor || String(colors.primary || "#6366F1");
  const textColor = String(colors.text);
  const player = useAudioPlayer(sourceUri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).catch(() => {});
  }, []);

  const duration = status.duration || player.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const togglePlay = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (duration > 0 && currentTime >= duration - 0.3) {
        player.seekTo(0).then(() => player.play()).catch(() => player.play());
      } else {
        player.play();
      }
    }
  };

  const seekBy = (deltaSeconds: number) => {
    const next = Math.max(0, Math.min(duration || currentTime + deltaSeconds, currentTime + deltaSeconds));
    player.seekTo(next).catch(() => {});
  };

  return (
    <View
      style={[
        styles.audioCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {title ? (
        <View style={styles.audioTitleRow}>
          <Papicons name="Volume" size={18} color={accent} />
          <Text
            numberOfLines={2}
            style={[styles.audioTitle, { color: colors.text }]}
          >
            {title}
          </Text>
        </View>
      ) : null}

      <View style={[styles.progressTrack, { backgroundColor: `${String(colors.text)}18` }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: accent,
            },
          ]}
        />
      </View>

      <View style={styles.audioTimesRow}>
        <Text style={[styles.timeText, { color: `${String(colors.text)}99` }]}>
          {formatDurationSeconds(currentTime)}
        </Text>
        <Text style={[styles.timeText, { color: `${String(colors.text)}99` }]}>
          {duration > 0 ? formatDurationSeconds(duration) : "--:--"}
        </Text>
      </View>

      <View style={styles.audioControlsRow}>
        <Pressable
          onPress={() => seekBy(-10)}
          style={[styles.seekChip, { backgroundColor: `${String(colors.text)}10` }]}
        >
          <Text style={[styles.seekChipText, { color: colors.text }]}>-10s</Text>
        </Pressable>

        <Pressable
          onPress={togglePlay}
          style={[styles.playButton, { backgroundColor: accent }]}
        >
          <Papicons
            name={status.playing ? "Pause" : "Play"}
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.playButtonText}>
            {status.playing ? "Pause" : "Écouter"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => seekBy(10)}
          style={[styles.seekChip, { backgroundColor: `${String(colors.text)}10` }]}
        >
          <Text style={[styles.seekChipText, { color: colors.text }]}>+10s</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VideoPreview({ sourceUri }: { sourceUri: string }) {
  const player = useVideoPlayer(sourceUri, instance => {
    instance.loop = false;
  });

  return (
    <View style={styles.videoWrapper}>
      <VideoView
        player={player}
        style={styles.videoView}
        nativeControls
        contentFit="contain"
      />
    </View>
  );
}

export function AttachmentViewerModal({
  name,
  url,
  type = 1,
  onClose,
}: AttachmentViewerModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = String(colors.primary || "#6366F1");
  const textColor = String(colors.text);

  const attachment = useMemo(
    () => ({ name, url, type }),
    [name, url, type]
  );
  const title = useMemo(() => formatAttachmentTitle(attachment), [attachment]);
  const kind: AttachmentPreviewKind = useMemo(
    () => classifyAttachment(attachment),
    [attachment]
  );
  const ext = useMemo(() => extractAttachmentExtension(name, url), [name, url]);
  const badgeLabel = getAttachmentPreviewBadge(kind);

  const [cachedFile, setCachedFile] = useState<CachedAttachmentFile | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [fileSizeLabel, setFileSizeLabel] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(kind !== "link");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState<number>(0);

  useEffect(() => {
    let active = true;

    if (!url) {
      setLoading(false);
      setErrorMsg("Aucune URL fournie pour cette pièce jointe.");
      return;
    }

    if (kind === "link") {
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setCachedFile(null);
    setTextContent(null);

    downloadAttachmentToCache(attachment)
      .then(async result => {
        if (!active) return;
        setCachedFile(result);

        try {
          const fsFile = new File(result.uri);
          const size = fsFile.size;
          if (typeof size === "number" && size > 0) {
            setFileSizeLabel(
              size >= 1024 * 1024
                ? `${(size / (1024 * 1024)).toFixed(1)} Mo`
                : `${Math.max(1, Math.round(size / 1024))} Ko`
            );
          }
        } catch {
          // Optional file size indicator
        }

        if (kind === "text") {
          try {
            const raw = await result.readText();
            if (!active) return;
            const capped =
              raw.length > 200_000
                ? `${raw.slice(0, 200_000)}\n\n… (aperçu tronqué à 200 000 caractères)`
                : raw;
            setTextContent(capped);
          } catch {
            if (!active) return;
            setTextContent(null);
          }
        }

        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Impossible de charger la pièce jointe."
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attachment, kind, url]);

  const handleOpenExternal = async () => {
    try {
      await previewLocalOrRemoteAttachment(cachedFile?.uri ?? null, attachment);
    } catch {
      if (url) {
        try {
          await WebBrowser.openBrowserAsync(url, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
          });
        } catch {
          await Linking.openURL(url).catch(() => {});
        }
      }
    }
  };

  const handleOpenBrowser = async () => {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
    } catch {
      await Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 12) + 4,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTextWrap}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.headerSubtitle, { color: `${String(colors.text)}88` }]}>
            {badgeLabel}
            {ext ? ` · .${ext.toUpperCase()}` : ""}
            {fileSizeLabel ? ` · ${fileSizeLabel}` : ""}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {kind === "link" ? (
            <Pressable
              onPress={() => setWebViewKey(prev => prev + 1)}
              style={[styles.iconBtn, { backgroundColor: `${textColor}10` }]}
            >
              <Papicons name="ArrowLeftUp" size={18} color={textColor} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleOpenExternal}
            style={[styles.iconBtn, { backgroundColor: `${textColor}10` }]}
          >
            <Papicons name="ExternalLink" size={18} color={textColor} />
          </Pressable>

          <Pressable
            onPress={onClose}
            style={[styles.iconBtn, { backgroundColor: `${textColor}12` }]}
          >
            <Papicons name="Cross" size={18} color={textColor} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {loading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[styles.stateText, { color: `${String(colors.text)}99` }]}>
              Téléchargement sécurisé…
            </Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centeredState}>
            <Papicons name="AlertCircle" size={40} color="#EF4444" />
            <Text style={[styles.stateTitle, { color: colors.text }]}>
              Aperçu indisponible
            </Text>
            <Text style={[styles.stateText, { color: `${String(colors.text)}99` }]}>
              {errorMsg}
            </Text>
            <Pressable
              onPress={handleOpenBrowser}
              style={[styles.primaryBtn, { backgroundColor: accent }]}
            >
              <Papicons name="ExternalLink" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Ouvrir dans le navigateur</Text>
            </Pressable>
          </View>
        ) : kind === "image" && cachedFile ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.imageScrollContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
          >
            <Image
              source={{ uri: cachedFile.uri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </ScrollView>
        ) : kind === "audio" && cachedFile ? (
          <View style={styles.centeredState}>
            <View style={[styles.iconCircle, { backgroundColor: `${accent}1A` }]}>
              <Papicons name="Volume" size={34} color={accent} />
            </View>
            <InlineAudioPlayer
              sourceUri={cachedFile.uri}
              title={title}
              accentColor={accent}
            />
            <Pressable
              onPress={handleOpenExternal}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
            >
              <Papicons name="ExternalLink" size={16} color={textColor} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                Ouvrir avec une app
              </Text>
            </Pressable>
          </View>
        ) : kind === "video" && cachedFile ? (
          <View style={styles.centeredState}>
            <VideoPreview sourceUri={cachedFile.uri} />
            <Pressable
              onPress={handleOpenExternal}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
            >
              <Papicons name="ExternalLink" size={16} color={textColor} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                Ouvrir avec une app
              </Text>
            </Pressable>
          </View>
        ) : kind === "pdf" && cachedFile ? (
          Platform.OS === "ios" ? (
            <WebView
              style={styles.fill}
              source={{ uri: cachedFile.uri }}
              allowingReadAccessToURL={cachedFile.uri}
              originWhitelist={["*"]}
            />
          ) : (
            <View style={styles.centeredState}>
              <View style={[styles.iconCircle, { backgroundColor: `${accent}1A` }]}>
                <Papicons name="Paper" size={34} color={accent} />
              </View>
              <Text style={[styles.stateTitle, { color: colors.text }]}>
                Document PDF prêt
              </Text>
              <Text style={[styles.stateText, { color: `${String(colors.text)}99` }]}>
                Le fichier a été téléchargé localement ({fileSizeLabel || "prêt"}) avec tes identifiants Pronote.
              </Text>
              <Pressable
                onPress={handleOpenExternal}
                style={[styles.primaryBtn, { backgroundColor: accent }]}
              >
                <Papicons name="Paper" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Ouvrir le PDF</Text>
              </Pressable>
              <Pressable
                onPress={handleOpenBrowser}
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
              >
                <Papicons name="ExternalLink" size={16} color={textColor} />
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                  Ouvrir dans le navigateur
                </Text>
              </Pressable>
            </View>
          )
        ) : kind === "text" && textContent !== null ? (
          ext === "html" || ext === "htm" ? (
            <WebView
              style={styles.fill}
              originWhitelist={["*"]}
              source={{ html: textContent }}
            />
          ) : (
            <ScrollView
              style={styles.fill}
              contentContainerStyle={styles.textContainer}
            >
              <Text
                selectable
                style={[
                  styles.textContent,
                  {
                    color: colors.text,
                    fontFamily:
                      ext === "json" || ext === "csv" || ext === "xml"
                        ? Platform.select({ ios: "Menlo", android: "monospace" })
                        : undefined,
                  },
                ]}
              >
                {textContent}
              </Text>
            </ScrollView>
          )
        ) : kind === "link" ? (
          <View style={styles.fill}>
            <WebView
              key={webViewKey}
              style={styles.fill}
              source={{ uri: url }}
              userAgent={PRONOTE_MOBILE_USER_AGENT}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webLoadingOverlay}>
                  <ActivityIndicator size="large" color={accent} />
                </View>
              )}
            />
          </View>
        ) : (
          <View style={styles.centeredState}>
            <View style={[styles.iconCircle, { backgroundColor: `${accent}1A` }]}>
              <Papicons name="Paper" size={34} color={accent} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.text }]}>
              {title}
            </Text>
            <Text style={[styles.stateText, { color: `${String(colors.text)}99` }]}>
              Ce format ne peut pas être affiché directement ici, mais le fichier est prêt pour une application externe.
            </Text>
            <Pressable
              onPress={handleOpenExternal}
              style={[styles.primaryBtn, { backgroundColor: accent }]}
            >
              <Papicons name="ExternalLink" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Ouvrir avec une app</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  stateText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  fullImage: {
    width: "100%",
    height: "100%",
    minHeight: 360,
  },
  audioCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  audioTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  audioTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  audioTimesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  audioControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  playButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  seekChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  seekChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  videoWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  videoView: {
    width: "100%",
    height: "100%",
  },
  textContainer: {
    padding: 16,
  },
  textContent: {
    fontSize: 14,
    lineHeight: 21,
  },
  webLoadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
