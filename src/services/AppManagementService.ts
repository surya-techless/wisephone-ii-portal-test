export class AppManagementService {
  async installApp(imei: string, packageName: string): Promise<void> {
    const url = new URL(`/api/samsung-knox.json`, window.location.origin);
    url.searchParams.set("action", "install-app");
    url.searchParams.set("imei", imei);
    url.searchParams.set("appPackage", packageName);

    const response = await fetch(url, { method: "POST" });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        const text = await response.text();
        errorData = { error: text || "Failed to install app" };
      }
      throw new Error(errorData.error || "Failed to install app");
    }
  }

  async uninstallApp(imei: string, packageName: string): Promise<void> {
    const url = new URL(`/api/samsung-knox.json`, window.location.origin);
    url.searchParams.set("action", "uninstall-app");
    url.searchParams.set("imei", imei);
    url.searchParams.set("appPackage", packageName);

    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to uninstall app");
    }
  }
}
