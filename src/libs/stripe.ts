import Stripe from "stripe";
import { STRIPE_SECRET_KEY, GIGS_API_KEY, SUBSCRIPTION_ENFORCEMENT_MODE } from "astro:env/server";
import { db, BypassTechlessSubscription, DeviceSubscriptionStatus, eq } from "astro:db";
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

/**
 * Device-level Gigs check: does THIS phone (by IMEI) have an active/pending
 * Gigs subscription? A Gigs subscription belongs to a user (account), not a
 * device — the only link to a phone is its SIM. So a subscription only counts
 * when it's active/pending AND its SIM is one of the SIMs Gigs has recorded in
 * this phone (gigsSubscriptionMatchesDevice). Another phone's line on the same
 * account, or an ended subscription, never counts. Checks every device record
 * Gigs returns for the IMEI. Throws on Gigs API errors.
 */
async function hasGigsSubscriptionOnDevice(imei: string): Promise<boolean> {
  const gigsHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_CONFIG.gigs.apiKey}`,
    Accept: "application/json"
  };

  const deviceResponse = await fetch(new URL(`${API_CONFIG.gigs.baseUrl}/devices/search`), {
    method: "POST",
    headers: gigsHeaders,
    body: JSON.stringify({ imei }),
    signal: AbortSignal.timeout(15000)
  });
  if (!deviceResponse.ok) {
    throw new Error(`Gigs devices/search failed with status ${deviceResponse.status}`);
  }

  const devices = ((await deviceResponse.json()) as DeviceList).items ?? [];
  const userIds = [...new Set(devices.map((device) => device.user?.id).filter(Boolean))] as string[];

  for (const userId of userIds) {
    const apiUrl = new URL(`${API_CONFIG.gigs.baseUrl}/subscriptions`);
    apiUrl.searchParams.set("user", userId);

    const subscriptionsResponse = await fetch(apiUrl, {
      method: "GET",
      headers: gigsHeaders,
      signal: AbortSignal.timeout(15000)
    });
    if (!subscriptionsResponse.ok) {
      throw new Error(`Gigs subscriptions list failed with status ${subscriptionsResponse.status}`);
    }

    const subscriptions = ((await subscriptionsResponse.json()) as { items: Subscription[] }).items ?? [];
    const userDevices = devices.filter((device) => device.user?.id === userId);
    if (userDevices.some((device) => subscriptions.some((sub) => gigsSubscriptionMatchesDevice(sub, device)))) {
      return true;
    }
  }

  return false;
}

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
      // Device-level: only an active/pending subscription on a SIM in this phone counts.
      isSubscribed = await hasGigsSubscriptionOnDevice(normalizeImei(imei));
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

  // A Stripe failure (e.g. Search rate-limited, 429) must not end the check
  // before Gigs is consulted, and must not be reported as "not subscribed" —
  // that used to lock every Gigs customer whenever Stripe Search was throttled.
  let stripeError: unknown = null;
  if (imei) {
    try {
      const stripeResult = await validateSubscriptionLegacy("stripe", { imei });
      devLog.log("PAY DEBUG: [L2.4] Stripe subscription check result:", stripeResult);
      if (stripeResult) {
        devLog.log(`[Device Details] IMEI: ${imei} | isSubscribed: true | provider: STRIPE`);
        return true;
      }
    } catch (err) {
      stripeError = err;
      console.error(`[SUB-VALIDATION] Stripe check failed for imei=${normalizeImei(imei)}, still checking Gigs:`, err);
    }
  }

  // Gigs errors propagate: the caller must treat them as "unknown", not "unsubscribed".
  const gigsResult = await validateSubscriptionLegacy("gigs", { imei, phoneNumber });
  devLog.log(
    `[Device Details] IMEI: ${imei} | isSubscribed: ${gigsResult} | provider: ${gigsResult ? "GIGS" : "NONE (not subscribed)"}`
  );
  if (gigsResult) {
    return true;
  }

  // Not on Gigs, and Stripe couldn't be checked — the answer is unknown.
  if (stripeError) {
    throw stripeError;
  }
  return false;
}

async function validateIsSubscribedStrict({ imei }: { imei: string }): Promise<boolean> {
  devLog.log("PAY DEBUG: [L3] validateIsSubscribedStrict function called");
  devLog.log("PAY DEBUG: [L3.1] imei:", imei);

  const normalized = normalizeImei(imei);
  if (!normalized) {
    devLog.log("PAY DEBUG: [L3.2] Empty normalized IMEI, returning false");
    return false;
  }

  devLog.log("PAY DEBUG: [L3.3] Searching Stripe subscriptions by IMEI metadata");
  devLog.log("PAY DEBUG: [L3.4] Search query:", `metadata['imei']:'${normalized}'`);

  const [activeSearch, trialingSearch] = await Promise.all([
    stripe.subscriptions.search({
      query: `metadata['imei']:'${normalized}' AND status:'active'`
    }),
    stripe.subscriptions.search({
      query: `metadata['imei']:'${normalized}' AND status:'trialing'`
    })
  ]);

  const stripeHit = [...activeSearch.data, ...trialingSearch.data].some((sub) =>
    stripeSubscriptionMatchesImei(sub.metadata, normalized)
  );

  if (stripeHit) {
    devLog.log("PAY DEBUG: [L3.5] Stripe subscription match found, returning true");
    return true;
  }

  devLog.log("PAY DEBUG: [L3.6] No Stripe match, checking Gigs subscription by device");
  const gigsHit = await hasGigsSubscriptionOnDevice(normalized);

  devLog.log("PAY DEBUG: [L3.8] Gigs subscription check result:", gigsHit);
  return gigsHit;
}

function logStrictValidationError(imei: string, err: unknown): void {
  const normalized = normalizeImei(imei);
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[SUB-VALIDATION-STRICT-ERROR] imei=${normalized} error=${message}`);
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
    try {
      return await validateIsSubscribedStrict({ imei });
    } catch (err) {
      logStrictValidationError(imei, err);
      throw err;
    }
  }

  const [legacyResult, strictResult] = await Promise.all([
    validateIsSubscribedLegacy({ imei, phoneNumber }),
    validateIsSubscribedStrict({ imei }).catch((err) => {
      logStrictValidationError(imei, err);
      return false;
    })
  ]);

  if (legacyResult !== strictResult) {
    console.info(
      `[SUB-VALIDATION-SHADOW] imei=${normalizeImei(imei)} legacy=${legacyResult} strict=${strictResult} ` +
        `phoneProvided=${Boolean(phoneNumber)}`
    );
  }

  return legacyResult;
}

