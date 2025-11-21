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
    console.log(`[Stripe] Searching for customers with IMEI metadata: ${imei}`);
    const customers = await stripe.customers.search({
      query: `metadata['imei']:'${imei}'`
    });

    console.log(`[Stripe] Found ${customers.data.length} customers with IMEI ${imei}`);

    if (!customers.data.length) {
      console.log(`[Stripe] No customers found with IMEI ${imei}, returning false`);
      return false;
    }

    // For each customer, because sometimes there are dupilicates,
    // we need to check if the customer has an active subscription
    for (const customer of customers.data) {
      console.log(`[Stripe] Checking subscriptions for customer: ${customer.id} (email: ${customer.email})`);
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "active"
      });

      console.log(`[Stripe] Customer ${customer.id} has ${subscriptions.data.length} active subscriptions`);

      if (subscriptions.data.length > 0) {
        console.log(`[Stripe] Found active subscription for customer ${customer.id}, returning true`);
        return true;
      }
    }

    console.log(`[Stripe] No active subscriptions found for any customer with IMEI ${imei}, returning false`);
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

      console.log(`[Gigs] Searching subscriptions by phone number: ${phoneNumberFormatted}`);
      console.log(`[Gigs] API URL: ${apiUrl.toString()}`);

      const subscriptionResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
          Accept: "application/json"
        },
        body: JSON.stringify({ phoneNumber: phoneNumberFormatted })
      });

      console.log(`[Gigs] Phone search response status: ${subscriptionResponse.status}`);

      const subscriptions = (await subscriptionResponse.json()) as SubscriptionList;
      console.log(`[Gigs] Phone search response:`, JSON.stringify(subscriptions, null, 2));

      if (subscriptions?.items) {
        console.log(`[Gigs] Found ${subscriptions.items.length} subscriptions by phone`);
        subscriptions.items.forEach((sub, index) => {
          console.log(`[Gigs] Subscription ${index + 1}: status=${sub.status}, id=${sub.id}`);
        });
      }

      isSubscribed = subscriptions?.items?.some((sub) => ["active", "pending"].includes(sub.status));
      console.log(`[Gigs] Phone search isSubscribed: ${isSubscribed}`);
    }

    if (imei && !isSubscribed) {
      console.log(`[Gigs] Phone search didn't find subscription, trying IMEI search: ${imei}`);
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

      console.log(`[Gigs] Device search response status: ${deviceResponse.status}`);

      const devices = (await deviceResponse.json()) as DeviceList;
      console.log(`[Gigs] Device search response:`, JSON.stringify(devices, null, 2));

      const userId = devices.items?.[0]?.user?.id;
      console.log(`[Gigs] User ID from device: ${userId || "NOT FOUND"}`);

      if (!userId) {
        console.log(`[Gigs] No user ID found for IMEI ${imei}, returning false`);
        isSubscribed = false;
        return isSubscribed;
      }

      const apiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/subscriptions`);
      apiUrl.searchParams.set("user", userId);

      console.log(`[Gigs] Fetching subscriptions for user: ${userId}`);

      const subscriptionsResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
          Accept: "application/json"
        }
      });

      console.log(`[Gigs] User subscriptions response status: ${subscriptionsResponse.status}`);

      const subscriptions = (await subscriptionsResponse.json()) as { items: Subscription[] };
      console.log(`[Gigs] User subscriptions response:`, JSON.stringify(subscriptions, null, 2));

      isSubscribed = Boolean(subscriptions?.items?.length > 0 || false);
      console.log(`[Gigs] IMEI search isSubscribed: ${isSubscribed}`);
    }

    console.log(`[Gigs] Final result: isSubscribed=${isSubscribed}`);
    return isSubscribed;
  }

  console.log(`[validateSubscription] Unknown provider or missing params, returning false`);
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
