// src/services/FeatureManagementService.ts
import type { Feature } from "@/libs/utils";
import type { FeatureToggleParams } from "@/types/apps";

export interface ToggleProAndMinimalParams {
  imei: string;
  feature: Feature;
  isToolDrawerEnabled: boolean;
}

export class FeatureManagementService {
  async toggleFeature({ imei, feature, enabled, isA16Device }: FeatureToggleParams & { isA16Device?: boolean }): Promise<void> {
    const url = new URL(`/api/samsung-knox.json`, window.location.origin);
    url.searchParams.set("action", enabled ? "apply-feature" : "remove-feature");
    url.searchParams.set("imei", imei);

    // Use A16 group ID if device is A16 and feature has A16 ID, otherwise use regular ID
    const knoxManageId = isA16Device && feature.a16KnoxManageId ? feature.a16KnoxManageId : feature.knoxManageId;
    url.searchParams.set("knoxManageId", knoxManageId);

    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to ${enabled ? "enable" : "disable"} feature`);
    }
  }
}
