import { Platform } from "react-native";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { Colors } from "@/utils/colors";
import { MAGIC_URL } from "@/utils/endpoints";

import { createMMKVStorage } from "../global";
import {
  HomeWidgetConfig,
  HomeWidgetId,
  Personalization,
  SettingsState,
  SettingsStorage,
  WearComplicationMetric,
  WearConfig,
  WearSectionId,
  WearTilePreset,
} from "./types";

export const DEFAULT_MATERIAL_YOU_ENABLED =
  Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version >= 31;

export const DEFAULT_HOME_WIDGETS: HomeWidgetConfig[] = [
  { id: "timetable", enabled: true },
  { id: "tasks", enabled: true },
  { id: "grades_average", enabled: true },
  { id: "latest_grades", enabled: true },
  { id: "news", enabled: true },
];

const VALID_HOME_WIDGET_IDS = new Set<HomeWidgetId>(
  DEFAULT_HOME_WIDGETS.map(widget => widget.id)
);

/**
 * Resolves the Home tab widget list for the active account, preserving user
 * ordering while ensuring any newly introduced widgets appear at the end.
 */
export function getHomeWidgetsForAccount(
  personalization?: Personalization,
  accountId?: string
): HomeWidgetConfig[] {
  const saved = accountId
    ? (personalization?.homeWidgetsByAccount?.[accountId] ?? personalization?.homeWidgets)
    : personalization?.homeWidgets;

  if (!saved || saved.length === 0) {
    return DEFAULT_HOME_WIDGETS.map(widget => ({ ...widget }));
  }

  const seen = new Set<HomeWidgetId>();
  const resolved: HomeWidgetConfig[] = [];

  for (const item of saved) {
    if (VALID_HOME_WIDGET_IDS.has(item.id) && !seen.has(item.id)) {
      seen.add(item.id);
      resolved.push({ id: item.id, enabled: Boolean(item.enabled) });
    }
  }

  for (const fallback of DEFAULT_HOME_WIDGETS) {
    if (!seen.has(fallback.id)) {
      resolved.push({ ...fallback });
    }
  }

  return resolved;
}

export const DEFAULT_WEAR_CONFIG: WearConfig = {
  syncThemeGradient: true,
  enabledSections: ["classes", "tasks", "grades", "canteen"],
  complicationMetric: "next_class",
  tilePreset: "next_2_classes",
};

const VALID_WEAR_SECTIONS = new Set<WearSectionId>(
  DEFAULT_WEAR_CONFIG.enabledSections
);

const VALID_WEAR_TILE_PRESETS = new Set<WearTilePreset>([
  "next_2_classes",
  "next_class_countdown",
  "homework",
  "grade_average",
  "latest_grades",
  "overview",
]);

const VALID_WEAR_METRICS = new Set<WearComplicationMetric>([
  "next_class",
  "next_class_countdown",
  "tasks_count",
  "overall_average",
  "latest_grade",
]);

/**
 * Normalizes persisted Wear OS preferences, ensuring the section list
 * contains valid unique section identifiers.
 */
export function resolveWearConfig(personalization?: Personalization): WearConfig {
  const saved = personalization?.wearConfig;
  if (!saved) {
    return {
      ...DEFAULT_WEAR_CONFIG,
      enabledSections: [...DEFAULT_WEAR_CONFIG.enabledSections],
    };
  }

  const seen = new Set<WearSectionId>();
  const sections: WearSectionId[] = [];
  for (const id of saved.enabledSections ?? []) {
    if (VALID_WEAR_SECTIONS.has(id) && !seen.has(id)) {
      seen.add(id);
      sections.push(id);
    }
  }

  const metric =
    saved.complicationMetric && VALID_WEAR_METRICS.has(saved.complicationMetric)
      ? saved.complicationMetric
      : "next_class";
  const tilePreset =
    saved.tilePreset && VALID_WEAR_TILE_PRESETS.has(saved.tilePreset)
      ? saved.tilePreset
      : "next_2_classes";

  return {
    syncThemeGradient: saved.syncThemeGradient ?? true,
    enabledSections:
      sections.length > 0 || (saved.enabledSections && saved.enabledSections.length === 0)
        ? sections
        : [...DEFAULT_WEAR_CONFIG.enabledSections],
    complicationMetric: metric,
    tilePreset,
  };
}

const defaultPersonalization: Personalization = {
  fontFamily: "sn-pro",
  colorSelected: Colors.GREEN,
  theme: "auto",
  useMaterialYou: DEFAULT_MATERIAL_YOU_ENABLED,
  iOSBottomAccessoryEnabled: true,
  showTabBarLabels: true,
  magicEnabled: true,
  hideNameOnHomeScreen: false,
  showAlertAtLogin: false,
  showDevMode: false,
  mockDataEnabled: false,
  liveActivityTestMode: false,
  liveActivitiesEnabled: true,
  magicModelURL: MAGIC_URL,
  gradesDisplayScale: "20",
  welcomeModalSeen: false,
  homeWidgets: DEFAULT_HOME_WIDGETS,
  wearConfig: DEFAULT_WEAR_CONFIG,
  homeworkRemindersEnabled: true,
  homeworkReminderHour: 18,
  homeworkReminderMinute: 30,
  homeworkReminderDaysBefore: 1,
  homeworkDailyDigestEnabled: true,
  communicationNotificationsEnabled: true,
  newsNotificationsEnabled: true,
  aiAssistantEnabled: true,
  aiFirstOpenAsked: false,
  aiCookiesAccepted: false,
  aiProvider: "gemini",
  aiModel: "gemini-2.5-flash",
};

export const useSettingsStore = create<SettingsStorage>()(
  persist(
    (set, get) => ({
      personalization: defaultPersonalization,
      reset: () => { set({ personalization: defaultPersonalization }) },
      mutateProperty: <T extends keyof SettingsState>(
        section: T,
        updates: Partial<SettingsState[T]>
      ) => {
        set(state => ({
          ...state,
          [section]: {
            ...state[section],
            ...updates,
          },
        }));
      },
    }),
    {
      name: "settings-storage",
      storage: createMMKVStorage("settings"),
      version: 1,
    }
  )
);
