import type { APIRoute } from "astro";
import Stripe from "stripe";
import { db, WebhookEvent, DeviceSubscriptionStatus } from "astro:db";
import { STRIPE_WEBHOOK_SECRET } from "astro:env/server";
import { stripe, isBypassImei, findActiveSubscriptionForImei } from "@/libs/stripe";
import { normalizeImei, logSubscriptionWebhookEvent, moveDeviceToKickoutGroup, removeDeviceFromKickoutGroup, subscriptionDatesFromStripe } from "@/libs/subscription-matching";
import { publishSubscriptionStatus } from "@/libs/mqtt";
import { devLog } from "@/libs/utils";

/**
 * POST /api/webhooks/stripe
 *
 * Receives Stripe webhook events so subscription cancellations/status changes
 * reach the portal the moment they happen, instead of waiting for someone to
 * open the dashboard/manage page (today the only thing that calls
 * validateIsSubscribed() — see src/libs/stripe.ts).
 *
 * Configure in the Stripe Dashboard: Developers > Webhooks > Add endpoint,
 * pointed at this URL, subscribed to at least:
 *   - customer.subscription.created (fires on first-time purchase)
 *   - customer.subscription.deleted
 *   - customer.subscription.updated
 *   - invoice.payment_failed (optional, catches a failed renewal early)
 * Put the endpoint's signing secret in STRIPE_WEBHOOK_SECRET.
 *
 * Events are logged (server-side) and recorded in the WebhookEvent table, so
 * the dashboard can poll /api/webhooks/recent.json and show them without
 * tailing server logs. Deciding what the portal should more actively do with
 * an ended subscription — immediately revoke the Knox SUBSCRIBED group the
 * way manage/[imei].astro's syncFeatureFlagsToDb does reactively today — is a
 * separate decision, deliberately not wired up here yet.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Signature verification needs the raw, unparsed body — do not JSON-parse first.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    devLog.error("[stripe webhook] signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // Strict path: IMEI stamped directly on the subscription — "source of
      // truth for per-device validation" per src/actions/stripe.ts.
      let imei = normalizeImei(String((subscription.metadata as Record<string, string> | null)?.imei ?? ""));

      // Legacy fallback: older devices only have IMEI on the customer.
      if (!imei && typeof subscription.customer === "string") {
        try {
          const customer = await stripe.customers.retrieve(subscription.customer);
          const isDeleted = "deleted" in customer && customer.deleted;
          if (!isDeleted) {
            imei = normalizeImei(String((customer as Stripe.Customer).metadata?.imei ?? ""));
          }
        } catch (err) {
          devLog.error("[stripe webhook] failed to retrieve customer for IMEI fallback:", err);
        }
      }

      if (!imei) {
        console.error(
          `[stripe webhook] ${event.type} — no IMEI on subscription ${subscription.id} or its customer, skipping`
        );
        break;
      }

      const isActive = subscription.status === "active" || subscription.status === "trialing";
      console.log(
        `[stripe webhook] ${event.type} | IMEI: ${imei} | subscription: ${subscription.id} | status: ${subscription.status} | isActive: ${isActive}`
      );
      logSubscriptionWebhookEvent({ provider: "Stripe", isActive, imei });
      const dates = subscriptionDatesFromStripe(subscription);
      await db.insert(WebhookEvent).values({
        source: "stripe",
        type: event.type,
        imei,
        status: subscription.status,
        isActive: isActive ? 1 : 0
      });
      // Bypass devices count as subscribed regardless of Stripe — keep the
      // event for history, but never kick them out, push "not subscribed", or
      // overwrite their status row.
      if (await isBypassImei(imei)) {
        console.log(`[stripe webhook] IMEI ${imei} is in BypassTechlessSubscription — skipping status update, MQTT push and Kickout`);
        break;
      }
      // "Not active" for THIS subscription doesn't mean the device is
      // unsubscribed: it may have another active Stripe plan, or its plan may
      // be on Gigs (e.g. a duplicate Stripe plan bought and then cancelled).
      // Check before marking it unsubscribed or kicking it out.
      let effective: { isActive: boolean; type: "Stripe" | "Gigs"; rawStatus: string; dates: typeof dates } = {
        isActive,
        type: "Stripe",
        rawStatus: subscription.status,
        dates
      };
      if (!isActive) {
        try {
          const other = await findActiveSubscriptionForImei(imei);
          if (other) {
            console.log(`[stripe webhook] IMEI ${imei} still has an active ${other} subscription — keeping it active`);
            effective = {
              isActive: true,
              type: other,
              rawStatus: `active (${other})`,
              dates: { canceledAt: null, scheduledEndAt: null, endedAt: null }
            };
          }
        } catch (err) {
          // Can't tell whether the device is still subscribed — leave its status,
          // phone and Knox groups as they are rather than risk locking a paying customer.
          console.error(`[stripe webhook] Couldn't check other subscriptions for IMEI ${imei}; leaving it unchanged:`, err);
          break;
        }
      }

      await db
        .insert(DeviceSubscriptionStatus)
        .values({
          imei,
          subscriptionType: effective.type,
          hasActiveSubscription: effective.isActive ? 1 : 0,
          subscriptionStatus: effective.isActive ? "Active" : "Not Active",
          rawStatus: effective.rawStatus,
          lastEventType: event.type,
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
            lastEventType: event.type,
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
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(
        `[stripe webhook] invoice.payment_failed | customer: ${invoice.customer} | subscription: ${invoice.subscription}`
      );
      await db.insert(WebhookEvent).values({
        source: "stripe",
        type: event.type,
        status: "payment_failed",
        isActive: 0
      });
      break;
    }

    default:
      devLog.log(`[stripe webhook] Unhandled event type: ${event.type}`);
  }

  // Stripe requires a fast 2xx response — anything else (or a timeout) triggers retries.
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
