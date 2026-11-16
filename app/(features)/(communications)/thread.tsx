import { Papicons } from "@getpapillon/papicons";
import { Stack as ExpoStack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cacheLiveChats, getCachedLiveChat } from "@/components/communications/liveChatsCache";
import { dedupeMessages, getChatDbId, getChatsFromCache, getMessagesFromCache } from "@/database/useChat";
import { allowAllAuthRetries } from "@/services/auth/coordinator";
import { getManager, initializeAccountManager, subscribeManagerUpdate } from "@/services/shared";
import { Chat, Message } from "@/services/shared/chat";
import { Capabilities } from "@/services/shared/types";
import Avatar from "@/ui/components/Avatar";
import Stack from "@/ui/components/Stack";
import Typography from "@/ui/new/Typography";
import { getProfileColorByName } from "@/utils/chats/colors";
import { getInitials } from "@/utils/chats/initials";
import { openAttachmentViewer } from "@/utils/attachments/attachmentViewer";
import { formatHTML } from "@/utils/format/html";
import { getAttachmentIcon } from "@/utils/news/getAttachmentIcon";
import { buildChatSignature, markChatAsRead } from "@/utils/notifications/communicationsNotifications";

export default function CommunicationThreadScreen() {
  const { sig } = useLocalSearchParams<{ sig: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const initialChat = sig ? getCachedLiveChat(sig) : undefined;
  const [liveChat, setLiveChat] = useState<Chat | undefined>(initialChat);
  const liveChatRef = React.useRef<Chat | undefined>(initialChat);
  const chat = liveChat ?? initialChat;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionUnavailable, setConnectionUnavailable] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async (options: { forceReconnect?: boolean; silent?: boolean } = {}) => {
    let activeChat = liveChatRef.current ?? (sig ? getCachedLiveChat(sig) : undefined);
    if (!activeChat && sig) {
      try {
        const cachedChats = await getChatsFromCache();
        activeChat = cachedChats.find(c => buildChatSignature(c) === sig);
        if (activeChat) {
          liveChatRef.current = activeChat;
          setLiveChat(activeChat);
        }
      } catch {
        // Ignore cache lookup failure
      }
    }
    if (!activeChat) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const chatDbId = getChatDbId(activeChat);
    if (!options.silent && !options.forceReconnect) {
      setLoading(true);
    }

    try {
      const cached = await getMessagesFromCache(activeChat);
      if (cached && cached.length > 0) {
        setMessages(
          dedupeMessages(cached, chatDbId).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          )
        );
      }

      let manager = getManager(true);
      if (options.forceReconnect || !manager?.hasReadyClients(Capabilities.CHAT_READ)) {
        if (options.forceReconnect) {
          allowAllAuthRetries();
        }
        try {
          manager = await initializeAccountManager(undefined, { force: options.forceReconnect });
        } catch {
          manager = getManager(true);
        }
      }

      if (manager && manager.hasReadyClients(Capabilities.CHAT_READ)) {
        let targetChat = activeChat;
        if (!targetChat.ref) {
          const allChats = await manager.getChats();
          cacheLiveChats(allChats);
          const matched =
            (sig ? allChats.find(c => buildChatSignature(c) === sig) : undefined) ??
            allChats.find(
              c =>
                c.subject === activeChat!.subject &&
                c.creator === activeChat!.creator
            );
          if (matched) {
            targetChat = matched;
            liveChatRef.current = matched;
            setLiveChat(matched);
          }
        }

        if (targetChat.ref) {
          setConnectionUnavailable(false);
          const fetched = await manager.getChatMessages(targetChat);
          setMessages(
            dedupeMessages(fetched, getChatDbId(targetChat)).sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            )
          );
          markChatAsRead(targetChat);
          if (targetChat !== activeChat) {
            markChatAsRead(activeChat);
          }
        } else {
          setConnectionUnavailable(true);
        }
      } else {
        setConnectionUnavailable(true);
      }
    } catch {
      setConnectionUnavailable(true);
      try {
        const cached = await getMessagesFromCache(activeChat);
        setMessages(dedupeMessages(cached ?? [], chatDbId));
      } catch {
        setMessages([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sig]);

  useEffect(() => {
    void loadMessages();
    const unsub = subscribeManagerUpdate(() => {
      void loadMessages({ silent: true });
    });
    return () => unsub();
  }, [loadMessages]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadMessages({ forceReconnect: true });
  }, [loadMessages]);

  const handleSendReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed || !chat || sending) {
      return;
    }
    const manager = getManager();
    if (!manager) {
      Alert.alert("Hors ligne", "Impossible d'envoyer le message pour le moment.");
      return;
    }
    setSending(true);
    try {
      await manager.sendMessageInChat(chat, trimmed);
      setReplyText("");
      await loadMessages();
    } catch (err) {
      Alert.alert("Erreur", `L'envoi a échoué : ${String(err)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ExpoStack.Screen
        options={{
          headerShown: true,
          headerTitle: chat?.subject || "Discussion",
        }}
      />

      {loading ? (
        <Stack vAlign="center" hAlign="center" flex>
          <ActivityIndicator size="large" color={colors.primary} />
        </Stack>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 16,
            gap: 12,
          }}
          ListEmptyComponent={
            <Stack vAlign="center" hAlign="center" padding={[24, 48]} gap={12}>
              <Typography variant="caption" color="textSecondary" align="center">
                {connectionUnavailable
                  ? "Impossible de récupérer les messages pour le moment (session en attente ou hors ligne)."
                  : "Aucun message dans cette conversation."}
              </Typography>
              {connectionUnavailable && (
                <Pressable
                  onPress={handleRefresh}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Typography variant="caption" style={{ color: "#FFFFFF", fontWeight: "700" }}>
                    Réessayer
                  </Typography>
                </Pressable>
              )}
            </Stack>
          }
          renderItem={({ item }) => {
            const plain = formatHTML(item.content || "").trim();
            return (
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 18,
                  padding: 14,
                  gap: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar
                    size={30}
                    initials={getInitials(item.author || "?")}
                    color={getProfileColorByName(item.author || "A")}
                  />
                  <View style={{ flex: 1 }}>
                    <Typography variant="title" numberOfLines={1}>
                      {item.author || "Interlocuteur"}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {new Date(item.date).toLocaleString([], {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Typography>
                  </View>
                </View>

                <Typography variant="body1" selectable>
                  {plain || "(Message vide)"}
                </Typography>

                {item.attachments && item.attachments.length > 0 && (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    {item.attachments.map((att, idx) => (
                      <Pressable
                        key={`${att.url}-${idx}`}
                        onPress={() => {
                          if (att.url) {
                            openAttachmentViewer(router, att);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          padding: 10,
                          borderRadius: 12,
                          backgroundColor: String(colors.primary) + "16",
                        }}
                      >
                        <Papicons name={getAttachmentIcon(att)} size={16} color={String(colors.primary)} />
                        <Typography variant="caption" style={{ color: colors.primary, flex: 1 }} numberOfLines={1}>
                          {att.name || "Pièce jointe"}
                        </Typography>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {chat?.ref && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Répondre à la discussion..."
            placeholderTextColor={String(colors.text) + "66"}
            multiline
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 110,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 20,
              backgroundColor: colors.background,
              color: colors.text,
              fontSize: 15,
            }}
          />
          <Pressable
            onPress={() => void handleSendReply()}
            disabled={sending || !replyText.trim()}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: replyText.trim() ? colors.primary : colors.border,
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Papicons name="Check" size={20} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
