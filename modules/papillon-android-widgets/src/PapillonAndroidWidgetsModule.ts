import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export interface AndroidWidgetCourse {
  id: string;
  subject: string;
  room: string | null;
  teacher: string | null;
  color: string;
  from: number;
  to: number;
  isCanceled: boolean;
}

export interface AndroidWidgetGrade {
  id: string;
  subject: string;
  description: string;
  score: string;
  outOf: string;
  color: string;
  date: number;
}

export interface AndroidWidgetTask {
  id: string;
  subject: string;
  description: string;
  color: string;
  dueDate: number;
  isDone: boolean;
}

export interface AndroidWidgetCanteenCard {
  id: string;
  label: string;
  serviceName: string;
  balanceText: string | null;
  qrData: string | null;
  qrType: string | null;
}

export interface AndroidWidgetsSnapshot {
  updatedAt: number;
  accountName: string | null;
  overallAverage: string | null;
  nextClasses: AndroidWidgetCourse[];
  latestGrades: AndroidWidgetGrade[];
  tasks: AndroidWidgetTask[];
  canteenCards: AndroidWidgetCanteenCard[];
}

interface PapillonAndroidWidgetsNativeModule {
  syncWidgetsSnapshot: (jsonPayload: string) => Promise<boolean>;
  reloadWidgets: () => Promise<boolean>;
}

function getNativeModule(): PapillonAndroidWidgetsNativeModule | null {
  if (Platform.OS !== "android") {
    return null;
  }
  return requireOptionalNativeModule<PapillonAndroidWidgetsNativeModule>(
    "PapillonAndroidWidgets"
  );
}

const NativeModule = getNativeModule();

export const androidWidgetsAreSupported =
  Platform.OS === "android" && NativeModule !== null;

export async function syncWidgetsSnapshot(
  snapshot: AndroidWidgetsSnapshot
): Promise<boolean> {
  if (!NativeModule) {
    return false;
  }
  return NativeModule.syncWidgetsSnapshot(JSON.stringify(snapshot));
}

export async function reloadWidgets(): Promise<boolean> {
  if (!NativeModule) {
    return false;
  }
  return NativeModule.reloadWidgets();
}
