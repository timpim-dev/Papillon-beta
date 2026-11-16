import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";

import { AiLatexSheet, extractLatexBlocks } from "./latexParser";

export type { AiLatexSheet };

export type AiProviderId = "gemini" | "groq" | "mistral" | "custom";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  reminders?: AiReminderAction[];
  flashcards?: AiFlashcardItem[];
  latexSheets?: AiLatexSheet[];
  confirmedReminderIds?: string[];
}

export interface AiReminderAction {
  id: string;
  type: "schedule_reminder";
  title: string;
  body: string;
  triggerIso: string;
  subject?: string;
}

export interface AiFlashcardItem {
  id: string;
  type: "flashcard";
  front: string;
  back: string;
  subject?: string;
}

export interface ParsedAiResponse {
  displayText: string;
  reminders: AiReminderAction[];
  flashcards: AiFlashcardItem[];
  latexSheets: AiLatexSheet[];
}

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  freeTierInfo: string;
  signupUrl: string;
}

export const AI_PROVIDER_PRESETS: Record<AiProviderId, AiProviderPreset> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini (AI Studio)",
    defaultModel: "gemini-2.5-flash",
    freeTierInfo: "Gratuit sans carte bancaire via Google AI Studio (quota quotidien généreux).",
    signupUrl: "https://aistudio.google.com/apikey",
  },
  groq: {
    id: "groq",
    label: "Groq (Llama / Qwen)",
    defaultModel: "llama-3.3-70b-versatile",
    freeTierInfo: "Ultra rapide, gratuit sans carte bancaire sur GroqCloud.",
    signupUrl: "https://console.groq.com/keys",
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI (Europe)",
    defaultModel: "mistral-small-latest",
    freeTierInfo: "Excellent en français, offre gratuite sur La Plateforme Mistral.",
    signupUrl: "https://console.mistral.ai/api-keys/",
  },
  custom: {
    id: "custom",
    label: "Serveur Proxy / Endpoint personnalisé",
    defaultModel: "gpt-4o-mini",
    freeTierInfo: "URL compatible OpenAI ou Cloudflare Worker / route PocketBase partagée.",
    signupUrl: "https://pocketbase.felixx.dev",
  },
};

const API_KEY_STORE_KEY = "papillon_ai_api_key_v1";
const HISTORY_STORAGE_KEY = "ai_chat_messages_v1";
const aiStorage = createMMKV({ id: "papillon-ai-history" });

export async function getStoredAiApiKey(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(API_KEY_STORE_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function setStoredAiApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(API_KEY_STORE_KEY);
    return;
  }
  await SecureStore.setItemAsync(API_KEY_STORE_KEY, trimmed);
}

