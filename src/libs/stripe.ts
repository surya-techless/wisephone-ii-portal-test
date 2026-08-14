import Stripe from "stripe";
import { STRIPE_SECRET_KEY, GIGS_API_KEY, SUBSCRIPTION_ENFORCEMENT_MODE } from "astro:env/server";
import { type SubscriptionList, type DeviceList, type Subscription } from "./types";
import { normalizeImei, stripeSubscriptionMatchesImei, gigsSubscriptionMatchesDevice } from "./subscription-matching";
import { devLog } from "./utils";

export const stripe = new Stripe(import.meta.env.PROD ? STRIPE_SECRET_KEY : STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  typescript: true
});

const API_CONFIG = {
  gigs: {
    baseUrl: "https://api.gigs.com/projects/techless",
    apiKey: GIGS_API_KEY
  }
};

export async function validateSubscriptionLegacy(
  provider: "stripe" | "gigs",
  params: { imei?: string; phoneNumber?: string }
): Promise<boolean> {
  devLog.log("PAY DEBUG: [L1] validateSubscription function called");
  devLog.log("PAY DEBUG: [L1.1] provider:", provider);
  devLog.log("PAY DEBUG: [L1.2] params:", params);

  const { imei, phoneNumber } = params;

  if (provider === "stripe" && imei) {
    devLog.log("PAY DEBUG: [L1.3] Searching Stripe customers by IMEI metadata");
    devLog.log("PAY DEBUG: [L1.4] Search query:", `metadata['imei']:'${imei}'`);

    const customers = await stripe.customers.search({
      query: `metadata['imei']:'${imei}'`
    });

    devLog.log("PAY DEBUG: [L1.5] Stripe customer search result - found:", customers.data.length, "customers");

    if (!customers.data.length) {
      devLog.log("PAY DEBUG: [L1.6] No customers found with IMEI metadata, returning false");
      return false;
    }

    // For each customer, because sometimes there are dupilicates,
    // we need to check if the customer has an active subscription
    devLog.log("PAY DEBUG: [L1.7] Checking subscriptions for", customers.data.length, "customers");
    for (const customer of customers.data) {
      devLog.log("PAY DEBUG: [L1.8] Checking customer:", customer.id);
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "active"
      });

      devLog.log("PAY DEBUG: [L1.9] Customer", customer.id, "has", subscriptions.data.length, "active subscriptions");
      if (subscriptions.data.length > 0) {
        devLog.log("PAY DEBUG: [L1.10] Found active subscription, returning true");
        return true;
      }
    }

    devLog.log("PAY DEBUG: [L1.11] No active subscriptions found for any customer, returning false");
    return false;
  }

  if (provider === "gigs") {
    let isSubscribed = false;

    if (phoneNumber) {
      const apiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/subscriptions/search`);
      let phoneNumberFormatted = phoneNumber;
      if (!phoneNumber.startsWith("+1")) {
        phoneNumberFormatted = `+1${phoneNumber}`;
      }

      const subscriptionResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
          Accept: "application/json"
        },
        body: JSON.stringify({ phoneNumber: phoneNumberFormatted })
      });

      const subscriptions = (await subscriptionResponse.json()) as SubscriptionList;
      devLog.log(subscriptions);
      isSubscribed = subscriptions?.items?.some((sub) => ["active", "pending"].includes(sub.status));
    }

    if (imei && !isSubscribed) {
      const devicesApiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/devices/search`);
      const deviceResponse = await fetch(devicesApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
          Accept: "application/json"
        },
        body: JSON.stringify({ imei })
      });

      const devices = (await deviceResponse.json()) as DeviceList;
      const userId = devices.items?.[0]?.user?.id;

      if (!userId) {
        isSubscribed = false;
        return isSubscribed;
      }

      const apiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/subscriptions`);
      apiUrl.searchParams.set("user", userId);

      const subscriptionsResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
          Accept: "application/json"
        }
      });

      const subscriptions = (await subscriptionsResponse.json()) as { items: Subscription[] };
      isSubscribed = Boolean(subscriptions?.items?.length > 0 || false);
    }

    return isSubscribed;
  }

  return false;
}

async function validateIsSubscribedLegacy({
  imei,
  phoneNumber
}: {
  imei: string;
  phoneNumber: string;
}): Promise<boolean> {
  devLog.log("PAY DEBUG: [L2] validateIsSubscribed function called");
  devLog.log("PAY DEBUG: [L2.1] imei:", imei);
  devLog.log("PAY DEBUG: [L2.2] phoneNumber:", phoneNumber);

  try {
    if (imei) {
      devLog.log("PAY DEBUG: [L2.3] Checking Stripe subscription first by IMEI");
      const stripeResult = await validateSubscriptionLegacy("stripe", { imei });
      devLog.log("PAY DEBUG: [L2.4] Stripe subscription check result:", stripeResult);

      if (stripeResult) {
        devLog.log("PAY DEBUG: [L2.5] Stripe subscription found, returning true");
        devLog.log(`[Device Details] IMEI: ${imei} | isSubscribed: true | provider: STRIPE`);
        return true;
      }
    }

    devLog.log("PAY DEBUG: [L2.6] Stripe check returned false, checking Gigs subscription");
    const gigsResult = await validateSubscriptionLegacy("gigs", { imei, phoneNumber });
    devLog.log("PAY DEBUG: [L2.7] Gigs subscription check result:", gigsResult);
    devLog.log("PAY DEBUG: [L2.8] Final result:", gigsResult);
    devLog.log(
      `[Device Details] IMEI: ${imei} | isSubscribed: ${gigsResult} | provider: ${gigsResult ? "GIGS" : "NONE (not subscribed)"}`
    );

    return gigsResult;
  } catch (err: any) {
    devLog.error("PAY DEBUG: [L2.9] ERROR validating subscription:", err);
    // Return false on error - device will be assigned to unpaid group
    // This prevents unsubscribed devices from getting subscribed features due to API errors
    return false;
  }
}

async function validateIsSubscribedStrict({ imei }: { imei: string }): Promise<boolean> {
  try {
    devLog.log("PAY DEBUG: [L3] validateIsSubscribedStrict function called");
    devLog.log("PAY DEBUG: [L3.1] imei:", imei);

    const normalized = normalizeImei(imei);
    if (!normalized) {
      devLog.log("PAY DEBUG: [L3.2] Empty normalized IMEI, returning false");
      return false;
    }

    devLog.log("PAY DEBUG: [L3.3] Searching Stripe subscriptions by IMEI metadata");
    devLog.log("PAY DEBUG: [L3.4] Search query:", `metadata['imei']:'${normalized}'`);

    const subs = await stripe.subscriptions.search({
      query: `metadata['imei']:'${normalized}'`
    });

    const stripeHit = subs.data.some(
      (sub) =>
        (sub.status === "active" || sub.status === "trialing") &&
        stripeSubscriptionMatchesImei(sub.metadata, normalized)
    );

    if (stripeHit) {
      devLog.log("PAY DEBUG: [L3.5] Stripe subscription match found, returning true");
      return true;
    }

    devLog.log("PAY DEBUG: [L3.6] No Stripe match, checking Gigs subscription by device");
    const devicesApiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/devices/search`);
    const deviceResponse = await fetch(devicesApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
        Accept: "application/json"
      },
      body: JSON.stringify({ imei })
    });

    const devices = (await deviceResponse.json()) as DeviceList;
    const device = devices.items?.[0];

    if (!device || !device.user?.id) {
      devLog.log("PAY DEBUG: [L3.7] No device or user found, returning false");
      return false;
    }

    const apiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/subscriptions`);
    apiUrl.searchParams.set("user", device.user.id);

    const subscriptionsResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
        Accept: "application/json"
      }
    });

    const subscriptions = (await subscriptionsResponse.json()) as { items: Subscription[] };
    const gigsHit = subscriptions.items?.some((sub) => gigsSubscriptionMatchesDevice(sub, device)) ?? false;

    devLog.log("PAY DEBUG: [L3.8] Gigs subscription check result:", gigsHit);
    return gigsHit;
  } catch (err: any) {
    devLog.error("PAY DEBUG: [L3.9] ERROR validating subscription (strict):", err);
    return false;
  }
}

export async function validateIsSubscribed({
  imei,
  phoneNumber
}: {
  imei: string;
  phoneNumber: string;
}): Promise<boolean> {
  const mode = SUBSCRIPTION_ENFORCEMENT_MODE ?? "shadow";

  if (mode === "legacy") {
    return validateIsSubscribedLegacy({ imei, phoneNumber });
  }

  if (mode === "enforce") {
    return validateIsSubscribedStrict({ imei });
  }

  const legacyResult = await validateIsSubscribedLegacy({ imei, phoneNumber });

  let strictResult = false;
  try {
    strictResult = await validateIsSubscribedStrict({ imei });
  } catch (err: any) {
    devLog.error("PAY DEBUG: [L2.10] ERROR in strict path (shadow mode):", err);
  }

  if (legacyResult !== strictResult) {
    console.info(
      `[SUB-VALIDATION-SHADOW] imei=${normalizeImei(imei)} legacy=${legacyResult} strict=${strictResult} ` +
        `phoneProvided=${Boolean(phoneNumber)}`
    );
  }

  return legacyResult;
}
