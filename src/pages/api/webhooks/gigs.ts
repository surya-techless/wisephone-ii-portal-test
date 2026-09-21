import type { APIRoute } from "astro";
import { db, WebhookEvent } from "astro:db";
import { GIGS_API_KEY, GIGS_WEBHOOK_SECRET } from "astro:env/server";
import { Webhook } from "svix";
import { GIGS_ACTIVE_STATUSES, normalizeImei } from "@/libs/subscription-matching";
import type { Device, DeviceList, Subscription } from "@/libs/types";
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

  // Fallback: resolve the device (and its IMEI) via the same /devices/search
  // endpoint already used elsewhere in this codebase — just filtering by user
  // instead of by imei. Confirm against Gigs' API docs that "user" is a valid
  // filter key before relying on this in production.
  if (!imei && subscription.user?.id) {
    try {
      const devicesApiUrl = new URL(`${GIGS_BASE_URL}/devices/search`);
      const deviceResponse = await fetch(devicesApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GIGS_API_KEY}`,
          Accept: "application/json"
        },
        body: JSON.stringify({ user: subscription.user.id }),
        signal: AbortSignal.timeout(15000)
      });

      if (deviceResponse.ok) {
        const devices = (await deviceResponse.json()) as DeviceList;
        // Prefer the device whose SIM matches this subscription, in case a user has more than one.
        const device: Device | undefined =
          devices.items?.find((d) => d.sims?.some((sim) => sim.id === subscription.sim?.id)) ?? devices.items?.[0];
        imei = normalizeImei(String(device?.imei ?? ""));
      } else {
        devLog.error(`[gigs webhook] devices/search failed with status ${deviceResponse.status}`);
      }
    } catch (err) {
      devLog.error("[gigs webhook] failed to resolve device for IMEI fallback:", err);
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
  }

  await db.insert(WebhookEvent).values({
    source: "gigs",
    type: eventType,
    imei: imei || undefined,
    status: subscription.status,
    isActive: isActive ? 1 : 0
  });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const ALL: APIRoute = ({ request }) => {
  return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};
