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
