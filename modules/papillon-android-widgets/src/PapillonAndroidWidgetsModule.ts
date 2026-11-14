import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import type { WearConfig } from "@/stores/settings/types";

export interface AndroidWidgetCourse {
  id: string;
  subject: string;
  emoji?: string | null;
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
  emoji?: string | null;
  description: string;
  score: string;
  outOf: string;
  color: string;
  date: number;
}

export interface AndroidWidgetTask {
  id: string;
  subject: string;
  emoji?: string | null;
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

export interface AndroidWidgetAveragePoint {
  value: number;
  date: number;
}

export interface AndroidWidgetsSnapshot {
  updatedAt: number;
  accountName: string | null;
  overallAverage: string | null;
  overallAverageValue?: string | null;
  overallAverageScale?: string | null;
  overallAverageSubtitle?: string | null;
  averageHistory?: AndroidWidgetAveragePoint[];
  themeColor?: string | null;
  wallpaperGradientColors?: string[];
  wearConfig?: WearConfig;
  nextClasses: AndroidWidgetCourse[];
  latestGrades: AndroidWidgetGrade[];
  tasks: AndroidWidgetTask[];
  canteenCards: AndroidWidgetCanteenCard[];
}

export interface WearNodeInfo {
  id: string;
  displayName: string;
  isNearby: boolean;
}

export interface WearTaskToggleEvent {
  id: string;
  isDone: boolean;
}

interface PapillonAndroidWidgetsNativeModule {
  syncWidgetsSnapshot: (jsonPayload: string) => Promise<boolean>;
  reloadWidgets: () => Promise<boolean>;
  syncWatchSnapshotNow: () => Promise<boolean>;
  getConnectedWearNodes: () => Promise<WearNodeInfo[]>;
  consumePendingWearTaskToggles: () => Promise<WearTaskToggleEvent[]>;
  installApkOnPhone: (filePath: string) => Promise<boolean>;
  sendApkToWatch: (filePath: string) => Promise<boolean>;
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

export async function syncWatchSnapshotNow(): Promise<boolean> {
  if (!NativeModule?.syncWatchSnapshotNow) {
    return false;
  }
  return NativeModule.syncWatchSnapshotNow();
}

export async function getConnectedWearNodes(): Promise<WearNodeInfo[]> {
  if (!NativeModule?.getConnectedWearNodes) {
    return [];
  }
  return NativeModule.getConnectedWearNodes();
}

export async function consumePendingWearTaskToggles(): Promise<
  WearTaskToggleEvent[]
> {
  if (!NativeModule?.consumePendingWearTaskToggles) {
    return [];
  }
  return NativeModule.consumePendingWearTaskToggles();
}

export async function installApkOnPhone(filePath: string): Promise<boolean> {
  if (!NativeModule?.installApkOnPhone) {
    return false;
  }
  return NativeModule.installApkOnPhone(filePath);
}

export async function sendApkToWatch(filePath: string): Promise<boolean> {
  if (!NativeModule?.sendApkToWatch) {
    return false;
  }
  return NativeModule.sendApkToWatch(filePath);
}
