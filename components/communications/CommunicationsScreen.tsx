import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AiAssistantScreen from "@/components/ai/AiAssistantScreen";
import { getChatsFromCache } from "@/database/useChat";
import { useNews } from "@/database/useNews";
import { getManager, subscribeManagerUpdate } from "@/services/shared";
import { Chat } from "@/services/shared/chat";
import { News } from "@/services/shared/news";
import { useSettingsStore } from "@/stores/settings";
import Avatar from "@/ui/components/Avatar";
import ChipButton from "@/ui/components/ChipButton";
import Search from "@/ui/components/Search";
import Stack from "@/ui/components/Stack";
import TabHeader from "@/ui/components/TabHeader";
import TabHeaderTitle from "@/ui/components/TabHeaderTitle";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import { getProfileColorByName } from "@/utils/chats/colors";
import { getInitials } from "@/utils/chats/initials";
import { warn } from "@/utils/logger/logger";
import {
  buildChatSignature,
  detectAndNotifyNewChats,
  getReadChatSignatures,
  markAllChatsAsRead,
  markChatAsRead,
} from "@/utils/notifications/communicationsNotifications";

import { cacheLiveChats } from "./liveChatsCache";

type MessagesSubTab = "discussions" | "infos" | "ai";

const SUB_TABS: Array<{ key: MessagesSubTab; label: string }> = [
  { key: "discussions", label: "Discussions" },
  { key: "infos", label: "Infos & Sondages" },
  { key: "ai", label: "Assistant IA" },
];

function stripHtmlPreview(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRelativeChatDate(date: Date): string {
  const ts = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(ts)) {
    return "";
  }
  const diffDays = Math.floor((Date.now() - ts) / 86_400_000);
  if (diffDays <= 0) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Hier";
  }
  if (diffDays < 7) {
    return `Il y a ${diffDays}j`;
  }
  return new Date(ts).toLocaleDateString([], { day: "2-digit", month: "short" });
}

export interface CommunicationsScreenProps {
  isModal?: boolean;
}