export interface DeviceSubscriptionCheckResult {
  isSubscribed: boolean;
  source: "bypass" | "stripe_or_gigs" | "none";
  checkedAt: string;
  // Which provider this came from, when known — populated for bypass and for
  // a cached row (webhooks record their own provider), left undefined for a
  // fresh live-check fallback with no provenance. Used by callers that need
  // to pass a subscriptionType to publishSubscriptionStatus().
  subscriptionType?: "Stripe" | "Gigs" | "Bypass";
}

/**
 * True when an admin has added this IMEI to BypassTechlessSubscription — the
 * device counts as subscribed no matter what Stripe/Gigs say. The webhook
 * handlers use this to leave bypass devices alone (no Kickout, no
 * "not subscribed" MQTT push, no status overwrite).
 */
export async function isBypassImei(imei: string): Promise<boolean> {
  const normalized = normalizeImei(imei);
  if (!normalized) return false;
  const bypass = await db
    .select()
    .from(BypassTechlessSubscription)
    .where(eq(BypassTechlessSubscription.imei, Number(normalized)))
    .limit(1)
    .get();
  return Boolean(bypass);
}

/**
 * Single shared "is this device subscribed" resolver — replaces the bypass +
 * validateIsSubscribed() pattern that used to be duplicated across
 * /api/device-subscription/[imei].json, manage/[imei].astro, and the
 * validateIsUserSubscribed action.
 *
 * Order, for every IMEI:
 *   1. bypass list → subscribed (no API calls)
 *   2. DeviceSubscriptionStatus row → answer from the row (no API calls).
 *      Rows come from the backfill and are kept current by the Stripe/Gigs
 *      webhooks, so this answers almost every check without touching Stripe
 *      Search (which is rate-limited to ~20 req/s per account).
 *   3. no row yet → live validateIsSubscribed(), and save the result as a row.
 *   4. live check failed (Stripe 429, Gigs error) → THROWS. Callers must treat
 *      that as "unknown" (the device API returns 503 so wiseOS keeps its last
 *      known status) — never as "not subscribed". Errors are never saved.
 */
export async function resolveDeviceSubscriptionStatus({
  imei,
  phoneNumber
}: {
  imei: string;
  phoneNumber: string;
}): Promise<DeviceSubscriptionCheckResult> {
  const normalized = normalizeImei(imei);

  if (await isBypassImei(normalized)) {
    return { isSubscribed: true, source: "bypass", checkedAt: new Date().toISOString(), subscriptionType: "Bypass" };
  }

  const cached = await db
    .select()
    .from(DeviceSubscriptionStatus)
    .where(eq(DeviceSubscriptionStatus.imei, normalized))
    .limit(1)
    .get();

  if (cached) {
    return {
      isSubscribed: Boolean(cached.hasActiveSubscription),
      source: cached.hasActiveSubscription ? "stripe_or_gigs" : "none",
      checkedAt: new Date(cached.updatedAt).toISOString(),
      subscriptionType: cached.subscriptionType as "Stripe" | "Gigs" | undefined
    };
  }

  // No row yet — a device the backfill and webhooks haven't covered. Fall
  // back to a live check and save the result so it isn't repeated. If the
  // live check throws, nothing is saved and the error reaches the caller.
  const isSubscribed = await validateIsSubscribed({ imei: normalized, phoneNumber });
  const checkedAt = new Date();

  await db
    .insert(DeviceSubscriptionStatus)
    .values({
      imei: normalized,
      hasActiveSubscription: isSubscribed ? 1 : 0,
      subscriptionStatus: isSubscribed ? "Active" : "Not Active",
      updatedAt: checkedAt
    })
    .onConflictDoUpdate({
      target: DeviceSubscriptionStatus.imei,
      set: {
        hasActiveSubscription: isSubscribed ? 1 : 0,
        subscriptionStatus: isSubscribed ? "Active" : "Not Active",
        updatedAt: checkedAt
      }
    });

  return {
    isSubscribed,
    source: isSubscribed ? "stripe_or_gigs" : "none",
    checkedAt: checkedAt.toISOString()
  };
}
