import { Colors } from "@/utils/colors";
import { AppFontFamily } from "@/utils/theme/fonts";

export interface SettingsStorage {
  personalization: Personalization;
  reset: () => void;
  mutateProperty: <T extends keyof SettingsState>(
    section: T,
    updates: Partial<SettingsState[T]>
  ) => void;
}

export interface SettingsState {
  personalization: Personalization;
}

export interface Path {
  directory: string;
  name: string;
}

export interface Wallpaper {
  id: string;
  url?: string;
  path?: Path;
  thumbnail?: string;
  credit?: string;
}

export type CalendarViewMode = "list" | "week";

export type HomeWidgetId =
  | "timetable"
  | "tasks"
  | "grades_average"
  | "latest_grades"
  | "news";

export interface HomeWidgetConfig {
  id: HomeWidgetId;
  enabled: boolean;
}

export type WearSectionId = "classes" | "tasks" | "grades" | "canteen";

export type WearTilePreset =
  | "next_2_classes"
  | "next_class_countdown"
  | "homework"
  | "grade_average"
  | "latest_grades"
  | "overview";

export type WearComplicationMetric =
  | "next_class"
  | "next_class_countdown"
  | "tasks_count"
  | "overall_average"
  | "latest_grade";

export interface WearConfig {
  syncThemeGradient: boolean;
  enabledSections: WearSectionId[];
  complicationMetric: WearComplicationMetric;
  tilePreset?: WearTilePreset;
}

export interface AccountWallpaper {
  wallpaper?: Wallpaper;
  // Restored when switching the wallpaper modal back from gradient to image
  lastImageWallpaper?: Wallpaper;
  wallpaperGradient?: { colors: string[]; seed: number };
}

export interface Personalization {
  fontFamily?: AppFontFamily;
  gradesDisplayScale?: "20" | "10" | "5" | "percentage";
  calendarViewMode?: CalendarViewMode;
  /** Height of one hour in the weekly calendar grid, set by pinching it. */
  calendarHourHeight?: number;
  colorSelected?: Colors;
  theme?: "light" | "dark" | "auto";
  useMaterialYou?: boolean;
  iOSBottomAccessoryEnabled?: boolean;
  showTabBarLabels?: boolean;
  magicEnabled?: boolean;
  hideNameOnHomeScreen?: boolean;
  showAlertAtLogin?: boolean;
  showDevMode?: boolean;
  mockDataEnabled?: boolean;
  liveActivityTestMode?: boolean;
  liveActivitiesEnabled?: boolean;
  magicModelURL?: string;
  language?: string | null;
  // Legacy global wallpaper, read as the fallback for accounts without their own entry
  wallpaper?: Wallpaper;
  lastImageWallpaper?: Wallpaper;
  wallpaperGradient?: { colors: string[]; seed: number };
  wallpapersByAccount?: Record<string, AccountWallpaper>;
  disabledTabs?: string[];
  disabledTabsByAccount?: Record<string, string[]>;
  homeWidgets?: HomeWidgetConfig[];
  homeWidgetsByAccount?: Record<string, HomeWidgetConfig[]>;
  wearConfig?: WearConfig;
  gradesSortMethod?: string;
  gradesPeriodName?: string;
  installedVersion?: string;
  releaseNotesSeenForVersion?: string;
  welcomeModalSeen?: boolean;
  // Homework reminders & communication alerts
  homeworkRemindersEnabled?: boolean;
  homeworkReminderHour?: number;
  homeworkReminderMinute?: number;
  homeworkReminderDaysBefore?: number;
  homeworkDailyDigestEnabled?: boolean;
  communicationNotificationsEnabled?: boolean;
  newsNotificationsEnabled?: boolean;
  // Context-aware AI Study Assistant
  aiAssistantEnabled?: boolean;
  aiFirstOpenAsked?: boolean;
  aiCookiesAccepted?: boolean;
  aiProvider?: "gemini" | "groq" | "mistral" | "custom";
  aiModel?: string;
  aiCustomEndpoint?: string;
  // Fun Mode (grade gacha reveal, off by default)
  funModeEnabled?: boolean;
  funModeOpeningStyle?: "envelope" | "gift";
}
