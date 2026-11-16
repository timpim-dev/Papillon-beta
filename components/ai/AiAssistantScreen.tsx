import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AiMarkdownText from "@/components/ai/AiMarkdownText";
import { useSettingsStore } from "@/stores/settings";
import ChipButton from "@/ui/components/ChipButton";
import KeyboardAvoidingContainer, { useKeyboardVisible } from "@/ui/components/KeyboardAvoidingContainer";
import Stack from "@/ui/components/Stack";
import TabHeader from "@/ui/components/TabHeader";
import TabHeaderTitle from "@/ui/components/TabHeaderTitle";
import Typography from "@/ui/new/Typography";
import {
  AI_PROVIDER_PRESETS,
  AiChatMessage,
  AiFlashcardItem,
  AiLatexSheet,
  AiProviderId,
  AiReminderAction,
  buildSocraticSystemPrompt,
  clearAiChatHistory,
  getAiChatHistory,
  getStoredAiApiKey,
  saveAiChatHistory,
  sendAiChatCompletion,
} from "@/utils/ai/aiClient";
import {
  ExportedLatexFiles,
  exportLatexSheetFiles,
  shareExportedFile,
} from "@/utils/ai/latexPdf";
import { openAttachmentViewer } from "@/utils/attachments/attachmentViewer";
import {
  buildStudentContextSnapshot,
  formatContextForPrompt,
  StudentContextScope,
} from "@/utils/ai/studentContextBuilder";
import { scheduleStudyReminder } from "@/utils/notifications/homeworkReminders";

const STARTER_PROMPTS = [
  "Préparer un plan de révision pour cette semaine",
  "Crée une fiche de révision PDF (LaTeX) sur mon prochain cours",
  "Aide-moi sur mon prochain devoir étape par étape",
  "Analyser mes points faibles dans mes notes",
  "Fais-moi un quiz de révision rapide",
];

function FlashcardCard({ card }: { card: AiFlashcardItem }) {
  const { colors } = useTheme();
  const [flipped, setFlipped] = useState(false);

  return (
    <Pressable
      onPress={() => setFlipped(prev => !prev)}
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: String(colors.primary) + "44",
        backgroundColor: flipped ? String(colors.primary) + "14" : colors.background,
      }}
    >
      <Typography variant="caption" style={{ color: String(colors.primary), fontWeight: "700" }}>
        {flipped ? "RÉPONSE" : card.subject ? `FLASHCARD • ${card.subject}` : "FLASHCARD"} (toucher pour retourner)
      </Typography>
      <Typography variant="body1" style={{ marginTop: 4 }}>
        {flipped ? card.back : card.front}
      </Typography>
    </Pressable>
  );
}

function ReminderActionCard({
  reminder,
  confirmed,
  onConfirm,
}: {
  reminder: AiReminderAction;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const { colors } = useTheme();
  const triggerDate = new Date(reminder.triggerIso);
  const whenLabel = Number.isNaN(triggerDate.getTime())
    ? reminder.triggerIso
    : triggerDate.toLocaleString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <View
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: confirmed ? "#16A34A55" : String(colors.primary) + "55",
        backgroundColor: confirmed ? "#16A34A14" : String(colors.primary) + "12",
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Papicons name="Clock" size={16} color={confirmed ? "#16A34A" : String(colors.primary)} />
        <Typography variant="title" style={{ flex: 1, fontSize: 14 }}>
          {reminder.title}
        </Typography>
      </View>
      <Typography variant="caption" color="textSecondary">
        {whenLabel} — {reminder.body}
      </Typography>
      <TouchableOpacity
        disabled={confirmed}
        onPress={onConfirm}
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: confirmed ? "#16A34A" : colors.primary,
          marginTop: 2,
        }}
      >
        <Typography variant="caption" style={{ color: "#FFFFFF", fontWeight: "700" }}>
          {confirmed ? "Rappel programmé" : "Confirmer le rappel"}
        </Typography>
      </TouchableOpacity>
    </View>
  );
}

