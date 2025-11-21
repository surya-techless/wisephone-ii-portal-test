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

  if (provider === "stripe" && imei) {
    const customers = await stripe.customers.search({
      query: `metadata['imei']:'${imei}'`
    });

    if (!customers.data.length) {
      return false;
    }

    // For each customer, because sometimes there are dupilicates,
    // we need to check if the customer has an active subscription
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "active"
      });

      if (subscriptions.data.length > 0) {
        return true;
      }
    }

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
      console.log(subscriptions);
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

export async function validateIsSubscribed({
  imei,
  phoneNumber
}: {
  imei: string;
  phoneNumber: string;
}): Promise<boolean> {
  console.log(`[Subscription Check] Starting validation for IMEI: ${imei}, Phone: ${phoneNumber}`);

  try {
    // Check Stripe first
    if (imei) {
      console.log(`[Subscription Check] Checking Stripe for IMEI: ${imei}`);
      const stripeResult = await validateSubscription("stripe", { imei });
      console.log(`[Subscription Check] Stripe result for IMEI ${imei}: ${stripeResult}`);
      if (stripeResult) {
        console.log(`[Subscription Check] SUBSCRIBED via Stripe`);
        return true;
      }
    }

    // Check Gigs
    console.log(`[Subscription Check] Checking Gigs for IMEI: ${imei}, Phone: ${phoneNumber}`);
    const gigsResult = await validateSubscription("gigs", { imei, phoneNumber });
    console.log(`[Subscription Check] Gigs result: ${gigsResult}`);

    if (gigsResult) {
      console.log(`[Subscription Check] SUBSCRIBED via Gigs`);
    } else {
      console.log(`[Subscription Check] NOT SUBSCRIBED (no active subscription found in Stripe or Gigs)`);
    }

    return gigsResult;
  } catch (err: any) {
    console.error(`[Subscription Check] ERROR during validation:`, err);
    // BUG FIX: Previously returned true on error, which incorrectly marked devices as subscribed
    // Now we return false on error to be safe - unsubscribed devices shouldn't get premium features
    console.log(`[Subscription Check] Returning FALSE due to error (previously returned true - this was a bug)`);
    return false;
  }
}
