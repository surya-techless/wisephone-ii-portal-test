import { defineAction } from "astro:actions";
import { STRIPE_SECRET_KEY } from "astro:env/server";
import { z } from "astro:content";
import Stripe from "stripe";

const stripeInstance = new Stripe(
  import.meta.env.PROD
    ? STRIPE_SECRET_KEY
    : "sk_test_51H2HO9ATGtdZ0VDD6qhj4b11PI5Rt8kWfTrI9Vms2lZmokvaVU3MXRoHTCbmJKdPoKc3lb06Y0xNlIyankVH6Hgz00nQApc96Y",
  {
    apiVersion: "2025-02-24.acacia",
    typescript: true
  }
);

const TECHLESS_SUBSCRIPTION_PRICE_ID = import.meta.env.PROD
  ? "price_1Q0nXWATGtdZ0VDDDU27pLKx"
  : "price_1Q1BZYATGtdZ0VDD72eOr0Cm";

export const stripe = {
  createSubscriptionPage: defineAction({
    input: z.object({
      customerEmail: z.string().email(),
      deviceIMEI: z.string()
    }),
    handler: async (input, context) => {
      const returnUrl = new URL("/dashboard/device/" + input.deviceIMEI, context.url.origin);

      const session = await stripeInstance.checkout.sessions.create({
        ui_mode: "embedded",
        line_items: [
          {
            price: TECHLESS_SUBSCRIPTION_PRICE_ID,
            quantity: 1
          }
        ],
        mode: "subscription",
        customer_email: input.customerEmail,
        phone_number_collection: {
          enabled: true
        },
        // Required param replaced by Stripe, and we can't have it percent encoded
        return_url: returnUrl.toString() + "?session_id={CHECKOUT_SESSION_ID}",
        automatic_tax: { enabled: true },
        allow_promotion_codes: true
      });

      return {
        session
      };
    }
  }),

  validateSubscription: defineAction({
    input: z.object({
      sessionId: z.string(),
      imei: z.string()
    }),
    handler: async (input, _context) => {
      const session = await stripeInstance.checkout.sessions.retrieve(input.sessionId);
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription as string);

      // Add IMEI to customer metadata. This is how we can identify the customer is subscribed.
      await stripeInstance.customers.update(session.customer as string, {
        metadata: {
          imei: input.imei
        }
      });

      return {
        isSubscribed: subscription.status === "active" || subscription.status === "trialing"
      };
    }
  })
};
