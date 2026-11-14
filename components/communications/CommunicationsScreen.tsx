import { Papicons } from "@getpapillon/papicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getChatsFromCache } from "@/database/useChat";
import { getManager, subscribeManagerUpdate } from "@/services/shared";
import { Chat } from "@/services/shared/chat";
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

  const [headerHeight, setHeaderHeight] = useState(0);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [readSet, setReadSet] = useState<Set<string>>(() => getReadChatSignatures());

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabHeader
        showAndroidBackButton={isModal}
        modal={isModal}
        onHeightChanged={setHeaderHeight}
        title={
          <TabHeaderTitle
            color={String(colors.text)}
            leading="Communications"
            subtitle={unreadCount > 0 ? `${unreadCount} non lue(s)` : undefined}
          />
        }
        trailing={
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
        }
        bottom={<Search placeholder="Rechercher une discussion..." value={searchText} setValue={setSearchText} />}
      />

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
    </View>
  );
}
