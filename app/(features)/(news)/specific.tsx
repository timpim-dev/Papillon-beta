import {
  NewsQuestion,
  NewsQuestionKind,
  newsQuestionLocalMutate,
  NewsSurvey,
} from "@blockshub/pawnote-lts";
import { HeaderBackButton, useTheme } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Attachment, News as SkolengoNews } from "skolengojs";
import { Papicons } from "@getpapillon/papicons";

import RichNewsContent from "@/components/news/RichNewsContent";
import { getNewsById } from "@/database/useNews";
import { allowAllAuthRetries } from "@/services/auth/coordinator";
import { getManager, initializeAccountManager, subscribeManagerUpdate } from "@/services/shared";
import { News } from "@/services/shared/news";
import { Capabilities } from "@/services/shared/types";
import { useAccountStore } from "@/stores/account";
import { Services } from "@/stores/account/types";
import ActivityIndicator from "@/ui/components/ActivityIndicator";
import Avatar from "@/ui/components/Avatar";
import Icon from "@/ui/components/Icon";
import Item, { Leading } from "@/ui/components/Item";
import KeyboardAvoidingContainer from "@/ui/components/KeyboardAvoidingContainer";
import ListLegacy from "@/ui/components/List";
import { NativeHeaderSide } from "@/ui/components/NativeHeader";
import SafeHorizontalView from "@/ui/components/SafeHorizontalView";
import Stack from "@/ui/components/Stack";
import TypographyLegacy from "@/ui/components/Typography";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import { runsIOS26 } from "@/ui/utils/IsLiquidGlass";
import { openAttachmentViewer } from "@/utils/attachments/attachmentViewer";
import { getInitials } from "@/utils/chats/initials";
import { formatHTML } from "@/utils/format/html";
import { cleanHtmlForArticle } from "@/utils/news/cleanUpHTMLNews";
import { getAttachmentIcon } from "@/utils/news/getAttachmentIcon";

