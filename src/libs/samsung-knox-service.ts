import { KNOX_CLIENT_SECRET, KNOX_CLIENT_ID, KNOX_REGION } from "astro:env/server";

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
}
