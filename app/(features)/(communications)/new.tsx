import { Stack as ExpoStack, useRouter } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getManager } from "@/services/shared";
import { Recipient } from "@/services/shared/chat";
import { useAccountStore } from "@/stores/account";
import Avatar from "@/ui/components/Avatar";
import Typography from "@/ui/new/Typography";
import { getProfileColorByName } from "@/utils/chats/colors";
import { getInitials } from "@/utils/chats/initials";

export default function NewCommunicationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const manager = getManager();
        if (manager) {
          const available = await manager.getRecipientsAvailableForNewChat();
          setRecipients(available);
        }
      } catch {
        setRecipients([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredRecipients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return recipients;
    }
    return recipients.filter(r =>
      `${r.name} ${r.class ?? ""}`.toLowerCase().includes(q)
    );
  }, [query, recipients]);

  const toggleRecipient = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    const chosen = recipients.filter(r => selectedIds.includes(r.id));
    if (chosen.length === 0) {
      Alert.alert("Destinataire manquant", "Choisis au moins un destinataire.");
      return;
    }
    if (!subject.trim() || !content.trim()) {
      Alert.alert("Champs requis", "Indique un objet et un message.");
      return;
    }
    const manager = getManager();
    if (!manager) {
      Alert.alert("Hors ligne", "Session indisponible.");
      return;
    }
    setSending(true);
    try {
      const accountId = useAccountStore.getState().lastUsedAccount || "";
      await manager.createMail(accountId, subject.trim(), content.trim(), chosen);
      Alert.alert("Message envoyé", "Ta nouvelle discussion a bien été créée.");
      router.back();
    } catch (err) {
      Alert.alert("Erreur", `Création impossible : ${String(err)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }}>
      <ExpoStack.Screen
        options={{
          headerShown: true,
          headerTitle: "Nouvelle discussion",
        }}
      />

      <View style={{ padding: 16, gap: 10 }}>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Objet de la discussion"
          placeholderTextColor={String(colors.text) + "66"}
          style={{
            backgroundColor: colors.card,
            color: colors.text,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="Écrire ton message..."
          placeholderTextColor={String(colors.text) + "66"}
          multiline
          style={{
            minHeight: 90,
            maxHeight: 150,
            backgroundColor: colors.card,
            color: colors.text,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            textAlignVertical: "top",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Destinataires (${selectedIds.length} sélectionné(s))...`}
          placeholderTextColor={String(colors.text) + "66"}
          style={{
            backgroundColor: colors.card,
            color: colors.text,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredRecipients}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <Pressable
                onPress={() => toggleRecipient(item.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: selected ? String(colors.primary) + "22" : colors.card,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                }}
              >
                <Avatar
                  size={34}
                  initials={getInitials(item.name)}
                  color={getProfileColorByName(item.name)}
                />
                <View style={{ flex: 1 }}>
                  <Typography variant="title" numberOfLines={1}>
                    {item.name}
                  </Typography>
                  {item.class && (
                    <Typography variant="caption" color="textSecondary">
                      {item.class}
                    </Typography>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View style={{ paddingHorizontal: 16 }}>
        <Pressable
          onPress={() => void handleSend()}
          disabled={sending}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Typography variant="title" style={{ color: "#FFFFFF" }}>
            {sending ? "Envoi en cours..." : "Envoyer le message"}
          </Typography>
        </Pressable>
      </View>
    </View>
  );
}
