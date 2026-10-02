import type { APIRoute } from "astro";
import { db, WebhookEvent, DeviceSubscriptionStatus } from "astro:db";
import { GIGS_API_KEY, GIGS_WEBHOOK_SECRET } from "astro:env/server";
import { Webhook } from "svix";
import { GIGS_ACTIVE_STATUSES, gigsDeviceHasSubscriptionSim, gigsSubscriptionMatchesDevice, normalizeImei, logSubscriptionWebhookEvent, moveDeviceToKickoutGroup, removeDeviceFromKickoutGroup, subscriptionDatesFromGigs } from "@/libs/subscription-matching";
import type { Device, DeviceList, Subscription, SubscriptionList } from "@/libs/types";
import { publishSubscriptionStatus } from "@/libs/mqtt";
import { isBypassImei, findActiveSubscriptionForImei } from "@/libs/stripe";
import { devLog } from "@/libs/utils";

const GIGS_BASE_URL = "https://api.gigs.com/projects/techless";

type GigsWebhookPayload = { type?: string; data?: Subscription } | Subscription;

/**
 * POST /api/webhooks/gigs
 *
 * Receives Gigs webhook events so subscription cancellations/status changes
 * reach the portal the moment they happen, instead of waiting for someone to
 * open the dashboard/manage page (today the only thing that calls
 * validateIsSubscribed() — see src/libs/stripe.ts, the "gigs" branch of
 * validateSubscription()).
 *
 * Configure this in Gigs' dashboard/API once confirmed against their actual
 * webhook docs, pointed at this URL, subscribed to subscription status
 * changes (canceled/inactive).
 *
 * Auth: Gigs delivers webhooks through Svix, so requests carry svix-id,
 * svix-timestamp and svix-signature headers (no Authorization header).
 * GIGS_WEBHOOK_SECRET must be the endpoint's Signing Secret (whsec_...) from
 * the Gigs/Svix dashboard.
 *
 * Events are logged (server-side) and recorded in the WebhookEvent table, so
 * the dashboard can poll /api/webhooks/recent.json and show them without
 * tailing server logs. Deciding what the portal should more actively do with
 * an ended subscription is a separate decision, deliberately not wired up
 * here yet.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!GIGS_WEBHOOK_SECRET) {
    console.error("[gigs webhook] GIGS_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Signature verification needs the raw, unparsed body — do not JSON-parse first.
  const rawBody = await request.text();

  try {
    new Webhook(GIGS_WEBHOOK_SECRET).verify(rawBody, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? ""
    });
  } catch (err) {
    devLog.error("[gigs webhook] signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  let payload: GigsWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    devLog.error("[gigs webhook] failed to parse request body:", err);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Device events are the moment Gigs links a SIM to a phone (IMEI). A new
  // plan's subscription events often arrive before that link exists, so they
  // can't find the phone and are skipped — this catches it up.
  const envelope = payload as { type?: string; data?: { object?: string }; previousData?: Record<string, unknown> };
  if (typeof envelope.type === "string" && envelope.type.startsWith("com.gigs.device.")) {
    await handleDeviceEvent(envelope.type, envelope.data as Device | undefined, envelope.previousData);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Gigs may send the subscription directly, or wrapped in an event envelope
  // (mirroring Stripe's { type, data: { object } } shape) — accept either
  // until Gigs' real webhook payload shape is confirmed.
  const subscription: Subscription | undefined =
    "object" in payload && payload.object === "subscription" ? (payload as Subscription) : (payload as { data?: Subscription }).data;

  if (!subscription) {
    console.error("[gigs webhook] payload did not contain a subscription object, skipping");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const isActive = (GIGS_ACTIVE_STATUSES as readonly string[]).includes(subscription.status);

  // Strict path: IMEI on the subscription's own metadata, if Gigs passes it through.
  let imei = normalizeImei(String(subscription.metadata?.imei ?? ""));

  // Fallback: a Gigs subscription doesn't carry a device/IMEI field directly,
  // so resolve it via GET /devices filtered by the subscription's user (and
  // sim, to narrow it server-side when a user has more than one device).
  // Note: POST /devices/search only accepts an "imei" filter — it can't be
  // used to look a device up by user, which is why this uses the list
  // endpoint instead.
  if (!imei && subscription.user?.id) {
    try {
      const devicesApiUrl = new URL(`${GIGS_BASE_URL}/devices`);
      devicesApiUrl.searchParams.set("user", subscription.user.id);
      if (subscription.sim?.id) {
        devicesApiUrl.searchParams.set("sim", subscription.sim.id);
      }

      const deviceResponse = await fetch(devicesApiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${GIGS_API_KEY}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(15000)
      });

      if (deviceResponse.ok) {
        const devices = (await deviceResponse.json()) as DeviceList;
        // Only the device holding this subscription's SIM — never another phone on
        // the same account. Status is ignored here: an "ended" event still needs
        // to find its phone. No match → no IMEI → event is logged and skipped.
        const device: Device | undefined = devices.items?.find((d) => gigsDeviceHasSubscriptionSim(subscription, d));
        imei = normalizeImei(String(device?.imei ?? ""));
      } else {
        console.error(`[gigs webhook] devices lookup by user failed with status ${deviceResponse.status}`);
      }
    } catch (err) {
      console.error("[gigs webhook] failed to resolve device for IMEI fallback:", err);
    }
  }

  // If Gigs sent an event envelope (e.g. "com.gigs.subscription.canceled"), use its
  // type for the log; otherwise fall back to a label derived from the subscription status.
  const eventType =
    typeof (payload as { type?: string }).type === "string"
      ? (payload as { type: string }).type
      : `subscription.${subscription.status}`;

  if (!imei) {
    console.error(
      `[gigs webhook] ${eventType} — subscription ${subscription.id} (status: ${subscription.status}) — no IMEI resolved, skipping`
    );
  } else {
    console.log(
      `[gigs webhook] ${eventType} | IMEI: ${imei} | subscription: ${subscription.id} | status: ${subscription.status} | isActive: ${isActive}`
    );
    logSubscriptionWebhookEvent({ provider: "Gigs", isActive, imei });
  }

  await db.insert(WebhookEvent).values({
    source: "gigs",
    type: eventType,
    imei: imei || undefined,
    status: subscription.status,
    isActive: isActive ? 1 : 0
  });

  // Bypass devices count as subscribed regardless of Gigs — keep the event
  // for history, but never kick them out, push "not subscribed", or overwrite
  // their status row.
  if (imei && (await isBypassImei(imei))) {
    console.log(`[gigs webhook] IMEI ${imei} is in BypassTechlessSubscription — skipping status update, MQTT push and Kickout`);
  } else if (imei) {
    const dates = subscriptionDatesFromGigs(subscription);

    // "Not active" for THIS subscription doesn't mean the device is
    // unsubscribed: it may have another active Gigs line on this phone, or a
    // Stripe plan. Check before marking it unsubscribed or kicking it out.
    let effective: { isActive: boolean; type: "Stripe" | "Gigs"; rawStatus: string; dates: typeof dates } | null = {
      isActive,
      type: "Gigs",
      rawStatus: subscription.status,
      dates
    };
    if (!isActive) {
      try {
        const other = await findActiveSubscriptionForImei(imei);
        if (other) {
          console.log(`[gigs webhook] IMEI ${imei} still has an active ${other} subscription — keeping it active`);
          effective = { isActive: true, type: other, rawStatus: `active (${other})`, dates: { canceledAt: null, scheduledEndAt: null, endedAt: null } };
        }
      } catch (err) {
        // Can't tell whether the device is still subscribed — leave its status,
        // phone and Knox groups as they are rather than risk locking a paying customer.
        console.error(`[gigs webhook] Couldn't check other subscriptions for IMEI ${imei}; leaving it unchanged:`, err);
        effective = null;
      }
    }

    if (effective) {
      await db
        .insert(DeviceSubscriptionStatus)
        .values({
          imei,
          subscriptionType: effective.type,
          hasActiveSubscription: effective.isActive ? 1 : 0,
          subscriptionStatus: effective.isActive ? "Active" : "Not Active",
          rawStatus: effective.rawStatus,
          lastEventType: eventType,
          ...effective.dates,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: DeviceSubscriptionStatus.imei,
          set: {
            subscriptionType: effective.type,
            hasActiveSubscription: effective.isActive ? 1 : 0,
            subscriptionStatus: effective.isActive ? "Active" : "Not Active",
            rawStatus: effective.rawStatus,
            lastEventType: eventType,
            ...effective.dates,
            updatedAt: new Date()
          }
        });
      await publishSubscriptionStatus(imei, effective.isActive, effective.type);
      if (!effective.isActive) {
        await moveDeviceToKickoutGroup(imei);
      } else {
        await removeDeviceFromKickoutGroup(imei);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

/**
 * com.gigs.device.created / .updated: data is the Device (imei + sims + user).
 * If one of its SIMs carries an active/pending subscription, mark the phone
 * subscribed, push it over MQTT and lift Kickout — the same as an active
 * subscription event. Never marks a phone unsubscribed: a device event only
 * says the phone was seen, not that a plan ended (subscription events handle
 * that). An update that didn't change the phone's SIMs or IMEI is ignored.
 */
