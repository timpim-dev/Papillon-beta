import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "expo-router/react-navigation";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Switch, TextInput, TouchableOpacity, View } from "react-native";

import SettingsHeader from "@/components/SettingsHeader";
import { useSettingsStore } from "@/stores/settings";
import Icon from "@/ui/components/Icon";
import Item, { Leading, Trailing } from "@/ui/components/Item";
import List from "@/ui/components/List";
import Typography from "@/ui/components/Typography";
import {
  AI_PROVIDER_PRESETS,
  AiProviderId,
  clearAiChatHistory,
  getStoredAiApiKey,
  setStoredAiApiKey,
} from "@/utils/ai/aiClient";

const PROVIDERS: AiProviderId[] = ["gemini", "groq", "mistral", "custom"];

export default function AiSettingsScreen() {
  const { colors } = useTheme();
  const personalization = useSettingsStore(s => s.personalization);
  const mutateProperty = useSettingsStore(s => s.mutateProperty);

  const selectedProvider: AiProviderId = personalization.aiProvider ?? "gemini";
  const preset = AI_PROVIDER_PRESETS[selectedProvider];

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(
    personalization.aiModel ?? preset.defaultModel
  );
  const [endpointInput, setEndpointInput] = useState(
    personalization.aiCustomEndpoint ?? ""
  );
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    void getStoredAiApiKey().then(k => {
      setApiKeyInput(k);
      setKeySaved(Boolean(k));
    });
  }, []);

  const handleSelectProvider = (id: AiProviderId) => {
    const nextPreset = AI_PROVIDER_PRESETS[id];
    mutateProperty("personalization", {
      aiProvider: id,
      aiModel: nextPreset.defaultModel,
    });
    setModelInput(nextPreset.defaultModel);
  };

  const handleSaveCredentials = async () => {
    await setStoredAiApiKey(apiKeyInput);
    mutateProperty("personalization", {
      aiModel: modelInput.trim() || preset.defaultModel,
      aiCustomEndpoint: endpointInput.trim() || undefined,
    });
    setKeySaved(Boolean(apiKeyInput.trim()));
    Alert.alert("Enregistré", "La configuration de ton assistant IA a été sauvegardée de manière chiffrée.");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
    >
      <SettingsHeader
        color="#7C3AED"
        title="Assistant IA d'étude"
        description="Coach scolaire en lecture seule — choisit un fournisseur gratuit et gère tes cookies IA."
        iconName="Sparkles"
      />

      <List>
        <Item>
          <Leading>
            <Icon papicon opacity={0.7}>
              <Papicons name="Sparkles" />
            </Icon>
          </Leading>
          <Typography variant="title">Activer l'Assistant IA</Typography>
          <Typography variant="caption" color="secondary">
            Affiche ou masque l'onglet et l'accès rapide
          </Typography>
          <Trailing>
            <Switch
              value={personalization.aiAssistantEnabled !== false}
              onValueChange={val => {
                mutateProperty("personalization", { aiAssistantEnabled: val });
              }}
            />
          </Trailing>
        </Item>

        <Item>
          <Leading>
            <Icon papicon opacity={0.7}>
              <Papicons name="Check" />
            </Icon>
          </Leading>
          <Typography variant="title">Cookies fonctionnels IA</Typography>
          <Typography variant="caption" color="secondary">
            Consentement pour analyser ton contexte et sauvegarder le fil local
          </Typography>
          <Trailing>
            <Switch
              value={Boolean(personalization.aiCookiesAccepted)}
              onValueChange={val => {
                mutateProperty("personalization", {
                  aiCookiesAccepted: val,
                  aiFirstOpenAsked: true,
                });
              }}
            />
          </Trailing>
        </Item>
      </List>

      <Typography variant="title" style={{ marginTop: 6 }}>
        Fournisseur IA (Offres gratuites)
      </Typography>
      <View style={{ gap: 8 }}>
        {PROVIDERS.map(id => {
          const item = AI_PROVIDER_PRESETS[id];
          const active = selectedProvider === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => handleSelectProvider(id)}
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1.5,
                borderColor: active ? colors.primary : colors.border,
                gap: 4,
              }}
            >
              <Typography variant="title" style={{ color: active ? String(colors.primary) : String(colors.text) }}>
                {active ? `✓ ${item.label}` : item.label}
              </Typography>
              <Typography variant="caption" color="secondary">
                {item.freeTierInfo}
              </Typography>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={() => void WebBrowser.openBrowserAsync(preset.signupUrl)}
        style={{
          padding: 12,
          borderRadius: 14,
          backgroundColor: String(colors.primary) + "16",
          alignItems: "center",
        }}
      >
        <Typography variant="title" style={{ color: String(colors.primary), fontSize: 14 }}>
          Obtenir une clé gratuite ({preset.label}) ↗
        </Typography>
      </TouchableOpacity>

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 18,
          padding: 14,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 10,
        }}
      >
        <Typography variant="title">Clé API & Modèle ({keySaved ? "Clé stockée" : "Aucune clé"})</Typography>
        <TextInput
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          placeholder="Colle ta clé API (stockée dans SecureStore)"
          placeholderTextColor={String(colors.text) + "66"}
          secureTextEntry
          autoCapitalize="none"
          style={{
            backgroundColor: colors.background,
            color: colors.text,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <TextInput
          value={modelInput}
          onChangeText={setModelInput}
          placeholder={`Modèle (défaut : ${preset.defaultModel})`}
          placeholderTextColor={String(colors.text) + "66"}
          autoCapitalize="none"
          style={{
            backgroundColor: colors.background,
            color: colors.text,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        {selectedProvider === "custom" && (
          <TextInput
            value={endpointInput}
            onChangeText={setEndpointInput}
            placeholder="https://ton-proxy.workers.dev/chat"
            placeholderTextColor={String(colors.text) + "66"}
            autoCapitalize="none"
            style={{
              backgroundColor: colors.background,
              color: colors.text,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        )}
        <TouchableOpacity
          onPress={() => void handleSaveCredentials()}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 14,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Typography variant="title" style={{ color: "#FFFFFF" }}>
            Enregistrer la configuration IA
          </Typography>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => {
          Alert.alert("Effacer l'historique ?", "Supprime toutes les conversations IA de cet appareil.", [
            { text: "Annuler", style: "cancel" },
            {
              text: "Effacer",
              style: "destructive",
              onPress: () => {
                clearAiChatHistory();
                Alert.alert("Effacé", "Historique des discussions IA supprimé.");
              },
            },
          ]);
        }}
        style={{
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: "center",
          borderWidth: 1,
          borderColor: "#DC262655",
          backgroundColor: "#DC262610",
        }}
      >
        <Typography variant="title" style={{ color: "#DC2626" }}>
          Effacer l'historique des discussions
        </Typography>
      </TouchableOpacity>
    </ScrollView>
  );
}
