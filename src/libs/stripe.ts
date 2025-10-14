import Stripe from "stripe";
import { STRIPE_SECRET_KEY, GIGS_API_KEY } from "astro:env/server";
import { type SubscriptionList, type DeviceList, type Subscription } from "./types";

export const stripe = new Stripe(
  STRIPE_SECRET_KEY, // Use environment variable for both prod and dev
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
  try {
    if (imei && (await validateSubscription("stripe", { imei }))) {
      return true;
    }

    return await validateSubscription("gigs", { imei, phoneNumber });
  } catch (err: any) {
    console.error(err);
    // We will fail on the side of trust that the user is subscribed.
    return true;
  }
}
