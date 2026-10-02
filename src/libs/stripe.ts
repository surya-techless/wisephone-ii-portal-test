import Stripe from "stripe";
import { STRIPE_SECRET_KEY, GIGS_API_KEY, SUBSCRIPTION_ENFORCEMENT_MODE } from "astro:env/server";
import { db, BypassTechlessSubscription, DeviceSubscriptionStatus, eq, and } from "astro:db";
import { type SubscriptionList, type DeviceList, type Subscription } from "./types";
import { normalizeImei, stripeSubscriptionMatchesImei, gigsSubscriptionMatchesDevice } from "./subscription-matching";
import { devLog } from "./utils";
import { publishSubscriptionStatus } from "./mqtt";

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
/**
 * Does this IMEI have an active subscription anywhere — on Stripe (a
 * subscription stamped with the IMEI, or, for older records, any subscription
 * of a customer stamped with it) or on Gigs (a subscription whose SIM is in
 * this phone)? Returns the provider, or null if none. Throws when Stripe or Gigs
 * can't be checked, so callers can tell "none" apart from "unknown".
 *
 * The webhook handlers call this before acting on a "not active" event: a
 * device whose plan is on Gigs mustn't be marked unsubscribed (and kicked out)
 * because a stray Stripe plan was cancelled, and vice versa.
 */
export async function findActiveSubscriptionForImei(imei: string): Promise<"Stripe" | "Gigs" | null> {
  const normalized = normalizeImei(imei);
  if (!normalized) return null;

  // Stripe search can't mix AND/OR, so search by IMEI and filter the status here.
  const stripeSubs = await stripe.subscriptions.search({ query: `metadata['imei']:'${normalized}'`, limit: 50 });
  if (
    stripeSubs.data.some(
      (sub) => (sub.status === "active" || sub.status === "trialing") && stripeSubscriptionMatchesImei(sub.metadata, normalized)
    )
  ) {
    return "Stripe";
  }

  const customers = await stripe.customers.search({ query: `metadata['imei']:'${normalized}'`, limit: 10 });
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 20 });
    if (subs.data.some((sub) => sub.status === "active" || sub.status === "trialing")) {
      return "Stripe";
    }
  }

  if (await hasGigsSubscriptionOnDevice(normalized)) {
    return "Gigs";
  }
  return null;
}

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
 *      A "Not Active" row is re-checked live (findActiveSubscriptionForImei)
 *      at most once per RECHECK_INACTIVE_AFTER_MS per device: if Stripe or Gigs
 *      has an active plan, the row is set Active and the device gets an MQTT
 *      push. A row can be wrong — e.g. a Stripe "incomplete" event saved during
 *      the 2026-10-01 incident — and webhooks alone never correct it. If the
 *      re-check fails, the row's answer stands.
 *   3. no row yet → live validateIsSubscribed(), and save the result as a row.
 *   4. live check failed (Stripe 429, Gigs error) → THROWS. Callers must treat
 *      that as "unknown" (the device API returns 503 so wiseOS keeps its last
 *      known status) — never as "not subscribed". Errors are never saved.
 */
// How often a "Not Active" row may be re-checked live against Stripe/Gigs, per
// device. Keeps the ~3,900 unsubscribed phones (each checks on every back press
// / resume) well under Stripe Search's rate limit.
const RECHECK_INACTIVE_AFTER_MS = 15 * 60 * 1000;

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

  if (cached?.hasActiveSubscription) {
    return {
      isSubscribed: true,
      source: "stripe_or_gigs",
      checkedAt: new Date(cached.updatedAt).toISOString(),
      subscriptionType: cached.subscriptionType as "Stripe" | "Gigs" | undefined
    };
  }

  if (cached) {
    const isDueForRecheck = Date.now() - new Date(cached.updatedAt).getTime() >= RECHECK_INACTIVE_AFTER_MS;
    if (isDueForRecheck) {
      try {
        const provider = await findActiveSubscriptionForImei(normalized);
        const checkedAt = new Date();
        if (provider) {
          // Only flip a row that's still "Not Active" — a webhook may have just written it.
          await db
            .update(DeviceSubscriptionStatus)
            .set({
              subscriptionType: provider,
              hasActiveSubscription: 1,
              subscriptionStatus: "Active",
              rawStatus: `active (${provider})`,
              lastEventType: "live-recheck",
              canceledAt: null,
              scheduledEndAt: null,
              endedAt: null,
              updatedAt: checkedAt
            })
            .where(and(eq(DeviceSubscriptionStatus.imei, normalized), eq(DeviceSubscriptionStatus.hasActiveSubscription, 0)));
          console.log(`[subscription] IMEI ${normalized} saved as Not Active but has an active ${provider} plan — set Active`);
          await publishSubscriptionStatus(normalized, true, provider);
          return { isSubscribed: true, source: "stripe_or_gigs", checkedAt: checkedAt.toISOString(), subscriptionType: provider };
        }
        // Confirmed still not active — record when, so the next re-check waits.
        await db
          .update(DeviceSubscriptionStatus)
          .set({ updatedAt: checkedAt })
          .where(and(eq(DeviceSubscriptionStatus.imei, normalized), eq(DeviceSubscriptionStatus.hasActiveSubscription, 0)));
        return { isSubscribed: false, source: "none", checkedAt: checkedAt.toISOString(), subscriptionType: cached.subscriptionType as "Stripe" | "Gigs" | undefined };
      } catch (error) {
        console.error(`[subscription] Live re-check failed for IMEI ${normalized}; answering from the saved row:`, error);
      }
    }
    return {
      isSubscribed: false,
      source: "none",
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
