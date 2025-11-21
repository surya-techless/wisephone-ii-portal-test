import Stripe from "stripe";
import { STRIPE_SECRET_KEY, GIGS_API_KEY } from "astro:env/server";
import { type SubscriptionList, type DeviceList, type Subscription } from "./types";

export const stripe = new Stripe(
  import.meta.env.PROD
    ? STRIPE_SECRET_KEY
    : "sk_test_51H2HO9ATGtdZ0VDD6qhj4b11PI5Rt8kWfTrI9Vms2lZmokvaVU3MXRoHTCbmJKdPoKc3lb06Y0xNlIyankVH6Hgz00nQApc96Y",
  {
    apiVersion: "2025-02-24.acacia",
    typescript: true
  }
);

const API_CONFIG = {
  gigs: {
    baseUrl: "https://api.gigs.com/projects/techless",
    apiKey: GIGS_API_KEY
  }
};

export async function validateSubscription(
  provider: "stripe" | "gigs",
  params: { imei?: string; phoneNumber?: string }
): Promise<boolean> {
  const { imei, phoneNumber } = params;
  console.log(`[validateSubscription] Provider: ${provider}, IMEI: ${imei}, Phone: ${phoneNumber}`);

  if (provider === "stripe" && imei) {
    const customers = await stripe.customers.search({
      query: `metadata['imei']:'${imei}'`
    });
    console.log(`[validateSubscription] Stripe customers found: ${customers.data.length}`);

    if (!customers.data.length) {
      console.log(`[validateSubscription] No Stripe customers found for IMEI: ${imei}`);
      return false;
    }

    // For each customer, because sometimes there are dupilicates,
    // we need to check if the customer has an active subscription
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "active"
      });
      console.log(`[validateSubscription] Stripe customer ${customer.id} has ${subscriptions.data.length} active subscriptions`);

      if (subscriptions.data.length > 0) {
        console.log(`[validateSubscription] Stripe: SUBSCRIBED`);
        return true;
      }
    }

    console.log(`[validateSubscription] Stripe: NOT SUBSCRIBED (no active subscriptions found)`);
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
      console.log(`[validateSubscription] Gigs: Searching by phone: ${phoneNumberFormatted}`);

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
      console.log(`[validateSubscription] Gigs phone search result:`, subscriptions);
      isSubscribed = subscriptions?.items?.some((sub) => ["active", "pending"].includes(sub.status));
      console.log(`[validateSubscription] Gigs phone search isSubscribed: ${isSubscribed}`);
    }

    if (imei && !isSubscribed) {
      console.log(`[validateSubscription] Gigs: Searching by IMEI: ${imei}`);
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
      console.log(`[validateSubscription] Gigs IMEI search - userId: ${userId}`);

      if (!userId) {
        console.log(`[validateSubscription] Gigs: No user found for IMEI`);
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
      console.log(`[validateSubscription] Gigs user subscriptions:`, subscriptions);
      isSubscribed = Boolean(subscriptions?.items?.length > 0 || false);
    }

    console.log(`[validateSubscription] Gigs final result: ${isSubscribed ? 'SUBSCRIBED' : 'NOT SUBSCRIBED'}`);
    return isSubscribed;
  }

  console.log(`[validateSubscription] No matching provider, returning false`);
  return false;
}

export async function validateIsSubscribed({
  imei,
  phoneNumber
}: {
  imei: string;
  phoneNumber: string;
}): Promise<boolean> {
  console.log(`[validateIsSubscribed] Starting validation - IMEI: ${imei}, Phone: ${phoneNumber}`);
  try {
    if (imei && (await validateSubscription("stripe", { imei }))) {
      console.log(`[validateIsSubscribed] Result: TRUE (Stripe)`);
      return true;
    }

    const gigsResult = await validateSubscription("gigs", { imei, phoneNumber });
    console.log(`[validateIsSubscribed] Result: ${gigsResult ? 'TRUE' : 'FALSE'} (Gigs)`);
    return gigsResult;
  } catch (err: any) {
    console.error("[validateIsSubscribed] ERROR:", err);
    // Return false on error - device will be assigned to unpaid group
    // This prevents unsubscribed devices from getting subscribed features due to API errors
    return false;
  }
}
