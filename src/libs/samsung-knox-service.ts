export class SamsungKnoxService {
  private static instance: SamsungKnoxService | null = null;
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private region: string | null = null;
  private clientId: string | null = null;
  private clientSecret: string | null = null;

  private constructor(region: string, clientId: string, clientSecret: string) {
    this.region = region;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  public static getInstance({
    region,
    clientId,
    clientSecret
  }: {
    region: string;
    clientId: string;
    clientSecret: string;
  }): SamsungKnoxService {
    if (!SamsungKnoxService.instance) {
      SamsungKnoxService.instance = new SamsungKnoxService(region, clientId, clientSecret);
    }
    return SamsungKnoxService.instance;
  }

  /**
   * Get a Knox token. This token is used to authenticate requests to the Knox API.
   * Token renews every 900 seconds (15 minutes).
   * @returns Knox token
   */
  public async getKnoxToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.tokenExpiry && now < this.tokenExpiry) {
      return this.token;
    }

    const apiUrl = `https://${this.region}.manage.samsungknox.com/emm/oauth/token`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId ?? "",
        client_secret: this.clientSecret ?? ""
      })
    });

    if (!response.ok) {
      throw new Error("Failed to get Knox token");
    }

    const data = (await response.json()) as { access_token: string };

    if (!data.access_token) {
      throw new Error("Failed to get Knox token");
    }

    this.token = data.access_token;
    this.tokenExpiry = now + 900;

    return this.token;
  }

  public async applyFeature(
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

    const apiUrl = `https://${this.region}.manage.samsungknox.com/emm/oapi/group/insertGroupUnits`;

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

  public async removeFeature(
    groupId: string,
    imei: string = "",
    applyProfile: boolean = true
  ): Promise<Record<string, any> | null> {
    const apiUrl = `https://${this.region}.manage.samsungknox.com/emm/oapi/group/deleteGroupUnits`;

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

  public async selectGroups(): Promise<Record<string, any> | null> {
    const apiUrl = `https://${this.region}.manage.samsungknox.com/emm/oapi/group/selectGroups`;

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

  public async getListOfFeatures(): Promise<Record<string, string>> {
    const groups = await this.selectGroups();
    const simpleGroups: Record<string, string> = {};

    if (groups?.resultValue?.groups) {
      for (const group of groups.resultValue.groups) {
        simpleGroups[group.groupName] = group.groupId;
      }
    }

    return simpleGroups;
  }

  public async getGroupsForDevice(imei: string): Promise<string[]> {
    const apiUrl = `https://${this.region}.manage.samsungknox.com/emm/oapi/device/selectDeviceInfoByImei`;

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
}
