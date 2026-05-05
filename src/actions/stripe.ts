import { defineAction } from "astro:actions";
import { STRIPE_SECRET_KEY } from "astro:env/server";
import { z } from "astro:schema";
import Stripe from "stripe";
import { db, Wisephone, sql } from "astro:db";
import { devLog } from "@/libs/utils";

const stripeInstance = new Stripe(STRIPE_SECRET_KEY || STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  typescript: true
});

// Detect Stripe mode from the secret key (test keys start with sk_test_, live keys start with sk_live_)
const isStripeTestMode = STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? !import.meta.env.PROD;

const TECHLESS_MONTHLY_PRICE_ID = isStripeTestMode
  ? "price_1Q1BZYATGtdZ0VDD72eOr0Cm"
  : "price_1Q0nXWATGtdZ0VDDDU27pLKx";

const TECHLESS_YEARLY_PRICE_ID = isStripeTestMode
  ? "price_1TSGXJATGtdZ0VDD3HyP6eD2"
  : "price_1TSGXJATGtdZ0VDD3HyP6eD2";

export const stripe = {
  createSubscriptionPage: defineAction({
    input: z.object({
      customerEmail: z.string().email(),
      deviceIMEI: z.string(),
      plan: z.enum(["monthly", "yearly"]).default("monthly")
    }),
    handler: async (input, context) => {
      devLog.log("PAY DEBUG: [A1] createSubscriptionPage action called");
      devLog.log("PAY DEBUG: [A1.1] customerEmail:", input.customerEmail);
      devLog.log("PAY DEBUG: [A1.2] deviceIMEI:", input.deviceIMEI);
      devLog.log("PAY DEBUG: [A1.2.1] Stripe mode (from secret key):", isStripeTestMode ? "TEST" : "LIVE");

      // Fetch wisephone record to get phone number for redirect URL
      let phoneNumber: string | null = null;
      try {
        const imeiNumber = Number(input.deviceIMEI);
        if (!isNaN(imeiNumber)) {
          const wisephone = await db
            .select()
            .from(Wisephone)
            .where(sql`${Wisephone.imei} = ${imeiNumber}`)
            .limit(1)
            .get();

          if (wisephone?.phoneNumber) {
            phoneNumber = wisephone.phoneNumber;
            devLog.log("PAY DEBUG: [A1.2.2] Phone number fetched from database:", phoneNumber);
          } else {
            devLog.log("PAY DEBUG: [A1.2.2] No phone number found in database for IMEI:", input.deviceIMEI);
          }
        } else {
          devLog.log("PAY DEBUG: [A1.2.2] Invalid IMEI format, cannot fetch phone number");
        }
      } catch (error) {
        devLog.error("PAY DEBUG: [A1.2.3] Error fetching phone number from database:", error);
        // Continue without phone number - not critical for checkout creation
      }

      // Return directly to manage page after payment completion
      // Note: Stripe embedded checkout will replace {CHECKOUT_SESSION_ID} with actual session ID
      // Server-side validation will check if payment was successful
      const returnUrl = new URL(`/manage/${input.deviceIMEI}`, context.url.origin);
      returnUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
      returnUrl.searchParams.set("payment_status", "checking");

      // Add phone number to redirect URL if available (for client-side subscription check)
      if (phoneNumber) {
        returnUrl.searchParams.set("phone", phoneNumber);
        devLog.log("PAY DEBUG: [A1.3.0] Phone number added to return URL");
      } else {
        devLog.log("PAY DEBUG: [A1.3.0] No phone number available to add to return URL");
      }

      devLog.log("PAY DEBUG: [A1.3] Return URL set to:", returnUrl.toString());
      devLog.log("PAY DEBUG: [A1.3.1] NOTE: {CHECKOUT_SESSION_ID} will be replaced by Stripe on redirect");
      devLog.log("PAY DEBUG: [A1.3.2] NOTE: Payment will be validated server-side on manage page");

      devLog.log("PAY DEBUG: [A1.4] Creating Stripe checkout session");
      const session = await stripeInstance.checkout.sessions.create({
        ui_mode: "embedded",
        line_items: [
          {
            price: input.plan === "yearly" ? TECHLESS_YEARLY_PRICE_ID : TECHLESS_MONTHLY_PRICE_ID,
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

      devLog.log("PAY DEBUG: [A1.5] Stripe checkout session created");
      devLog.log("PAY DEBUG: [A1.6] Session ID:", session.id);
      devLog.log("PAY DEBUG: [A1.7] Session metadata:", session.metadata);

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
      devLog.log("PAY DEBUG: [A2] validateSubscription action called");
      devLog.log("PAY DEBUG: [A2.1] sessionId:", input.sessionId);
      devLog.log("PAY DEBUG: [A2.2] imei:", input.imei);

      devLog.log("PAY DEBUG: [A2.3] Retrieving Stripe checkout session");
      const session = await stripeInstance.checkout.sessions.retrieve(input.sessionId);
      devLog.log("PAY DEBUG: [A2.4] Session retrieved - ID:", session.id);
      devLog.log("PAY DEBUG: [A2.5] Session status:", session.status);
      devLog.log("PAY DEBUG: [A2.6] Session subscription ID:", session.subscription);
      devLog.log("PAY DEBUG: [A2.7] Session customer ID:", session.customer);

      devLog.log("PAY DEBUG: [A2.8] Retrieving subscription");
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription as string);
      devLog.log("PAY DEBUG: [A2.9] Subscription retrieved - ID:", subscription.id);
      devLog.log("PAY DEBUG: [A2.10] Subscription status:", subscription.status);

      // Flow: User completes checkout → subscription is created → validateSubscription action runs
      // → sets IMEI on customer metadata → Later, validateIsSubscribed calls validateSubscription
      // → searches customers by IMEI → finds customer → checks their subscriptions
      //
      // Add IMEI to customer metadata. This is how we can identify the customer is subscribed.
      // The validateIsSubscribed function searches customers by IMEI metadata, then checks
      // if those customers have active subscriptions.
      devLog.log("PAY DEBUG: [A2.11] Updating customer metadata with IMEI");
      await stripeInstance.customers.update(session.customer as string, {
        metadata: {
          imei: input.imei
        }
      });
      devLog.log("PAY DEBUG: [A2.12] Customer metadata updated with IMEI:", input.imei);

      const isSubscribed = subscription.status === "active" || subscription.status === "trialing";
      devLog.log("PAY DEBUG: [A2.13] Subscription check result - isSubscribed:", isSubscribed);
      devLog.log("PAY DEBUG: [A2.14] Subscription status check:", subscription.status, "->", isSubscribed);

      return {
        isSubscribed
      };
    }
  })
};