export default function CommunicationsScreen({ isModal = false }: CommunicationsScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const notificationsEnabled = useSettingsStore(
    state => state.personalization.communicationNotificationsEnabled ?? true
  );

  const [subTab, setSubTab] = useState<MessagesSubTab>("discussions");
  const [headerHeight, setHeaderHeight] = useState(0);
  const [chats, setChats] = useState<Chat[]>([]);
  const [newsRefreshTick, setNewsRefreshTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [readSet, setReadSet] = useState<Set<string>>(() => getReadChatSignatures());
  const allNews = useNews(newsRefreshTick);

  const fetchNewsItems = useCallback(async () => {
    setIsRefreshingNews(true);
    try {
      const manager = getManager();
      if (manager) {
        await manager.getNews();
        setNewsRefreshTick(n => n + 1);
      }
    } catch (err) {
      warn(`Failed fetching news: ${String(err)}`, "CommunicationsScreen");
    } finally {
      setIsRefreshingNews(false);
    }
  }, []);

  const loadCached = useCallback(async () => {
    try {
      const cached = await getChatsFromCache();
      if (cached && cached.length > 0) {
        cacheLiveChats(cached);
        setChats(cached);
      }
    } catch {
      // Cache empty
    }
  }, []);

  const fetchChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const manager = getManager();
      if (!manager) {
        await loadCached();
        return;
      }
      const list = await manager.getChats();
      cacheLiveChats(list);
      setChats(list);
      await detectAndNotifyNewChats(list, notificationsEnabled);
    } catch (err) {
      warn(`Failed fetching chats: ${String(err)}`, "CommunicationsScreen");
      await loadCached();
    } finally {
      setIsLoading(false);
    }
  }, [loadCached, notificationsEnabled]);

  useEffect(() => {
    void loadCached();
    void fetchChats();
    const unsub = subscribeManagerUpdate(() => {
      void fetchChats();
    });
    return () => unsub();
  }, [fetchChats, loadCached]);

  useFocusEffect(
    useCallback(() => {
      setReadSet(getReadChatSignatures());
    }, [])
  );

  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [chats]);

  const filteredChats = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) {
      return sortedChats;
    }
    return sortedChats.filter(item => {
      const hay = `${item.subject} ${item.creator ?? ""} ${item.recipient ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [searchText, sortedChats]);

  const unreadCount = useMemo(() => {
    return sortedChats.filter(c => !readSet.has(buildChatSignature(c))).length;
  }, [readSet, sortedChats]);

  const sortedNews = useMemo(() => {
    return [...allNews].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allNews]);

  const filteredNews = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return sortedNews;
    return sortedNews.filter((item: News) => {
      const hay = `${item.title ?? ""} ${item.author ?? ""} ${item.category ?? ""} ${stripHtmlPreview(item.content)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [searchText, sortedNews]);

  const unreadNewsCount = useMemo(() => {
    return sortedNews.filter(item => !item.acknowledged).length;
  }, [sortedNews]);

  const handleOpenChat = (chat: Chat) => {
    markChatAsRead(chat);
    setReadSet(getReadChatSignatures());
    const sig = buildChatSignature(chat);
    router.push({
      pathname: "/(features)/(communications)/thread",
      params: { sig },
    });
  };

  const handleOpenNews = (item: News) => {
    router.push({
      pathname: "/(features)/(news)/specific",
      params: { id: item.id },
    });
  };

  const handleMarkAllRead = () => {
    markAllChatsAsRead(sortedChats);
    setReadSet(getReadChatSignatures());
  };

  const headerSubtitle =
    subTab === "discussions"
      ? unreadCount > 0
        ? `${unreadCount} non lue(s)`
        : undefined
      : subTab === "infos"
        ? unreadNewsCount > 0
          ? `${unreadNewsCount} à lire`
          : `${sortedNews.length} publication(s)`
        : "Coach de révision";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabHeader
        showAndroidBackButton={isModal}
        modal={isModal}
        onHeightChanged={setHeaderHeight}
        title={
          <TabHeaderTitle
            color={String(colors.text)}
            leading="Messages"
            subtitle={headerSubtitle}
          />
        }
        trailing={
          subTab === "discussions" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {unreadCount > 0 && (
                <ChipButton
                  onPress={handleMarkAllRead}
                  icon="check"
                />
              )}
              <ChipButton
                onPress={() => router.push("/(features)/(communications)/new")}
                icon="plus"
              />
            </View>
          ) : subTab === "ai" ? (
            <ChipButton
              onPress={() => router.push("/(settings)/ai")}
              icon="gears"
            />
          ) : (
            <ChipButton
              onPress={() => {
                void fetchNewsItems();
              }}
              icon="refresh"
            />
          )
        }
        bottom={
          <View style={{ gap: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            >
              {SUB_TABS.map(tab => {
                const active = subTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setSubTab(tab.key)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    }}
                  >
                    <Typography
                      variant="caption"
                      style={{
                        color: active ? "#FFFFFF" : String(colors.text),
                        fontWeight: "700",
                      }}
                    >
                      {tab.label}
                    </Typography>
                  </Pressable>
                );
              })}
            </ScrollView>
            {subTab !== "ai" && (
              <Search
                placeholder={
                  subTab === "discussions"
                    ? "Rechercher une discussion..."
                    : "Rechercher une info ou un sondage..."
                }
                value={searchText}
                setValue={setSearchText}
              />
            )}
          </View>
        }
      />

      {subTab === "ai" ? (
        <AiAssistantScreen
          embedded
          isModal={isModal}
          topInset={headerHeight}
          onDeclinedOrDisabled={() => setSubTab("discussions")}
        />
      ) : subTab === "infos" ? (
        <List
          safeHorizontalPadding={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 8,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 96,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingNews}
              onRefresh={() => {
                void fetchNewsItems();
              }}
              progressViewOffset={headerHeight}
            />
          }
        >
          {filteredNews.length === 0 ? (
            <Stack
              vAlign="center"
              hAlign="center"
              padding={[24, 48]}
              gap={10}
            >
              <Papicons name="Newspaper" size={44} color={String(colors.text)} opacity={0.45} />
              <Typography variant="title" align="center">
                {searchText.trim() ? "Aucun résultat" : "Aucune info ni sondage"}
              </Typography>
              <Typography variant="caption" color="textSecondary" align="center">
                Les actualités et sondages de ton établissement apparaîtront ici.
              </Typography>
            </Stack>
          ) : (
            <List.Section>
              {filteredNews.map(item => {
                const isSurvey = Boolean(item.question);
                const isUnread = !item.acknowledged;
                const authorName = item.author || item.category || "Établissement";
                const preview = stripHtmlPreview(item.content);
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.75}
                    onPress={() => handleOpenNews(item)}
                  >
                    <List.Item>
                      <List.Leading>
                        <Avatar
                          size={42}
                          initials={getInitials(authorName)}
                          color={getProfileColorByName(authorName)}
                        />
                      </List.Leading>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: isSurvey ? "#F59E0B22" : String(colors.primary) + "1E",
                            }}
                          >
                            <Typography
                              variant="caption"
                              style={{
                                color: isSurvey ? "#D97706" : String(colors.primary),
                                fontWeight: "700",
                                fontSize: 11,
                              }}
                            >
                              {isSurvey ? "Sondage" : "Info"}
                            </Typography>
                          </View>
                          <Typography variant="caption" color="textSecondary">
                            {formatRelativeChatDate(item.createdAt)}
                          </Typography>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {isUnread && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.primary,
                              }}
                            />
                          )}
                          <Typography
                            variant="title"
                            numberOfLines={1}
                            style={{ flex: 1, fontWeight: isUnread ? "700" : "500" }}
                          >
                            {item.title || "Information"}
                          </Typography>
                        </View>
                        <Typography variant="caption" color="textSecondary" numberOfLines={2}>
                          {preview || authorName}
                        </Typography>
                      </View>
                    </List.Item>
                  </TouchableOpacity>
                );
              })}
            </List.Section>
          )}
        </List>
      ) : (
        <List
          safeHorizontalPadding={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 8,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 96,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => {
                void fetchChats();
              }}
              progressViewOffset={headerHeight}
            />
          }
        >
          {filteredChats.length === 0 ? (
            <Stack
              vAlign="center"
              hAlign="center"
              padding={[24, 48]}
              gap={10}
            >
              <Papicons name="Mail" size={44} color={String(colors.text)} opacity={0.45} />
              <Typography variant="title" align="center">
                {searchText.trim() ? "Aucun résultat" : "Aucune communication"}
              </Typography>
              <Typography variant="caption" color="textSecondary" align="center">
                Tes discussions Pronote / établissement apparaîtront ici automatiquement.
              </Typography>
            </Stack>
          ) : (
            <List.Section>
              {filteredChats.map(chat => {
                const sig = buildChatSignature(chat);
                const isUnread = !readSet.has(sig);
                const authorName = chat.creator || chat.recipient || "Discussion";
                return (
                  <TouchableOpacity
                    key={sig}
                    activeOpacity={0.75}
                    onPress={() => handleOpenChat(chat)}
                  >
                    <List.Item>
                      <List.Leading>
                        <Avatar
                          size={42}
                          initials={getInitials(authorName)}
                          color={getProfileColorByName(authorName)}
                        />
                      </List.Leading>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <Typography
                            variant="title"
                            numberOfLines={1}
                            style={{ flex: 1, fontWeight: isUnread ? "700" : "500" }}
                          >
                            {chat.subject || "Sans objet"}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {formatRelativeChatDate(chat.date)}
                          </Typography>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {isUnread && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.primary,
                              }}
                            />
                          )}
                          <Typography variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                            {authorName}
                            {chat.recipient && chat.creator && chat.recipient !== chat.creator
                              ? ` → ${chat.recipient}`
                              : ""}
                          </Typography>
                        </View>
                      </View>
                    </List.Item>
                  </TouchableOpacity>
                );
              })}
            </List.Section>
          )}
        </List>
      )}
    </View>
  );
}
