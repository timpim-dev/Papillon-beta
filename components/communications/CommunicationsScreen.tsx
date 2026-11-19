import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AiAssistantScreen from "@/components/ai/AiAssistantScreen";
import { dedupeChats, getChatsFromCache } from "@/database/useChat";
import { allowAllAuthRetries } from "@/services/auth/coordinator";
import { getManager, initializeAccountManager, subscribeManagerUpdate } from "@/services/shared";
import { Chat } from "@/services/shared/chat";
import { Capabilities } from "@/services/shared/types";
import { useAccountStore } from "@/stores/account";
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
  isChatUnread,
  markAllChatsAsRead,
  markChatAsRead,
} from "@/utils/notifications/communicationsNotifications";

import { cacheLiveChats } from "./liveChatsCache";

type MessagesSubTab = "discussions" | "ai";

const SUB_TABS: Array<{ key: MessagesSubTab; label: string }> = [
  { key: "discussions", label: "Discussions" },
  { key: "ai", label: "Assistant IA" },
];

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
  const theme = useTheme();
  const colors = theme.colors as typeof theme.colors & { item?: string };
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const aiAssistantEnabled = useSettingsStore(
    state => state.personalization.aiAssistantEnabled !== false
  );
  const notificationsEnabled = useSettingsStore(
    state => state.personalization.communicationNotificationsEnabled ?? true
  );

  const visibleSubTabs = useMemo(
    () => (aiAssistantEnabled ? SUB_TABS : SUB_TABS.filter(item => item.key !== "ai")),
    [aiAssistantEnabled]
  );

  const initialTab: MessagesSubTab =
    tab === "discussions" || (tab === "ai" && aiAssistantEnabled)
      ? tab
      : "discussions";
  const [subTab, setSubTab] = useState<MessagesSubTab>(initialTab);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [readSet, setReadSet] = useState<Set<string>>(() => getReadChatSignatures());
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);

  useEffect(() => {
    setChats([]);
  }, [lastUsedAccount]);

  useEffect(() => {
    if (tab === "discussions" || (tab === "ai" && aiAssistantEnabled)) {
      setSubTab(tab);
    }
  }, [aiAssistantEnabled, tab]);

  useEffect(() => {
    if (!aiAssistantEnabled && subTab === "ai") {
      setSubTab("discussions");
    }
  }, [aiAssistantEnabled, subTab]);

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

  const fetchChats = useCallback(async (forceReconnect = false) => {
    setIsLoading(true);
    try {
      let manager = getManager(true);
      if (forceReconnect || !manager?.hasReadyClients(Capabilities.CHAT_READ)) {
        if (forceReconnect) {
          allowAllAuthRetries();
        }
        try {
          manager = await initializeAccountManager(undefined, { force: forceReconnect });
        } catch {
          manager = getManager(true);
        }
      }
      if (!manager) {
        await loadCached();
        return;
      }
      const list = await manager.getChats();
      cacheLiveChats(list);
      setChats(list);
      await detectAndNotifyNewChats(list, notificationsEnabled);
      setReadSet(getReadChatSignatures());
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
    return dedupeChats(chats).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
    return sortedChats.filter(c => isChatUnread(c, readSet)).length;
  }, [readSet, sortedChats]);

  const handleOpenChat = (chat: Chat) => {
    markChatAsRead(chat);
    setReadSet(getReadChatSignatures());
    const sig = buildChatSignature(chat);
    router.push({
      pathname: "/(features)/(communications)/thread",
      params: { sig },
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
          ) : (
            <ChipButton
              onPress={() => router.push("/(settings)/ai")}
              icon="gears"
            />
          )
        }
        bottom={
          <View style={{ gap: 8 }}>
            {visibleSubTabs.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              >
                {visibleSubTabs.map(tab => {
                  const active = subTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => setSubTab(tab.key)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: active
                          ? colors.primary
                          : colors.item ?? colors.card,
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
            )}
            {subTab !== "ai" && (
              <Search
                placeholder="Rechercher une discussion..."
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
                void fetchChats(true);
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
                const isUnread = isChatUnread(chat, readSet);
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
