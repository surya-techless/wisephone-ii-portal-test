// src/types/apps.ts
import type { Feature } from "@/libs/utils";

export type AppSource = "faith.tools" | "Tool Drawer";

export interface AppEntry {
  packageName: string;
  installed: boolean;
  name: string;
  source: AppSource;
}

export type AppsList = Record<string, Omit<AppEntry, "packageName">>;

export interface FeatureToggleParams {
  imei: string;
  feature: Feature;
  enabled: boolean;
}

export type CurrentView = "installed" | "faith-tools" | "tool-drawer";