export function getAiChatHistory(): AiChatMessage[] {
  const raw = aiStorage.getString(HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAiChatHistory(messages: AiChatMessage[]): void {
  aiStorage.set(HISTORY_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
}

export function clearAiChatHistory(): void {
  aiStorage.remove(HISTORY_STORAGE_KEY);
}

export function buildSocraticSystemPrompt(contextText: string): string {
  return [
    "Tu es l'Assistant d'Étude de Papillon +, un tuteur scolaire bienveillant et méthodique.",
    "RÈGLES STRICTES (PÉDAGOGIE SOCRATIQUE — NE JAMAIS FAIRE À LA PLACE DE L'ÉLÈVE) :",
    "1. Tu aides à COMPRENDRE, structurer, réviser et corriger la méthode, mais tu REFUSES catégoriquement de rédiger un devoir complet, un paragraphe prêt à copier-coller, une traduction complète ou une solution finale d'exercice noté à rendre.",
    "2. Si l'élève demande la réponse directe (« fais mon devoir », « écris ma rédaction », « donne juste la réponse »), explique poliment que tu ne peux pas le faire à sa place, puis propose un plan en 3 étapes, un indice, une question de réflexion ou un exemple analogue avec d'autres nombres.",
    "3. Appuie-toi uniquement sur le contexte scolaire fourni ci-dessous (lecture seule) pour adapter tes conseils : créneaux libres réels pour les plans de révision, contrôles/devoirs urgents, points faibles dans les notes.",
    "4. Sois concis, clair et structuré (listes courtes, gras léger). Réponds en français sauf si l'élève te demande une aide dans une autre langue.",
    "5. ACTIONS STRUCTURÉES OPTIONNELLES : si tu proposes un rappel d'étude ou des fiches de révision (flashcards), tu peux ajouter À LA TOUTE FIN de ta réponse un bloc JSON strictement délimité par <<<ACTIONS et ACTIONS>>> contenant un tableau JSON d'objets parmi :",
    '   - { "type": "schedule_reminder", "title": "Réviser Maths : Fonctions", "body": "Relire le cours + 2 exos types", "triggerIso": "2026-11-15T18:00:00.000Z", "subject": "Mathématiques" }',
    '   - { "type": "flashcard", "subject": "Histoire", "front": "Date clé...", "back": "Réponse concise..." }',
    "   Ne mets un rappel que s'il correspond à un futur créneau libre ou à la demande de l'élève.",
    "6. FICHES DE RÉVISION LaTeX & PDF : si l'élève te demande une fiche de révision, un formulaire, une fiche mémo, du LaTeX ou un PDF pour réviser, génère un document LaTeX complet et propre entre <<<LATEX_DOC et LATEX_DOC>>> (ou un bloc ```latex ... ```). Commence par \\documentclass{article}, mets \\title{...}, \\section*{...}, listes (itemize/enumerate), formules ($...$, $$...$$) ou tableaux (tabular). L'app le convertira automatiquement en fichier PDF et .tex téléchargeable. Continue à refuser d'écrire un devoir noté à rendre à la place de l'élève.",
    "",
    "=== CONTEXTE SCOLAIRE (LECTURE SEULE) ===",
    contextText || "(Aucun contexte scolaire sélectionné)",
  ].join("\n");
}

export function parseAssistantResponse(rawText: string): ParsedAiResponse {
  const regex = /<<<ACTIONS\s*([\s\S]*?)\s*ACTIONS>>>/m;
  const match = regex.exec(rawText);
  const withoutActions = rawText.replace(regex, "").trim();
  const { displayText, latexSheets } = extractLatexBlocks(withoutActions);

  if (!match) {
    return {
      displayText:
        displayText ||
        (latexSheets.length > 0 ? "Voici ta fiche de révision prête à être ouverte ou exportée en PDF." : ""),
      reminders: [],
      flashcards: [],
      latexSheets,
    };
  }

  const reminders: AiReminderAction[] = [];
  const flashcards: AiFlashcardItem[] = [];

  try {
    let jsonPayload = match[1].trim();
    jsonPayload = jsonPayload.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonPayload);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    items.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      if (
        item.type === "schedule_reminder" &&
        typeof item.title === "string" &&
        typeof item.triggerIso === "string" &&
        !Number.isNaN(new Date(item.triggerIso).getTime())
      ) {
        reminders.push({
          id: `rem_${Date.now()}_${index}`,
          type: "schedule_reminder",
          title: item.title.slice(0, 90),
          body: typeof item.body === "string" ? item.body.slice(0, 180) : "Session de révision",
          triggerIso: item.triggerIso,
          subject: typeof item.subject === "string" ? item.subject : undefined,
        });
      } else if (
        item.type === "flashcard" &&
        typeof item.front === "string" &&
        typeof item.back === "string"
      ) {
        flashcards.push({
          id: `fc_${Date.now()}_${index}`,
          type: "flashcard",
          front: item.front.slice(0, 160),
          back: item.back.slice(0, 260),
          subject: typeof item.subject === "string" ? item.subject : undefined,
        });
      }
    });
  } catch {
    // Ignore malformed optional action block so text response still renders cleanly
  }

  return {
    displayText:
      displayText ||
      (latexSheets.length > 0 ? "Voici ta fiche de révision prête à être ouverte ou exportée en PDF." : ""),
    reminders,
    flashcards,
    latexSheets,
  };
}

export interface SendAiChatParams {
  provider: AiProviderId;
  model?: string;
  apiKey?: string;
  customEndpoint?: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export function buildProviderRequest(params: SendAiChatParams): {
  url: string;
  headers: Record<string, string>;
  body: string;
} {
  const model = params.model?.trim() || AI_PROVIDER_PRESETS[params.provider].defaultModel;
  const apiKey = params.apiKey?.trim() || "";

  if (params.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contents = params.messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    return {
      url,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 2400,
        },
      }),
    };
  }

  const endpointByProvider: Record<Exclude<AiProviderId, "gemini">, string> = {
    groq: "https://api.groq.com/openai/v1/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    custom: params.customEndpoint?.trim() || "",
  };

  const url = endpointByProvider[params.provider];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return {
    url,
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.45,
      max_tokens: 2400,
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  };
}

export async function sendAiChatCompletion(params: SendAiChatParams): Promise<ParsedAiResponse> {
  if (params.provider !== "custom" && !params.apiKey?.trim()) {
    throw new Error(
      "Aucune clé API configurée. Ajoute ta clé gratuite dans Paramètres → Assistant IA."
    );
  }
  if (params.provider === "custom" && !params.customEndpoint?.trim()) {
    throw new Error(
      "URL de proxy / endpoint manquante. Configure-la dans Paramètres → Assistant IA."
    );
  }

  const req = buildProviderRequest(params);
  const response = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.body,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Erreur API IA (${response.status}): ${errText.slice(0, 180)}`);
  }

  const json = await response.json();
  let rawText = "";

  if (params.provider === "gemini") {
    rawText =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";
  } else {
    rawText =
      json?.choices?.[0]?.message?.content ??
      json?.reply ??
      json?.content ??
      "";
  }

  if (!rawText.trim()) {
    throw new Error("L'assistant IA a renvoyé une réponse vide.");
  }

  return parseAssistantResponse(rawText);
}
