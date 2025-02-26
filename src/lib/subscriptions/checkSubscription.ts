/**
 * Utility to check if a device has an active Techless subscription or bypass
 */

/**
 * Response type for subscription check
 */
export interface SubscriptionCheckResult {
  status: "subscribed" | "not-subscribed";
  message: string;
  bypassApplied?: boolean;
}

/**
 * Check if a device has an active subscription or bypass
 * @param phoneNumber The phone number associated with the subscription
 * @param imei The device IMEI
 * @returns Promise with subscription check result
 */
export async function checkSubscription(phoneNumber: string, imei: string): Promise<SubscriptionCheckResult> {
  try {
    // Format phone number to remove dashes
    const formattedPhone = phoneNumber.replace(/[^0-9+]/g, "");

    // Create the subscription check URL
    const subscribedUrl = new URL("/webhook-is-user-subscribed", "https://cameronpak-wisephoneii.web.val.run");
    subscribedUrl.searchParams.set("phoneNumber", formattedPhone);
    subscribedUrl.searchParams.set("imei", imei);

    // Fetch the subscription status
    const result = await fetch(subscribedUrl, { method: "GET" });

    if (!result.ok) {
      throw new Error(`Failed to check subscription: ${result.status} ${result.statusText}`);
    }

    const responseText = await result.text();

    // Check for bypass or subscription in the response
    const isBypassed = responseText.includes("bypass");
    const isSubscribed = responseText.includes("is subscribed");

    if (isBypassed || isSubscribed) {
      return {
        status: "subscribed",
        message: "Active subscription found",
        bypassApplied: isBypassed
      };
    } else {
      // Call the bypass endpoint
      const bypassUrl = new URL(`/api/wisephones/${imei}/bypass`, "https://cameronpak-wisephoneii.web.val.run");
      const bypassResult = await fetch(bypassUrl, { method: "GET" });
      const bypassData = await bypassResult.json();
      const bypass = bypassData.bypass;

      console.log("bypass", bypass);

      if (bypass) {
        return {
          status: "subscribed",
          message: "Bypass applied",
          bypassApplied: true
        };
      }
    }

    return {
      status: "not-subscribed",
      message: "No active subscription found for that IMEI and phone number combination"
    };
  } catch (error) {
    // Re-throw the error to be handled by the caller
    throw error instanceof Error ? error : new Error("Failed to check subscription. Please try again.");
  }
}