async function handleDeviceEvent(eventType: string, device: Device | undefined, previousData?: Record<string, unknown>) {
  const imei = normalizeImei(String(device?.imei ?? ""));
  const simIds = (device?.sims ?? []).map((sim) => sim.id).filter(Boolean);
  const userId = typeof device?.user === "string" ? (device.user as string) : device?.user?.id;

  const record = (status: string, isActive: boolean) =>
    db.insert(WebhookEvent).values({ source: "gigs", type: eventType, imei: imei || undefined, status, isActive: isActive ? 1 : 0 });

  if (eventType === "com.gigs.device.deleted") {
    await record("deleted", false);
    return;
  }
  if (eventType === "com.gigs.device.updated" && previousData && !("sims" in previousData) && !("imei" in previousData)) {
    return; // nothing that links a plan to this phone changed
  }
  if (!device || !imei || simIds.length === 0 || !userId) {
    console.log(`[gigs webhook] ${eventType} — device ${device?.id ?? "?"} has no IMEI, SIM or user yet, skipping`);
    await record("no_sim_link", false);
    return;
  }

  let match: Subscription | undefined;
  try {
    let after: string | null = null;
    do {
      const url = new URL(`${GIGS_BASE_URL}/subscriptions`);
      url.searchParams.set("user", userId);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${GIGS_API_KEY}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`subscriptions lookup failed with status ${response.status}`);
      const page = (await response.json()) as SubscriptionList;
      match = page.items?.find((sub) => gigsSubscriptionMatchesDevice(sub, device));
      after = match ? null : page.moreItemsAfter;
    } while (after);
  } catch (err) {
    console.error(`[gigs webhook] ${eventType} — couldn't load subscriptions for IMEI ${imei}; leaving it unchanged:`, err);
    await record("lookup_failed", false);
    return;
  }

  if (!match) {
    console.log(`[gigs webhook] ${eventType} | IMEI: ${imei} — no active Gigs subscription on this phone's SIMs, leaving it unchanged`);
    await record("no_active_subscription", false);
    return;
  }

  console.log(`[gigs webhook] ${eventType} | IMEI: ${imei} | subscription: ${match.id} | status: ${match.status} — marking subscribed`);
  logSubscriptionWebhookEvent({ provider: "Gigs", isActive: true, imei });
  await record(match.status, true);

  if (await isBypassImei(imei)) {
    console.log(`[gigs webhook] IMEI ${imei} is in BypassTechlessSubscription — skipping status update, MQTT push and Kickout`);
    return;
  }

  const dates = subscriptionDatesFromGigs(match);
  const row = {
    subscriptionType: "Gigs",
    hasActiveSubscription: 1,
    subscriptionStatus: "Active",
    rawStatus: match.status,
    lastEventType: eventType,
    ...dates,
    updatedAt: new Date()
  };
  await db
    .insert(DeviceSubscriptionStatus)
    .values({ imei, ...row })
    .onConflictDoUpdate({ target: DeviceSubscriptionStatus.imei, set: row });
  await publishSubscriptionStatus(imei, true, "Gigs");
  await removeDeviceFromKickoutGroup(imei);
}

export const ALL: APIRoute = ({ request }) => {
  return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};
