import { KNOX_CLIENT_SECRET, KNOX_CLIENT_ID, KNOX_REGION } from "astro:env/server";

export type App = {
  appAction: string;
  appId: string;
  appName: string;
  appRegType: string;
  appType: string;
  binarySize: string;
  cellularSliceUuid: string;
  crc: string;
  dataSize: string;
  deviceAppType: string;
  deviceId: string;
  dir: string;
  enabled: string;
  enrolledType: string;
  excelArea: string;
  excelAttr: string;
  excelHead: string;
  excelInstallType: string;
  excelRooting: string;
  filter: string;
  firewallId: string;
  firewallName: string;
  genericVpnId: string;
  genericVpnName: string;
  googleDeviceId: string;
  hasAppFeedback: string;
  insertChromeApp: string;
  installArea: string;
  installAreas: string[];
  installLocation: string;
  installUser: string;
  installed: string; // ISO date format string
  installedStatus: string;
  isAeDevice: string;
  isAutomaticDelete: string;
  isBackupPrevent: string;
  isCommonTenant: string;
  isConfiguration: string;
  isFeedBack: string;
  isGoogleManaged: string;
  isInstalledStatus: string;
  isManaged: string;
  isProvisioned: string;
  isRooting: string;
  knoxClientId: string;
  knoxId: string;
  knoxIds: string[];
  knoxManageType: string;
  knoxName: string;
  knoxType: string;
  limit: number;
  managedAppConfig: string;
  managedAppConfigMap: Record<string, unknown>;
  managedAppConfigSize: number;
  managedAppFeedback: string;
  managedAppFeedbackMap: Record<string, unknown>;
  managedAppFeedbackSize: number;
  mandatoryApp: string;
  mandatoryApps: string[];
  mobileId: string;
  mocanaVpnId: string;
  mocanaVpnName: string;
  packageFullName: string;
  packageName: string;
  packageNameList: string[];
  pkEmpty: boolean;
  platform: string;
  platformName: string;
  processStatus: string;
  processStatuses: string[];
  runningCount: string;
  searchPackageAppName: string;
  sharedUserId: string;
  sort: string;
  start: number;
  systemApp: string;
  systemAppUpdated: string;
  tenantId: string;
  unusedRedemCode: string;
  updated: string; // ISO date format string
  versionCode: string;
  versionName: string;
  vpnId: string;
  vpnName: string;
};

type KnoxAppListResponse = {
  resultCode: string;
  resultMessage: string;
  resultValue: {
    appList: App[];
  };
};

export class SamsungKnoxService {
  private static token: string | null = null;
  private static tokenExpiry: number | null = null;