const NewsPage = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [news, setNews] = useState<News>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [surveyVersion, setSurveyVersion] = useState(0);
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const [HTMLCleanupEnabled, setHTMLCleanupEnabled] = useState(true);

  const loadNews = useCallback(
    async (options: { forceReconnect?: boolean; silent?: boolean } = {}) => {
      if (!id) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!options.silent && !options.forceReconnect) {
        setLoading(true);
      }
      try {
        const manager = getManager(true);
        if (options.forceReconnect || !manager?.hasReadyClients(Capabilities.NEWS)) {
          if (options.forceReconnect) {
            allowAllAuthRetries();
          }
          await initializeAccountManager(undefined, { force: options.forceReconnect }).catch(
            () => undefined
          );
        }
        const result = await getNewsById(id);
        setNews(result);
        setSurveyVersion(v => v + 1);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void loadNews();
    const unsub = subscribeManagerUpdate(() => {
      void loadNews({ silent: true });
    });
    return () => unsub();
  }, [loadNews]);

  useEffect(() => {
    if (!news || news.acknowledged || !news.ref) return;
    const acknowledgeNews = async () => {
      try {
        const manager = getManager(true);
        if (!manager?.hasReadyClients(Capabilities.NEWS)) return;

        const store = useAccountStore.getState();
        const account = store.accounts.find(account => account.id === store.lastUsedAccount);
        const service = account?.services.find(service => service.id === news.createdByAccount);

        if (service?.serviceId === Services.SKOLENGO) {
          const attachment = new Attachment("", "", "");
          news.ref = new SkolengoNews(
            news.id,
            news.createdAt,
            news.title ?? "",
            news.content,
            news.content,
            { id: "", name: "" },
            "",
            attachment
          );
        }

        await manager.setNewsAsDone(news);
      } catch {
        // Non-blocking acknowledgement
      }
    };

    void acknowledgeNews();
  }, [news]);

  const surveyRef = useMemo(() => {
    const candidate = news?.ref as NewsSurvey | undefined;
    return candidate && candidate.is === "survey" && Array.isArray(candidate.questions)
      ? candidate
      : undefined;
  }, [news]);

  const handleToggleChoice = (question: NewsQuestion, choicePosition: number) => {
    if (question.kind === NewsQuestionKind.UniqueChoice) {
      newsQuestionLocalMutate(question, [choicePosition], question.textInputAnswer);
      setSurveyVersion(v => v + 1);
      return;
    }

    const current = new Set(question.selectedAnswers ?? []);
    if (current.has(choicePosition)) {
      current.delete(choicePosition);
    } else {
      if (
        question.shouldRespectMaximumChoices &&
        question.maximumChoices > 0 &&
        current.size >= question.maximumChoices
      ) {
        return;
      }
      current.add(choicePosition);
    }
    const next = Array.from(current).sort((a, b) => a - b);
    newsQuestionLocalMutate(
      question,
      next.length > 0 ? next : undefined,
      question.textInputAnswer
    );
    setSurveyVersion(v => v + 1);
  };

  const handleSurveyTextChange = (question: NewsQuestion, text: string) => {
    if (question.kind === NewsQuestionKind.TextInput) {
      newsQuestionLocalMutate(question, text || undefined);
    } else {
      newsQuestionLocalMutate(question, question.selectedAnswers, text);
    }
    setSurveyVersion(v => v + 1);
  };

  const handleSubmitSurvey = async () => {
    if (!news || !surveyRef || submittingSurvey) return;
    const manager = getManager(true);
    if (!manager?.hasReadyClients(Capabilities.NEWS)) {
      Alert.alert("Hors ligne", "Impossible d'envoyer tes réponses pour le moment.");
      return;
    }
    setSubmittingSurvey(true);
    try {
      const updated = await manager.submitNewsSurvey(news);
      setNews(updated);
      setSurveyVersion(v => v + 1);
      Alert.alert("Sondage envoyé", "Ta réponse a bien été enregistrée.");
    } catch (err) {
      Alert.alert("Erreur", `L'envoi du sondage a échoué : ${String(err)}`);
    } finally {
      setSubmittingSurvey(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!news) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Typography variant="title">{t("News_Empty_Title")}</Typography>
      </View>
    );
  }

  const cleanedContent = HTMLCleanupEnabled ? cleanHtmlForArticle(news.content ?? "") : (news.content ?? "");
  const plainFallback = formatHTML(news.content ?? "").trim();
  const hasVisualHtml = Boolean(cleanedContent.trim()) && (Boolean(formatHTML(cleanedContent).trim()) || /<img\s/i.test(cleanedContent));
  const categoryLabel = news.category?.trim() || (news.question ? "Sondage" : "Information");

  return (
    <KeyboardAvoidingContainer iosKeyboardVerticalOffset={90} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadNews({ forceReconnect: true });
            }}
          />
        }
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 20 + insets.bottom,
        }}
      >
        <NativeHeaderSide side="Left">
          <HeaderBackButton
            tintColor={runsIOS26 ? colors.text : colors.primary}
            onPress={() => router.back()}
            style={{
              marginLeft: Platform.OS === "ios" ? (runsIOS26 ? 3 : -32) : 0,
            }}
          />
        </NativeHeaderSide>

        <SafeHorizontalView base={20} style={{ gap: 24 }}>
          <Stack gap={10}>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 200,
                backgroundColor: String(colors.text) + "16",
              }}
            >
              <TypographyLegacy variant="body2">
                {categoryLabel}
              </TypographyLegacy>
            </View>

          <TypographyLegacy variant="h3">
            {news.title}
          </TypographyLegacy>

          <Stack direction="horizontal" hAlign="center">
            <Stack direction="horizontal" gap={8} inline flex hAlign="center">
              <Avatar initials={getInitials(news.author)} size={28} />
              <TypographyLegacy nowrap variant="body2">
                {news.author}
              </TypographyLegacy>
            </Stack>

            <TypographyLegacy nowrap variant="body2" color="secondary">
              {new Date(news.createdAt).toLocaleDateString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </TypographyLegacy>
          </Stack>
        </Stack>

        {surveyRef && surveyRef.questions.length > 0 ? (
          <View key={`survey-${surveyVersion}`} style={{ gap: 14 }}>
            {surveyRef.questions.map((question, qIndex) => {
              const selectedSet = new Set(question.selectedAnswers ?? []);
              const qTitle = (question.title || question.fullTitle || `Question ${qIndex + 1}`).trim();
              const qBody = formatHTML(question.content ?? "").trim();
              const hasFreeTextChoice = question.choices.some(
                c => c.isTextInput && selectedSet.has(c.position)
              );

              return (
                <View
                  key={question.id || qIndex}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    padding: 14,
                    gap: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Typography variant="title">{qTitle}</Typography>
                  {qBody.length > 0 && (
                    <RichNewsContent html={question.content ?? qBody} compact />
                  )}

                  {question.choices.length > 0 && (
                    <View style={{ gap: 8 }}>
                      {question.choices.map(choice => {
                        const checked = selectedSet.has(choice.position);
                        return (
                          <Pressable
                            key={choice.position}
                            onPress={() => handleToggleChoice(question, choice.position)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: checked ? colors.primary : colors.border,
                              backgroundColor: checked ? String(colors.primary) + "18" : "transparent",
                            }}
                          >
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius:
                                  question.kind === NewsQuestionKind.UniqueChoice ? 9 : 5,
                                borderWidth: 2,
                                borderColor: checked ? colors.primary : colors.border,
                                backgroundColor: checked ? colors.primary : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {checked && <Papicons name="Check" size={12} color="#FFFFFF" />}
                            </View>
                            <Typography variant="body1" style={{ flex: 1 }}>
                              {choice.value}
                            </Typography>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {(question.kind === NewsQuestionKind.TextInput || hasFreeTextChoice) && (
                    <TextInput
                      value={question.textInputAnswer ?? ""}
                      onChangeText={text => handleSurveyTextChange(question, text)}
                      placeholder="Ta réponse..."
                      placeholderTextColor={String(colors.text) + "66"}
                      multiline
                      maxLength={question.maximumLength > 0 ? question.maximumLength : undefined}
                      style={{
                        minHeight: 44,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        color: colors.text,
                        fontSize: 15,
                      }}
                    />
                  )}
                </View>
              );
            })}

            <Pressable
              onPress={() => void handleSubmitSurvey()}
              disabled={submittingSurvey}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                justifyContent: "center",
                opacity: submittingSurvey ? 0.6 : 1,
              }}
            >
              {submittingSurvey ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Typography variant="title" style={{ color: "#FFFFFF" }}>
                  {surveyRef.questions.some(q => q.answered)
                    ? "Mettre à jour ma réponse"
                    : "Envoyer mes réponses"}
                </Typography>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            {news.question && (
              <List scrollEnabled={false} safeHorizontalPadding={false}>
                <List.Item
                  onPress={() => {
                    setRefreshing(true);
                    void loadNews({ forceReconnect: true });
                  }}
                >
                  <List.Leading>
                    <Icon>
                      <Papicons name="pie" />
                    </Icon>
                  </List.Leading>
                  <Typography variant="title">Sondage</Typography>
                  <Typography variant="body1" color="textSecondary">
                    Mode hors ligne : touche pour recharger et voter directement.
                  </Typography>
                </List.Item>
              </List>
            )}

            {hasVisualHtml || plainFallback || Boolean(news.content?.trim()) ? (
              <RichNewsContent
                html={cleanedContent || news.content || plainFallback}
                rawHtml={news.content}
              />
            ) : news.attachments.length === 0 ? (
              <TypographyLegacy variant="body2" color="secondary">
                {news.ref
                  ? "Aucun contenu texte dans cette publication."
                  : "Contenu non encore synchronisé (session en attente ou hors ligne). Tire vers le bas pour actualiser."}
              </TypographyLegacy>
            ) : null}
          </>
        )}

        {news.attachments.length > 0 && (
          <ListLegacy>
            {news.attachments.map((attachment, index) => (
              <Item key={index} onPress={() => openAttachmentViewer(router, attachment)}>
                <Leading>
                  <Icon size={28}>
                    <Papicons name={getAttachmentIcon(attachment)} />
                  </Icon>
                </Leading>
                <TypographyLegacy variant="title">
                  {attachment.name || "Pièce jointe"}
                </TypographyLegacy>
                <TypographyLegacy variant="body1" nowrap color="secondary">
                  {attachment.url}
                </TypographyLegacy>
              </Item>
            ))}
          </ListLegacy>
        )}

        {!surveyRef && (hasVisualHtml || Boolean(news.content?.trim())) && (
          <Stack gap={0} style={{ opacity: 0.4 }}>
            <TypographyLegacy variant="caption">
              Si cette actualité ne s'affiche pas correctement,
            </TypographyLegacy>
            <TypographyLegacy
              variant="caption"
              style={{
                textDecorationLine: "underline",
              }}
              onPress={() => setHTMLCleanupEnabled(!HTMLCleanupEnabled)}
            >
              {HTMLCleanupEnabled ? "désactiver" : "activer"} le formattage automatique
            </TypographyLegacy>
          </Stack>
        )}
      </SafeHorizontalView>
    </ScrollView>
  </KeyboardAvoidingContainer>
  );
};

export default NewsPage;
