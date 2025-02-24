// src/services/FeatureManagementService.ts
import type { Feature } from "@/libs/utils";
import type { FeatureToggleParams } from "@/types/apps";
import { KNOX_USER_GROUPS } from "@/libs/utils";

export interface ToggleProAndMinimalParams {
  imei: string;
  feature: Feature;
  isToolDrawerEnabled: boolean;
}

export class FeatureManagementService {
  async toggleFeature({ imei, feature, enabled }: FeatureToggleParams): Promise<void> {
    const url = new URL(`/api/samsung-knox.json`, window.location.origin);
    url.searchParams.set("action", enabled ? "apply-feature" : "remove-feature");
    url.searchParams.set("imei", imei);
    url.searchParams.set("knoxManageId", feature.knoxManageId);

    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to ${enabled ? "enable" : "disable"} feature`);
    }
  }

  async toggleProAndMinimalFeature({ imei, isToolDrawerEnabled }: ToggleProAndMinimalParams): Promise<void> {
    const removeGroupId = isToolDrawerEnabled ? KNOX_USER_GROUPS.PRO : KNOX_USER_GROUPS.MINIMAL;
    const addGroupId = isToolDrawerEnabled ? KNOX_USER_GROUPS.MINIMAL : KNOX_USER_GROUPS.PRO;

    const removeUrl = new URL(`/api/samsung-knox.json`, window.location.origin);
    removeUrl.searchParams.set("action", "remove-feature");
    removeUrl.searchParams.set("imei", imei);
    removeUrl.searchParams.set("knoxManageId", removeGroupId);

    const addUrl = new URL(`/api/samsung-knox.json`, window.location.origin);
    addUrl.searchParams.set("action", "apply-feature");
    addUrl.searchParams.set("imei", imei);
    addUrl.searchParams.set("knoxManageId", addGroupId);

    const [removeResponse, addResponse] = await Promise.all([
      fetch(removeUrl, { method: "POST" }),
      fetch(addUrl, { method: "POST" })
    ]);

    if (!removeResponse.ok || !addResponse.ok) {
      const errors = await Promise.all([
        removeResponse.json().catch(() => ({ error: "Failed to remove feature" })),
        addResponse.json().catch(() => ({ error: "Failed to add feature" }))
      ]);
      throw new Error(errors.map((e) => e.error).join(", "));
    }
  }
}
