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
      console.log("PAY DEBUG: [A1] createSubscriptionPage action called");
      console.log("PAY DEBUG: [A1.1] customerEmail:", input.customerEmail);
      console.log("PAY DEBUG: [A1.2] deviceIMEI:", input.deviceIMEI);
      console.log("PAY DEBUG: [A1.2.1] Stripe mode (from secret key):", isStripeTestMode ? "TEST" : "LIVE");

      // Return to dashboard with activation parameters for polling
      // Note: Stripe embedded checkout should replace {CHECKOUT_SESSION_ID} with actual session ID
      // But if it doesn't, we'll retrieve it from sessionStorage (set before checkout)
      const returnUrl = new URL("/dashboard", context.url.origin);
      returnUrl.searchParams.set("activated", "true");
      returnUrl.searchParams.set("imei", input.deviceIMEI);
      returnUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
      console.log("PAY DEBUG: [A1.3] Return URL set to:", returnUrl.toString());
      console.log("PAY DEBUG: [A1.3.1] NOTE: {CHECKOUT_SESSION_ID} should be replaced by Stripe on redirect");

      console.log("PAY DEBUG: [A1.4] Creating Stripe checkout session");
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

      console.log("PAY DEBUG: [A1.5] Stripe checkout session created");
      console.log("PAY DEBUG: [A1.6] Session ID:", session.id);
      console.log("PAY DEBUG: [A1.7] Session metadata:", session.metadata);

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
      console.log("PAY DEBUG: [A2] validateSubscription action called");
      console.log("PAY DEBUG: [A2.1] sessionId:", input.sessionId);
      console.log("PAY DEBUG: [A2.2] imei:", input.imei);

      console.log("PAY DEBUG: [A2.3] Retrieving Stripe checkout session");
      const session = await stripeInstance.checkout.sessions.retrieve(input.sessionId);
      console.log("PAY DEBUG: [A2.4] Session retrieved - ID:", session.id);
      console.log("PAY DEBUG: [A2.5] Session status:", session.status);
      console.log("PAY DEBUG: [A2.6] Session subscription ID:", session.subscription);
      console.log("PAY DEBUG: [A2.7] Session customer ID:", session.customer);

      console.log("PAY DEBUG: [A2.8] Retrieving subscription");
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription as string);
      console.log("PAY DEBUG: [A2.9] Subscription retrieved - ID:", subscription.id);
      console.log("PAY DEBUG: [A2.10] Subscription status:", subscription.status);

      // Add IMEI to customer metadata. This is how we can identify the customer is subscribed.
      console.log("PAY DEBUG: [A2.11] Updating customer metadata with IMEI");
      await stripeInstance.customers.update(session.customer as string, {
        metadata: {
          imei: input.imei
        }
      });
      console.log("PAY DEBUG: [A2.12] Customer metadata updated with IMEI:", input.imei);

      const isSubscribed = subscription.status === "active" || subscription.status === "trialing";
      console.log("PAY DEBUG: [A2.13] Subscription check result - isSubscribed:", isSubscribed);
      console.log("PAY DEBUG: [A2.14] Subscription status check:", subscription.status, "->", isSubscribed);

      return {
        isSubscribed
      };
    }
  })
};
