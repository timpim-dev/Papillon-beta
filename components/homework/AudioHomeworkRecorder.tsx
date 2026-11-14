import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "expo-router/react-navigation";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { InlineAudioPlayer } from "@/components/attachments/AttachmentViewerModal";
import { useAccountStore } from "@/stores/account";
import { getManager } from "@/services/shared";
import { Attachment } from "@/services/shared/attachment";
import { Homework, ReturnFormat } from "@/services/shared/homework";
import {
  classifyAttachment,
  openAttachmentViewer,
} from "@/utils/attachments/attachmentViewer";
import {
  getHomeworkUploadMeta,
  saveHomeworkUploadMeta,
} from "@/utils/homework/uploadMeta";

interface AudioHomeworkRecorderProps {
  homework: Homework;
  accentColor?: string;
  onUpdated?: (updated: Homework) => void;
}

function formatMillis(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioHomeworkRecorder({
  homework,
  accentColor,
  onUpdated,
}: AudioHomeworkRecorderProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const accent = accentColor || String(colors.primary || "#6366F1");
  const textColor = String(colors.text);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedDurationMs, setRecordedDurationMs] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const [uploadedAttachment, setUploadedAttachment] = useState<Attachment | undefined>(
    homework.uploadedAttachment
  );
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const meta = getHomeworkUploadMeta(homework.id);
    if (homework.uploadedAttachment) {
      setUploadedAttachment(homework.uploadedAttachment);
    } else if (meta?.uploadedAttachment) {
      setUploadedAttachment(meta.uploadedAttachment);
    }
  }, [homework.id, homework.uploadedAttachment]);

  const isAudioMode = homework.returnFormat === ReturnFormat.AUDIO_RECORDING;
  const maxBytes =
    homework.maxUploadSizeBytes ??
    getHomeworkUploadMeta(homework.id)?.maxUploadSizeBytes;

  const ensureAccountId = (): string => {
    if (homework.createdByAccount) return homework.createdByAccount;
    const lastId = useAccountStore.getState().lastUsedAccount;
    return lastId || "";
  };

  const handleStartRecording = async () => {
    setStatusMessage(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission micro requise",
        "Autorise l'accès au micro dans les paramètres pour enregistrer ton devoir audio."
      );
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordedUri(null);
      setSelectedFile(null);
    } catch (err) {
      setStatusMessage(
        err instanceof Error
          ? err.message
          : "Impossible de démarrer l'enregistrement."
      );
    }
  };

  const handleStopRecording = async () => {
    try {
      const duration = recorderState.durationMillis || Math.round((recorder.currentTime || 0) * 1000);
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      if (recorder.uri) {
        setRecordedUri(recorder.uri);
        setRecordedDurationMs(duration);
      }
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Erreur à l'arrêt du micro."
      );
    }
  };

  const handlePickFile = async () => {
    setStatusMessage(null);
    try {
      const picked = await File.pickFileAsync({
        multipleFiles: false,
      });
      if ("canceled" in picked && picked.canceled) return;

      const file = "result" in picked && !Array.isArray(picked.result)
        ? picked.result
        : Array.isArray(picked)
          ? picked[0]
          : null;

      if (!file) return;

      setRecordedUri(null);
      setSelectedFile({
        uri: file.uri,
        name: file.name || `devoir_${Date.now()}`,
        mimeType: file.type || "application/octet-stream",
        size: typeof file.size === "number" ? file.size : undefined,
      });
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Impossible de sélectionner ce fichier."
      );
    }
  };

  const handleUpload = async () => {
    const accountId = ensureAccountId();
    if (!accountId) {
      setStatusMessage("Aucun compte Pronote actif.");
      return;
    }

    const payload = recordedUri
      ? (() => {
          const fsFile = new File(recordedUri);
          const safeSubject = (homework.subject || "audio")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 24);
          return {
            uri: recordedUri,
            name: `${safeSubject || "devoir"}_${Date.now()}.m4a`,
            mimeType: "audio/mp4",
            size: typeof fsFile.size === "number" ? fsFile.size : undefined,
          };
        })()
      : selectedFile;

    if (!payload) return;

    if (typeof maxBytes === "number" && typeof payload.size === "number" && payload.size > maxBytes) {
      setStatusMessage(
        `Fichier trop volumineux (${Math.round(payload.size / (1024 * 1024))} Mo > ${Math.round(maxBytes / (1024 * 1024))} Mo max).`
      );
      return;
    }

    setUploading(true);
    setStatusMessage(null);
    try {
      const manager = getManager();
      const targetHomework: Homework = {
        ...homework,
        createdByAccount: accountId,
      };
      const updated = await manager.uploadHomeworkFile(targetHomework, payload);
      setUploadedAttachment(updated.uploadedAttachment);
      setRecordedUri(null);
      setSelectedFile(null);
      saveHomeworkUploadMeta(homework.id, {
        canUpload: true,
        uploadedAttachment: updated.uploadedAttachment,
        maxUploadSizeBytes: maxBytes,
        pronoteAssignmentId: updated.pronoteAssignmentId,
      });
      setStatusMessage("Rendu envoyé sur Pronote !");
      onUpdated?.(updated);
    } catch (err) {
      setStatusMessage(
        err instanceof Error
          ? err.message
          : "Échec de l'envoi sur Pronote."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveUploaded = () => {
    Alert.alert(
      "Supprimer le fichier rendu ?",
      "Pronote retirera ton rendu actuel afin que tu puisses en renvoyer un autre.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const accountId = ensureAccountId();
            if (!accountId) return;
            setRemoving(true);
            setStatusMessage(null);
            try {
              const manager = getManager();
              const updated = await manager.removeHomeworkFile({
                ...homework,
                createdByAccount: accountId,
              });
              setUploadedAttachment(undefined);
              setStatusMessage("Rendu supprimé.");
              onUpdated?.(updated);
            } catch (err) {
              setStatusMessage(
                err instanceof Error
                  ? err.message
                  : "Impossible de supprimer le rendu."
              );
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.badgeIcon, { backgroundColor: `${accent}1E` }]}>
          <Papicons
            name={isAudioMode ? "Volume" : "Paper"}
            size={18}
            color={accent}
          />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, { color: colors.text }]}>
            {isAudioMode ? "Rendu audio Pronote" : "Rendre mon travail"}
          </Text>
          <Text style={[styles.subtitle, { color: `${textColor}88` }]}>
            {isAudioMode
              ? "Enregistre ta voix directement dans Papillon et envoie-la"
              : "Sélectionne un fichier ou enregistre un audio à remettre"}
            {maxBytes ? ` · Max ${Math.max(1, Math.round(maxBytes / (1024 * 1024)))} Mo` : ""}
          </Text>
        </View>
      </View>

      {uploadedAttachment ? (
        <View
          style={[
            styles.submittedBox,
            { backgroundColor: "#10B98114", borderColor: "#10B98155" },
          ]}
        >
          <View style={styles.submittedTopRow}>
            <Papicons name="Check" size={18} color="#10B981" />
            <Text numberOfLines={1} style={[styles.submittedName, { color: textColor }]}>
              Rendu : {uploadedAttachment.name}
            </Text>
          </View>
          <View style={styles.submittedActions}>
            <Pressable
              onPress={() => openAttachmentViewer(router, uploadedAttachment)}
              style={[styles.smallBtn, { backgroundColor: `${accent}20` }]}
            >
              <Papicons
                name={classifyAttachment(uploadedAttachment) === "audio" ? "Play" : "ExternalLink"}
                size={15}
                color={accent}
              />
              <Text style={[styles.smallBtnText, { color: accent }]}>
                {classifyAttachment(uploadedAttachment) === "audio" ? "Écouter" : "Voir"}
              </Text>
            </Pressable>

            <Pressable
              disabled={removing}
              onPress={handleRemoveUploaded}
              style={[styles.smallBtn, { backgroundColor: "#EF44441A" }]}
            >
              {removing ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Papicons name="Trash" size={15} color="#EF4444" />
                  <Text style={[styles.smallBtnText, { color: "#EF4444" }]}>
                    Retirer
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {recorderState.isRecording ? (
        <View style={[styles.recordingBox, { backgroundColor: "#EF444414", borderColor: "#EF444455" }]}>
          <View style={styles.recordingStatusRow}>
            <View style={styles.redDot} />
            <Text style={[styles.recordingLabel, { color: "#EF4444" }]}>
              Enregistrement en cours · {formatMillis(recorderState.durationMillis)}
            </Text>
          </View>
          <Pressable
            onPress={handleStopRecording}
            style={[styles.primaryBtn, { backgroundColor: "#EF4444" }]}
          >
            <Papicons name="Pause" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Arrêter</Text>
          </Pressable>
        </View>
      ) : recordedUri ? (
        <View style={styles.previewWrap}>
          <InlineAudioPlayer
            sourceUri={recordedUri}
            title={`Préécoute (${formatMillis(recordedDurationMs)})`}
            accentColor={accent}
          />
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setRecordedUri(null)}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
            >
              <Papicons name="Trash" size={16} color={textColor} />
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>
                Recommencer
              </Text>
            </Pressable>

            <Pressable
              disabled={uploading}
              onPress={handleUpload}
              style={[styles.primaryBtn, { backgroundColor: accent, flex: 1 }]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Papicons name="ArrowUpBox" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Envoyer à Pronote</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : selectedFile ? (
        <View style={styles.previewWrap}>
          <View style={[styles.selectedFileBox, { backgroundColor: `${textColor}0A` }]}>
            <Papicons name="Paper" size={18} color={accent} />
            <Text numberOfLines={1} style={[styles.selectedFileName, { color: textColor }]}>
              {selectedFile.name}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setSelectedFile(null)}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
            >
              <Papicons name="Cross" size={16} color={textColor} />
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>
                Annuler
              </Text>
            </Pressable>

            <Pressable
              disabled={uploading}
              onPress={handleUpload}
              style={[styles.primaryBtn, { backgroundColor: accent, flex: 1 }]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Papicons name="ArrowUpBox" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Envoyer à Pronote</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleStartRecording}
            style={[
              styles.primaryBtn,
              { backgroundColor: accent, flex: 1 },
            ]}
          >
            <Papicons name="Volume" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>
              {uploadedAttachment ? "Réenregistrer un audio" : "Enregistrer un audio"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handlePickFile}
            style={[
              styles.secondaryBtn,
              { borderColor: colors.border },
            ]}
          >
            <Papicons name="Folder" size={16} color={textColor} />
            <Text style={[styles.secondaryBtnText, { color: textColor }]}>
              Fichier
            </Text>
          </Pressable>
        </View>
      )}

      {statusMessage ? (
        <Text style={[styles.statusNote, { color: `${textColor}AA` }]}>
          {statusMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  badgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  submittedBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  submittedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submittedName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  submittedActions: {
    flexDirection: "row",
    gap: 8,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  smallBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  recordingBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    alignItems: "center",
  },
  recordingStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recordingLabel: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  previewWrap: {
    gap: 10,
  },
  selectedFileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  selectedFileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  statusNote: {
    fontSize: 12,
    textAlign: "center",
  },
});