function LatexSheetCard({ sheet }: { sheet: AiLatexSheet }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [busyMode, setBusyMode] = useState<"open" | "pdf" | "tex" | null>(null);
  const [showSource, setShowSource] = useState(false);
  const exportedRef = useRef<ExportedLatexFiles | null>(null);

  const ensureExported = async (): Promise<ExportedLatexFiles> => {
    if (exportedRef.current) return exportedRef.current;
    const files = await exportLatexSheetFiles(sheet);
    exportedRef.current = files;
    return files;
  };

  const handleOpenPdf = async () => {
    if (busyMode) return;
    setBusyMode("open");
    try {
      const files = await ensureExported();
      openAttachmentViewer(router, {
        name: files.fileNamePdf,
        url: files.pdfUri,
        type: 1,
      });
    } catch (err) {
      Alert.alert("Export PDF impossible", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMode(null);
    }
  };

  const handleShare = async (kind: "pdf" | "tex") => {
    if (busyMode) return;
    setBusyMode(kind);
    try {
      const files = await ensureExported();
      if (kind === "pdf") {
        await shareExportedFile(files.pdfUri, "application/pdf", sheet.title || "Fiche de révision PDF");
      } else {
        await shareExportedFile(files.texUri, "text/plain", sheet.title || "Source LaTeX (.tex)");
      }
    } catch (err) {
      Alert.alert("Partage impossible", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMode(null);
    }
  };

  return (
    <View
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: String(colors.primary) + "48",
        backgroundColor: String(colors.primary) + "10",
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Papicons name="File" size={16} color={String(colors.primary)} />
        <Typography variant="caption" style={{ color: String(colors.primary), fontWeight: "700", flex: 1 }}>
          FICHE LATEX • PDF PRÊT
        </Typography>
      </View>
      <Typography variant="title" style={{ fontSize: 15 }}>
        {sheet.title}
      </Typography>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <TouchableOpacity
          disabled={busyMode !== null}
          onPress={() => void handleOpenPdf()}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: colors.primary,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          {busyMode === "open" ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Typography variant="caption" style={{ color: "#FFFFFF", fontWeight: "700" }}>
              Ouvrir PDF
            </Typography>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busyMode !== null}
          onPress={() => void handleShare("pdf")}
          style={{
            paddingHorizontal: 11,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Typography variant="caption" style={{ fontWeight: "600" }}>
            {busyMode === "pdf" ? "Export..." : "Partager .pdf"}
          </Typography>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busyMode !== null}
          onPress={() => void handleShare("tex")}
          style={{
            paddingHorizontal: 11,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Typography variant="caption" style={{ fontWeight: "600" }}>
            {busyMode === "tex" ? "Export..." : "Partager .tex"}
          </Typography>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowSource(prev => !prev)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Typography variant="caption" color="textSecondary" style={{ fontWeight: "600" }}>
            {showSource ? "Masquer LaTeX" : "Voir LaTeX"}
          </Typography>
        </TouchableOpacity>
      </View>
      {showSource && (
        <View
          style={{
            backgroundColor: colors.background,
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            selectable
            style={{
              color: String(colors.text),
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 11.5,
              lineHeight: 16,
            }}
          >
            {sheet.latex}
          </Text>
        </View>
      )}
    </View>
  );
}

export interface AiAssistantScreenProps {
  isModal?: boolean;
  embedded?: boolean;
  topInset?: number;
  onDeclinedOrDisabled?: () => void;
}

export default function AiAssistantScreen({
  isModal = false,
  embedded = false,
  topInset = 0,
  onDeclinedOrDisabled,
}: AiAssistantScreenProps) {
  const { colors } = useTheme();
  const themeColors = colors as typeof colors & { item?: string };
  const pillSurfaceColor = String(themeColors.item ?? colors.card);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<AiChatMessage>>(null);
  const keyboardVisible = useKeyboardVisible();

  const personalization = useSettingsStore(s => s.personalization);
  const mutateProperty = useSettingsStore(s => s.mutateProperty);

  const provider: AiProviderId = personalization.aiProvider ?? "gemini";
  const preset = AI_PROVIDER_PRESETS[provider] ?? AI_PROVIDER_PRESETS.gemini;
  const cookiesAccepted = Boolean(personalization.aiCookiesAccepted);
  const firstOpenAsked = Boolean(personalization.aiFirstOpenAsked);
  const needsOnboardingGate = !firstOpenAsked || !cookiesAccepted;

  const [cookieSwitchChecked, setCookieSwitchChecked] = useState(cookiesAccepted);
  const [messages, setMessages] = useState<AiChatMessage[]>(() => getAiChatHistory());
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(110);
  const [scope, setScope] = useState<StudentContextScope>({
    includeTimetable: true,
    includeHomework: true,
    includeGrades: true,
    includeCommunications: false,
  });

  const refreshKeyStatus = useCallback(async () => {
    const key = await getStoredAiApiKey();
    setHasKey(provider === "custom" ? Boolean(personalization.aiCustomEndpoint?.trim()) : Boolean(key));
  }, [personalization.aiCustomEndpoint, provider]);

  useFocusEffect(
    useCallback(() => {
      void refreshKeyStatus();
    }, [refreshKeyStatus])
  );

  useEffect(() => {
    saveAiChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    if (keyboardVisible && messages.length > 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [keyboardVisible, messages.length]);

  const handleAcceptOnboarding = () => {
    if (!cookieSwitchChecked) {
      Alert.alert(
        "Cookies requis",
        "Active l'interrupteur des cookies fonctionnels IA pour utiliser l'assistant."
      );
      return;
    }
    mutateProperty("personalization", {
      aiCookiesAccepted: true,
      aiFirstOpenAsked: true,
      aiAssistantEnabled: true,
    });
  };

  const handleDeclineAndDisable = () => {
    clearAiChatHistory();
    setMessages([]);
    mutateProperty("personalization", {
      aiCookiesAccepted: false,
      aiFirstOpenAsked: true,
      aiAssistantEnabled: false,
    });
    if (onDeclinedOrDisabled) {
      onDeclinedOrDisabled();
    } else if (isModal) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || isSending) return;

    const apiKey = await getStoredAiApiKey();
    if (provider !== "custom" && !apiKey) {
      Alert.alert(
        "Clé API requise",
        `Configure ta clé gratuite (${preset.label}) dans Paramètres → Assistant IA.`,
        [
          { text: "Plus tard", style: "cancel" },
          { text: "Configurer", onPress: () => router.push("/(settings)/ai") },
        ]
      );
      return;
    }

    const userMsg: AiChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!overrideText) setInputText("");
    setIsSending(true);

    try {
      const snapshot = await buildStudentContextSnapshot(scope);
      const contextText = formatContextForPrompt(snapshot);
      const systemPrompt = buildSocraticSystemPrompt(contextText);

      const parsed = await sendAiChatCompletion({
        provider,
        model: personalization.aiModel || preset.defaultModel,
        apiKey,
        customEndpoint: personalization.aiCustomEndpoint,
        systemPrompt,
        messages: nextMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: AiChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: parsed.displayText,
        createdAt: Date.now(),
        reminders: parsed.reminders,
        flashcards: parsed.flashcards,
        latexSheets: parsed.latexSheets,
        confirmedReminderIds: [],
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg: AiChatMessage = {
        id: `e_${Date.now()}`,
        role: "assistant",
        content: `Impossible de contacter l'assistant : ${
          err instanceof Error ? err.message : String(err)
        }`,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const handleConfirmReminder = async (msgId: string, reminder: AiReminderAction) => {
    const triggerAt = new Date(reminder.triggerIso);
    if (Number.isNaN(triggerAt.getTime()) || triggerAt.getTime() <= Date.now()) {
      Alert.alert("Date passée", "Ce créneau est déjà passé. Demande un autre créneau à l'assistant.");
      return;
    }
    const notifId = await scheduleStudyReminder({
      title: reminder.title,
      body: reminder.body,
      triggerDate: triggerAt,
    });
    if (!notifId) {
      Alert.alert("Permission requise", "Autorise les notifications pour programmer ce rappel.");
      return;
    }
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? {
              ...m,
              confirmedReminderIds: [...(m.confirmedReminderIds ?? []), reminder.id],
            }
          : m
      )
    );
  };

  const handleClearChat = () => {
    Alert.alert("Effacer la conversation ?", "Tout l'historique local de l'assistant sera supprimé.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Effacer",
        style: "destructive",
        onPress: () => {
          clearAiChatHistory();
          setMessages([]);
        },
      },
    ]);
  };

  if (needsOnboardingGate) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {!embedded && (
          <TabHeader
            showAndroidBackButton={isModal}
            modal={isModal}
            title={
              <TabHeaderTitle
                color={String(colors.text)}
                leading="Assistant IA"
                subtitle="Configuration & Cookies"
              />
            }
          />
        )}
        <ScrollView
          contentContainerStyle={{
            paddingTop: embedded ? Math.max(topInset + 12, 24) : 120,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 40,
            gap: 16,
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 22,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Papicons name="Sparkles" size={26} color={String(colors.primary)} />
              <Typography variant="h4" style={{ flex: 1 }}>
                Assistant d'étude Papillon +
              </Typography>
            </View>

            <Typography variant="body1" color="textSecondary">
              Cet assistant t'aide à réviser, organiser tes créneaux libres et comprendre tes devoirs étape par étape — sans jamais faire ton travail à ta place.
            </Typography>

            <View
              style={{
                backgroundColor: colors.background,
                borderRadius: 14,
                padding: 12,
                gap: 6,
              }}
            >
              <Typography variant="title" style={{ fontSize: 14 }}>
                Cookies & confidentialité
              </Typography>
              <Typography variant="caption" color="textSecondary">
                • Tes identifiants Pronote ne quittent jamais ton téléphone.{"\n"}
                • Lorsque tu envoies un message, seules les données cochées (cours, devoirs, notes) sont résumées localement avec masquage des données sensibles.{"\n"}
                • L'utilisation de l'IA nécessite ton accord pour le stockage local de session et les cookies fonctionnels de traitement.
              </Typography>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
              }}
            >
              <Typography variant="title" style={{ flex: 1, fontSize: 15, paddingRight: 10 }}>
                Accepter les cookies fonctionnels IA
              </Typography>
              <Switch
                value={cookieSwitchChecked}
                onValueChange={setCookieSwitchChecked}
              />
            </View>

            <TouchableOpacity
              onPress={handleAcceptOnboarding}
              style={{
                backgroundColor: cookieSwitchChecked ? colors.primary : colors.border,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Typography variant="title" style={{ color: "#FFFFFF" }}>
                Accepter et garder l'onglet IA
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDeclineAndDisable}
              style={{
                borderRadius: 16,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Typography variant="body1" color="textSecondary">
                Refuser et désactiver l'onglet IA
              </Typography>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingContainer
      style={{ flex: 1, backgroundColor: colors.background }}
      iosKeyboardVerticalOffset={isModal ? 60 : 0}
    >
      {!embedded && (
        <TabHeader
          showAndroidBackButton={isModal}
          modal={isModal}
          onHeightChanged={setHeaderHeight}
          title={
            <TabHeaderTitle
              color={String(colors.text)}
              leading="Assistant IA"
              subtitle={preset.label}
            />
          }
          trailing={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {messages.length > 0 && (
                <ChipButton onPress={handleClearChat} icon="trash" />
              )}
              <ChipButton onPress={() => router.push("/(settings)/ai")} icon="gears" />
            </View>
          }
        />
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: (embedded ? topInset : headerHeight) + 8,
          paddingHorizontal: 14,
          paddingBottom: 18,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            {!hasKey && (
              <TouchableOpacity
                onPress={() => router.push("/(settings)/ai")}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: String(colors.primary) + "18",
                  borderWidth: 1,
                  borderColor: String(colors.primary) + "44",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Papicons name="Info" size={20} color={String(colors.primary)} />
                <View style={{ flex: 1 }}>
                  <Typography variant="title" style={{ fontSize: 14 }}>
                    Configurer une API gratuite ({preset.label})
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Appuie ici pour ajouter ta clé Gemini, Groq, Mistral ou Proxy.
                  </Typography>
                </View>
              </TouchableOpacity>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(
                [
                  { key: "includeTimetable", label: "Emploi du temps" },
                  { key: "includeHomework", label: "Devoirs" },
                  { key: "includeGrades", label: "Notes & moyennes" },
                  { key: "includeCommunications", label: "Messages" },
                ] as const
              ).map(chip => {
                const active = scope[chip.key];
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setScope(prev => ({ ...prev, [chip.key]: !prev[chip.key] }))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? String(colors.primary) + "20" : colors.card,
                    }}
                  >
                    <Typography
                      variant="caption"
                      style={{ color: active ? String(colors.primary) : String(colors.text), fontWeight: "600" }}
                    >
                      {active ? `✓ ${chip.label}` : chip.label}
                    </Typography>
                  </Pressable>
                );
              })}
              {embedded && messages.length > 0 && (
                <Pressable
                  onPress={handleClearChat}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <Typography variant="caption" color="textSecondary" style={{ fontWeight: "600" }}>
                    Effacer
                  </Typography>
                </Pressable>
              )}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <Stack padding={[16, 20]} gap={12}>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 6,
              }}
            >
              <Typography variant="title">Ton coach de révision</Typography>
              <Typography variant="body2" color="textSecondary">
                Je lis tes cours, créneaux libres, devoirs et notes (en lecture seule) pour t'aider à réviser et comprendre — sans jamais rédiger tes devoirs à ta place.
              </Typography>
            </View>
            {STARTER_PROMPTS.map(prompt => (
              <TouchableOpacity
                key={prompt}
                onPress={() => void handleSend(prompt)}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Papicons name="Sparkles" size={18} color={String(colors.primary)} />
                <Typography variant="body1" style={{ flex: 1 }}>
                  {prompt}
                </Typography>
              </TouchableOpacity>
            ))}
          </Stack>
        }
        renderItem={({ item }) => {
          const isUser = item.role === "user";
          return (
            <View
              style={{
                alignSelf: isUser ? "flex-end" : "flex-start",
                maxWidth: "88%",
                backgroundColor: isUser ? colors.primary : colors.card,
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: isUser ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              {isUser ? (
                <Typography
                  variant="body1"
                  style={{ color: "#FFFFFF" }}
                >
                  {item.content}
                </Typography>
              ) : (
                <AiMarkdownText text={item.content} />
              )}
              {!isUser &&
                item.flashcards?.map(card => <FlashcardCard key={card.id} card={card} />)}
              {!isUser &&
                item.latexSheets?.map(sheet => <LatexSheetCard key={sheet.id} sheet={sheet} />)}
              {!isUser &&
                item.reminders?.map(rem => (
                  <ReminderActionCard
                    key={rem.id}
                    reminder={rem}
                    confirmed={Boolean(item.confirmedReminderIds?.includes(rem.id))}
                    onConfirm={() => void handleConfirmReminder(item.id, rem)}
                  />
                ))}
            </View>
          );
        }}
      />

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: keyboardVisible
            ? 8
            : embedded && !isModal && Platform.OS === "android"
              ? 12
              : Math.max(insets.bottom + (isModal ? 8 : 74), 14),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 46,
            paddingLeft: 16,
            paddingRight: 5,
            paddingVertical: 5,
            borderRadius: 26,
            backgroundColor: pillSurfaceColor,
          }}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            onFocus={() => {
              setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 160);
            }}
            placeholder="Pose une question sur un devoir ou un cours..."
            placeholderTextColor={String(colors.text) + "66"}
            multiline
            style={{
              flex: 1,
              minHeight: 34,
              maxHeight: 110,
              paddingVertical: 6,
              color: colors.text,
              fontSize: 15,
            }}
          />
          <TouchableOpacity
            disabled={isSending || !inputText.trim()}
            onPress={() => void handleSend()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: inputText.trim() ? colors.primary : String(colors.text) + "1F",
            }}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Papicons name="ArrowUp" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingContainer>
  );
}
