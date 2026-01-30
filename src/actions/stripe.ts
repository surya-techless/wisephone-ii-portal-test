import { defineAction } from "astro:actions";
import { STRIPE_SECRET_KEY } from "astro:env/server";
import { z } from "astro:content";
import Stripe from "stripe";

const stripeInstance = new Stripe(STRIPE_SECRET_KEY || STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  typescript: true
});

// Detect Stripe mode from the secret key (test keys start with sk_test_, live keys start with sk_live_)
const isStripeTestMode = STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? !import.meta.env.PROD;

const TECHLESS_SUBSCRIPTION_PRICE_ID = isStripeTestMode
  ? "price_1Q1BZYATGtdZ0VDD72eOr0Cm"
  : "price_1Q0nXWATGtdZ0VDDDU27pLKx";

export const stripe = {
  createSubscriptionPage: defineAction({
    input: z.object({
      customerEmail: z.string().email(),
      deviceIMEI: z.string()
    }),
    handler: async (input, context) => {
      // Return to dashboard with activation parameters for polling
      const returnUrl = new URL("/dashboard", context.url.origin);
      returnUrl.searchParams.set("activated", "true");
      returnUrl.searchParams.set("imei", input.deviceIMEI);
      returnUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

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
        return_url: returnUrl.toString(),
        automatic_tax: { enabled: true },
        allow_promotion_codes: true,
        metadata: {
          imei: input.deviceIMEI
        }
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
