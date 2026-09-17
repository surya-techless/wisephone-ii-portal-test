import type { APIRoute } from "astro";
import { GIGS_API_KEY, GIGS_WEBHOOK_SECRET } from "astro:env/server";
import { GIGS_ACTIVE_STATUSES, normalizeImei } from "@/libs/subscription-matching";
import type { Device, DeviceList, Subscription } from "@/libs/types";
import { devLog } from "@/libs/utils";

const GIGS_BASE_URL = "https://api.gigs.com/projects/techless";

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
 * Auth: Gigs' webhook signing scheme isn't established in this codebase yet
 * (unlike Stripe's signed-header convention). This checks a shared secret in
 * a bearer Authorization header as a reasonable default, matching how this
 * app already authenticates *to* Gigs (see API_CONFIG.gigs in stripe.ts) and
 * how other device-facing endpoints authenticate incoming requests (see
 * /api/device-features). Swap this for Gigs' real signing mechanism once
 * confirmed — do not treat this as verified.
 *
 * This currently only *observes* events (verifies + logs them). Deciding what
 * the portal should actively do with an ended subscription is a separate
 * decision, deliberately not wired up here yet.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!GIGS_WEBHOOK_SECRET) {
    console.error("[gigs webhook] GIGS_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${GIGS_WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  let payload: { type?: string; data?: Subscription } | Subscription;
  try {
    payload = await request.json();
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

  if (!imei) {
    console.error(
      `[gigs webhook] subscription ${subscription.id} (status: ${subscription.status}) — no IMEI resolved, skipping`
    );
  } else {
    console.log(
      `[gigs webhook] subscription ${subscription.id} | IMEI: ${imei} | status: ${subscription.status} | isActive: ${isActive}`
    );
  }

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
