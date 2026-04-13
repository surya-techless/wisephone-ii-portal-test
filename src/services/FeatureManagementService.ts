// src/services/FeatureManagementService.ts
import type { Feature } from "@/libs/utils";
import type { FeatureToggleParams } from "@/types/apps";

export interface ToggleProAndMinimalParams {
  imei: string;
  feature: Feature;
  isToolDrawerEnabled: boolean;
}

export class FeatureManagementService {
  async toggleFeature({ imei, feature, enabled, isA16Device, isCspireDevice }: FeatureToggleParams & { isA16Device?: boolean; isCspireDevice?: boolean }): Promise<void> {
    const url = new URL(`/api/samsung-knox.json`, window.location.origin);
    url.searchParams.set("action", enabled ? "apply-feature" : "remove-feature");
    url.searchParams.set("imei", imei);

    // Use CSPIRE group ID first, then A16, then default
    const knoxManageId =
      isCspireDevice && feature.cspireKnoxManageId ? feature.cspireKnoxManageId :
      isA16Device && feature.a16KnoxManageId ? feature.a16KnoxManageId : feature.knoxManageId;
    url.searchParams.set("knoxManageId", knoxManageId || "");

    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to ${enabled ? "enable" : "disable"} feature`);
    }
  }
}