  /**
   * Get a Knox token. This token is used to authenticate requests to the Knox API.
   * Token renews every 900 seconds (15 minutes).
   * @returns Knox token
   */
  public static async getKnoxToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (SamsungKnoxService.token && SamsungKnoxService.tokenExpiry && now < SamsungKnoxService.tokenExpiry) {
      return SamsungKnoxService.token;
    }

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oauth/token`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: KNOX_CLIENT_ID,
          client_secret: KNOX_CLIENT_SECRET
        })
      });

      if (!response.ok) {
        throw new Error("Failed to get Knox token");
      }

      const data = (await response.json()) as { access_token: string };

      if (!data.access_token) {
        throw new Error("Failed to get Knox token");
      }

      return data.access_token;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to get Knox token");
    }
  }

  public static async applyFeature(
    groupId: string,
    imei: string = "",
    applyProfile: boolean = true
  ): Promise<Record<string, any> | null> {
    if (!imei || !groupId) {
      return null;
    }

    const queryParams = new URLSearchParams({
      groupId,
      applyProfile: applyProfile ? "1" : "0",
      ...(imei && { userIds: imei })
    });

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/group/insertGroupUnits`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: queryParams
    });

    if (!response.ok) {
      throw new Error("Failed to add devices to group");
    }

    return response.json();
  }

  public static async removeFeature(
    groupId: string,
    imei: string = "",
    applyProfile: boolean = true
  ): Promise<Record<string, any> | null> {
    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/group/deleteGroupUnits`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        groupId,
        userIds: imei,
        applyProfile: applyProfile ? "1" : "0"
      })
    });

    if (!response.ok) {
      throw new Error("Failed to remove device from group");
    }

    return response.json();
  }

  public static async selectGroups(): Promise<Record<string, any> | null> {
    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/group/selectGroups`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Knox groups");
    }

    return response.json();
  }

  public static async getListOfFeatures(): Promise<Record<string, string>> {
    const groups = await this.selectGroups();
    const simpleGroups: Record<string, string> = {};

    if (groups?.resultValue?.groups) {
      for (const group of groups.resultValue.groups) {
        simpleGroups[group.groupName] = group.groupId;
      }
    }

    return simpleGroups;
  }

  public static async getGroupsForDevice(imei: string): Promise<string[]> {
    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/device/selectDeviceInfoByImei`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ imei })
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Knox device groups");
    }

    const data = await response.json();
    return data.resultValue?.groupIdList ?? [];
  }

  /**
   * Send a notification to a device
   * @param imei - The IMEI number of the device
   * @param title - The notification title (max 30 characters)
   * @param message - The notification message (max 200 characters)
   * @param options - Additional options for the notification
   * @returns The response from the Knox API
   */
  public static async sendNotification(
    imei: string,
    title: string,
    message: string,
    options?: {
      containerFlag?: boolean;
      sendType?: "Notification" | "Popup";
    }
  ): Promise<Record<string, any>> {
    if (title.length > 30) {
      throw new Error("Notification title cannot exceed 30 characters");
    }
    if (message.length > 200) {
      throw new Error("Notification message cannot exceed 200 characters");
    }

    const deviceId = await this.getDeviceIdFromImei(imei);

    if (!deviceId) {
      throw new Error("Device not found");
    }

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/mdm/commonOTCServiceWrapper/sendDeviceControlForNotification `;

    const params = new URLSearchParams({
      deviceId,
      title,
      message,
      ...(options?.containerFlag !== undefined && { containerFlag: options.containerFlag.toString() }),
      ...(options?.sendType && { sendType: options.sendType })
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(data);
      throw new Error("Failed to send notification to device");
    }

    return response.json();
  }

  /**
   * Get device ID from IMEI number
   * @param imei - The IMEI number of the device
   * @returns The device ID or null if not found
   */
  public static async getDeviceIdFromImei(imei: string): Promise<string | null> {
    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/device/selectDeviceInfoByImei`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.getKnoxToken()}`,
          "cache-control": "no-cache",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ imei })
      });

      if (!response.ok) {
        throw new Error("Failed to fetch device info");
      }

      const data = await response.json();

      return data.resultValue?.deviceId ?? null;
    } catch (error) {
      console.error("Error fetching device ID:", error);
      return null;
    }
  }

  /**
   * Install an Android application on a device
   * @param imei - The IMEI number of the device
   * @param appInfo - Information about the app to install
   * @param appInfo.url - URL where the APK file is hosted
   * @param appInfo.appPackage - Application package name
   * @param appInfo.component - Explicit Intent Name. Parameters for install app by url.
   * @param appInfo.componentClass - Select either Activity or Broadcast or Service
   * @param appInfo.autoRun - Auto run app after installing (Automatic or Manual)
   * @param appInfo.knoxId - Optional KNOX ID that UEM Service issued (null means default area on android device)
   * @returns The response from the Knox API
   * https://docs.samsungknox.com/dev/knox-manage/api/#tag/Device-Command/operation/sendDeviceControlForInstallApp
   */
  public static async installAndroidApp(
    imei: string,
    appInfo: {
      url?: string;
      appPackage: string;
      component?: string;
      autoRun?: "Automatic" | "Manual";
      componentClass?: "Activity" | "Broadcast" | "Service";
      knoxId?: string;
    }
  ): Promise<Record<string, any>> {
    const deviceId = await this.getDeviceIdFromImei(imei);

    if (!deviceId) {
      throw new Error("Device not found");
    }

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/mdm/commonOTCServiceWrapper/sendDeviceControlForInstallApp`;

    const params = new URLSearchParams({
      deviceId,
      appPackage: appInfo.appPackage,
      action: "unknown",
      autoRun: appInfo.autoRun || "Manual",
      componentClass: appInfo.componentClass || "Activity",
      ...(appInfo.component && { component: appInfo.component }),
      ...(appInfo.url && { url: appInfo.url }),
      ...(appInfo.knoxId && { knoxId: appInfo.knoxId })
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(data);
      throw new Error("Failed to initiate app installation on device");
    }

    const data = await response.json();

    if (!data.resultValue) {
      throw new Error("Failed to initiate app installation on device");
    }

    return data as {
      resultCode: string;
      resultMessage: string;
      resultValue: {
        areaResult: {
          area: string;
          commandId: string;
          optionData: string;
          result: string;
          type: string;
        }[];
        deviceId: string;
        platform: string;
      };
    };
  }

  /**
   * Uninstall an Android application from a device
   * @param imei - The IMEI number of the device
   * @param appPackage - Application package name
   * @param knoxId - Optional KNOX ID that UEM Service issued
   * @returns The response from the Knox API
   * @see https://docs.samsungknox.com/dev/knox-manage/api/#tag/Device-Command/operation/sendDeviceControlForUninstallApp
   */
  public static async uninstallAndroidApp(
    imei: string,
    appPackage: string,
    knoxId?: string
  ): Promise<{
    resultCode: string;
    resultMessage: string;
    resultValue: {
      areaResult: {
        area: string;
        commandId: string;
        optionData: string;
        result: string;
        type: string;
      }[];
      deviceId: string;
      platform: string;
    };
  }> {
    const deviceId = await this.getDeviceIdFromImei(imei);

    if (!deviceId) {
      throw new Error("Device not found");
    }

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/mdm/commonOTCServiceWrapper/sendDeviceControlForUninstallApp`;

    const params = new URLSearchParams({
      deviceId,
      appPackage
    });

    // Only add knoxId if it's provided
    if (knoxId) {
      params.append("knoxId", knoxId);
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(data);
      throw new Error("Failed to initiate app uninstallation on device");
    }

    const data = await response.json();

    if (!data.resultValue) {
      throw new Error("Failed to initiate app uninstallation on device");
    }

    return data;
  }

  /**
   * Get the list of installed applications on a device
   * @param imei - The IMEI number of the device
   * @returns The list of installed applications
   * @see https://docs.samsungknox.com/dev/knox-manage/api/#tag/Device/operation/selectDeviceAppList
   */
  public static async getInstalledApps(imei: string): Promise<KnoxAppListResponse> {
    const deviceId = await this.getDeviceIdFromImei(imei);

    if (!deviceId) {
      throw new Error("Device not found");
    }

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/device/selectDeviceAppList`;

    const params = new URLSearchParams({
      deviceId
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(data);
      throw new Error("Failed to fetch installed applications");
    }

    const data = await response.json();

    if (!data.resultValue) {
      throw new Error("Failed to fetch installed applications");
    }

    return data as KnoxAppListResponse;
  }

  /**
   * Trigger a synchronization of the installed applications list on a device
   * @param imei - The IMEI number of the device
   * @returns The response from the Knox API
   * @see https://docs.samsungknox.com/dev/knox-manage/api/#tag/Device-Command/operation/sendDeviceControlForSyncInstalledAppList
   */
  public static async syncInstalledAppList(imei: string): Promise<{
    resultCode: string;
    resultMessage: string;
    resultValue: {
      commandId: string;
    };
  }> {
    const deviceId = await this.getDeviceIdFromImei(imei);

    if (!deviceId) {
      throw new Error("Device not found");
    }

    const apiUrl = `https://${KNOX_REGION}.manage.samsungknox.com/emm/oapi/mdm/commonOTCServiceWrapper/sendDeviceControlForSyncInstalledAppList`;

    const params = new URLSearchParams({
      deviceId
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.getKnoxToken()}`,
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(data);
      throw new Error("Failed to sync installed applications list");
    }

    const data = await response.json();

    if (!data.resultValue) {
      throw new Error("Failed to sync installed applications list");
    }

    return data;
  }
}
