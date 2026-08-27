import { defineAction, ActionError } from "astro:actions";
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
  ? "price_1TTQqfATGtdZ0VDDjCCHI6ZO"
  : "price_1TTQqfATGtdZ0VDDjCCHI6ZO";

async function findOrCreateCustomer(email: string, imei: string): Promise<Stripe.Customer> {
  const existing = await stripeInstance.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) {
    const customer = existing.data[0];
    await stripeInstance.customers.update(customer.id, { metadata: { imei } });
    return customer;
  }
  return stripeInstance.customers.create({ email, metadata: { imei } });
}

export const stripe = {
  createSubscriptionPage: defineAction({
    input: z.object({
      customerEmail: z.string().email(),
      deviceIMEI: z.string(),
      plan: z.enum(["monthly", "yearly"]).default("monthly")
    }),
    handler: async (input, context) => {
      const normalizedImei = input.deviceIMEI.replace(/\D/g, "");

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
        subscription_data: {
          metadata: {
            imei: normalizedImei
          }
        },
        metadata: {
          imei: normalizedImei
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

  // Phase 1: Create a SetupIntent to collect and validate card details.
  // Always creates a fresh Stripe customer (matching the old checkout flow).
  // Returns customerId so Phase 2 (activateSubscription) uses the exact same customer.
  createSetupIntent: defineAction({
    input: z.object({
      customerEmail: z.string().email(),
      deviceIMEI: z.string()
    }),
    handler: async (input, _context) => {
      devLog.log("[STRIPE] createSetupIntent | email:", input.customerEmail, "| IMEI:", input.deviceIMEI);

      devLog.log("[STRIPE] ── CUSTOMER CREATE ──────────────────────────");
      devLog.log("[STRIPE] email:", input.customerEmail);
      devLog.log("[STRIPE] metadata.imei:", input.deviceIMEI);
      const customer = await stripeInstance.customers.create({
        email: input.customerEmail,
        metadata: { imei: input.deviceIMEI }
      });
      devLog.log("[STRIPE] Customer created → id:", customer.id, "| email:", customer.email, "| metadata.imei:", customer.metadata?.imei);
      devLog.log("[STRIPE] ────────────────────────────────────────────");

      // automatic_payment_methods is required when using the Payment Element for intent-based confirmation.
      // Explicit payment_method_types conflicts with the Payment Element and causes setup_intent_unexpected_state.
      const setupIntent = await stripeInstance.setupIntents.create({
        customer: customer.id,
        automatic_payment_methods: { enabled: true },
        usage: "off_session",
        metadata: { imei: input.deviceIMEI }
      });
      devLog.log("[STRIPE] SetupIntent created | id:", setupIntent.id, "| status:", setupIntent.status);

      return { clientSecret: setupIntent.client_secret!, customerId: customer.id };
    }
  }),

  // Validates a coupon code against active Stripe promotion codes and returns the discounted amount.
  // Does NOT create any Stripe objects.
  validateCoupon: defineAction({
    input: z.object({
      code: z.string(),
      plan: z.enum(["monthly", "yearly"]).default("monthly")
    }),
    handler: async (input, _context) => {
      devLog.log("[STRIPE] validateCoupon | code:", input.code, "| plan:", input.plan);

      const promoCodes = await stripeInstance.promotionCodes.list({
        code: input.code.trim(),
        active: true,
        limit: 1
      });

      if (promoCodes.data.length === 0) {
        devLog.log("[STRIPE] validateCoupon | code not found or inactive:", input.code);
        throw new ActionError({ code: "BAD_REQUEST", message: "Invalid or expired coupon code" });
      }

      const coupon = promoCodes.data[0].coupon as Stripe.Coupon;
      devLog.log("[STRIPE] validateCoupon | coupon found | percent_off:", coupon.percent_off, "| amount_off:", coupon.amount_off);

      const baseAmount = input.plan === "yearly" ? 16488 : 1499;
      let finalAmount: number;

      if (coupon.percent_off != null) {
        finalAmount = Math.round(baseAmount * (1 - coupon.percent_off / 100));
      } else if (coupon.amount_off != null) {
        finalAmount = Math.max(0, baseAmount - coupon.amount_off);
      } else {
        throw new ActionError({ code: "BAD_REQUEST", message: "Invalid coupon configuration" });
      }

      devLog.log("[STRIPE] validateCoupon | baseAmount:", baseAmount, "| finalAmount:", finalAmount);
      return { valid: true, finalAmount };
    }
  }),

  // Phase 2: Create and activate the subscription using the payment method saved via SetupIntent.
  // Updates the customer with the email and cardholder name from the checkout modal
  // before creating the subscription.
  activateSubscription: defineAction({
    input: z.object({
      customerId: z.string(),
      customerEmail: z.string().email(),
      customerName: z.string(),
      deviceIMEI: z.string(),
      plan: z.enum(["monthly", "yearly"]).default("monthly"),
      paymentMethodId: z.string(),
      promotionCode: z.string().optional()
    }),
    handler: async (input, _context) => {
      devLog.log("[STRIPE] ── SUBSCRIPTION CREATE ───────────────────────");
      devLog.log("[STRIPE] customerId:", input.customerId);
      devLog.log("[STRIPE] customerEmail:", input.customerEmail);
      devLog.log("[STRIPE] deviceIMEI:", input.deviceIMEI);
      devLog.log("[STRIPE] plan:", input.plan);
      devLog.log("[STRIPE] paymentMethodId:", input.paymentMethodId);
      devLog.log("[STRIPE] promotionCode:", input.promotionCode ?? "none");
      devLog.log("[STRIPE] ─────────────────────────────────────────────");

      // Pull all billing details that Stripe collected in the Payment Element
      // (name on card, phone, address — everything the customer filled in)
      const paymentMethod = await stripeInstance.paymentMethods.retrieve(input.paymentMethodId);
      const bd = paymentMethod.billing_details;
      devLog.log("[STRIPE] PaymentMethod billing_details | name:", bd.name, "| phone:", bd.phone, "| address:", JSON.stringify(bd.address));

      // Update the customer: name from Full name field, address/phone from Payment Element via PaymentMethod
      await stripeInstance.customers.update(input.customerId, {
        email: input.customerEmail,
        name: input.customerName,
        phone: bd.phone ?? undefined,
        address: bd.address
          ? {
              line1: bd.address.line1 ?? undefined,
              line2: bd.address.line2 ?? undefined,
              city: bd.address.city ?? undefined,
              state: bd.address.state ?? undefined,
              postal_code: bd.address.postal_code ?? undefined,
              country: bd.address.country ?? undefined
            }
          : undefined,
        metadata: { imei: input.deviceIMEI }
      });
      devLog.log("[STRIPE] Customer updated | id:", input.customerId, "| name:", input.customerName, "| email:", input.customerEmail, "| phone:", bd.phone, "| country:", bd.address?.country, "| postal_code:", bd.address?.postal_code);

      // Resolve promotion code if provided
      let promotionCodeId: string | undefined;
      if (input.promotionCode?.trim()) {
        const promoCodes = await stripeInstance.promotionCodes.list({
          code: input.promotionCode.trim(),
          active: true,
          limit: 1
        });
        if (promoCodes.data.length === 0) {
          throw new ActionError({ code: "BAD_REQUEST", message: "Invalid or expired coupon code" });
        }
        promotionCodeId = promoCodes.data[0].id;
        devLog.log("[STRIPE] Promotion code resolved | id:", promotionCodeId);
      }

      const priceId = input.plan === "yearly" ? TECHLESS_YEARLY_PRICE_ID : TECHLESS_MONTHLY_PRICE_ID;

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: input.customerId,
        items: [{ price: priceId }],
        default_payment_method: input.paymentMethodId,
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"]
        },
        expand: ["latest_invoice", "latest_invoice.payment_intent"],
        metadata: { imei: input.deviceIMEI }
      };

      if (promotionCodeId) {
        subscriptionParams.discounts = [{ promotion_code: promotionCodeId }];
      }

      devLog.log("[STRIPE] ── SUBSCRIPTION PARAMS ───────────────────────");
      devLog.log("[STRIPE] customer:", subscriptionParams.customer);
      devLog.log("[STRIPE] priceId:", priceId);
      devLog.log("[STRIPE] default_payment_method:", subscriptionParams.default_payment_method);
      devLog.log("[STRIPE] metadata.imei:", (subscriptionParams.metadata as any)?.imei);
      devLog.log("[STRIPE] discounts:", JSON.stringify(subscriptionParams.discounts ?? []));
      devLog.log("[STRIPE] ─────────────────────────────────────────────");
      const subscription = await stripeInstance.subscriptions.create(subscriptionParams);
      devLog.log("[STRIPE] Subscription created → id:", subscription.id, "| status:", subscription.status, "| customer:", subscription.customer);

      const invoice = (typeof subscription.latest_invoice === "object" && subscription.latest_invoice !== null)
        ? subscription.latest_invoice as Stripe.Invoice
        : null;
      const paymentIntent = (invoice?.payment_intent && typeof invoice.payment_intent === "object")
        ? invoice.payment_intent as Stripe.PaymentIntent
        : null;

      devLog.log("[STRIPE] invoice.amount_due:", invoice?.amount_due, "| paymentIntent.status:", paymentIntent?.status ?? "none");

      // $0 invoice: subscription is immediately active (100% off coupon). No payment to confirm.
      if (!paymentIntent || invoice?.amount_due === 0) {
        devLog.log("[STRIPE] $0 subscription activated | subscriptionId:", subscription.id);
        return { requiresAction: false, subscriptionId: subscription.id, paymentIntentClientSecret: null };
      }

      // Payment already succeeded (Stripe auto-charged with the default_payment_method)
      if (paymentIntent.status === "succeeded") {
        devLog.log("[STRIPE] Payment already succeeded | subscriptionId:", subscription.id);
        return { requiresAction: false, subscriptionId: subscription.id, paymentIntentClientSecret: null };
      }

      // 3DS or additional authentication required
      if (paymentIntent.status === "requires_action" || paymentIntent.status === "requires_confirmation") {
        devLog.log("[STRIPE] Payment requires client-side action | status:", paymentIntent.status, "| subscriptionId:", subscription.id);
        return { requiresAction: true, subscriptionId: subscription.id, paymentIntentClientSecret: paymentIntent.client_secret };
      }

      // Payment failed (declined, insufficient funds, etc.)
      devLog.log("[STRIPE] Payment failed | paymentIntent.status:", paymentIntent.status);
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Payment was declined. Please check your card details and try again."
      });
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

      const sessionImei = (session.metadata?.imei ?? "").replace(/\D/g, "");
      const requestedImei = input.imei.replace(/\D/g, "");
      devLog.log("PAY DEBUG: [A2.7.1] Session IMEI:", sessionImei);
      devLog.log("PAY DEBUG: [A2.7.2] Requested IMEI:", requestedImei);

      if (!sessionImei || sessionImei !== requestedImei) {
        devLog.error("PAY DEBUG: [A2.7.3] Session IMEI mismatch or missing");
        throw new ActionError({
          code: "FORBIDDEN",
          message: "This checkout session does not belong to this device."
        });
      }

      devLog.log("PAY DEBUG: [A2.8] Retrieving subscription");
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription as string);
      devLog.log("PAY DEBUG: [A2.9] Subscription retrieved - ID:", subscription.id);
      devLog.log("PAY DEBUG: [A2.10] Subscription status:", subscription.status);

      const subscriptionImei = (subscription.metadata?.imei ?? "").replace(/\D/g, "");
      if (!subscriptionImei) {
        devLog.log("PAY DEBUG: [A2.10.1] Stamping IMEI on subscription metadata");
        await stripeInstance.subscriptions.update(subscription.id, {
          metadata: { ...subscription.metadata, imei: requestedImei }
        });
        devLog.log("PAY DEBUG: [A2.10.2] Subscription metadata updated with IMEI:", requestedImei);
      } else if (subscriptionImei !== requestedImei) {
        devLog.error(
          "PAY DEBUG: [A2.10.3] Subscription has different IMEI, not overwriting:",
          subscriptionImei
        );
      }

      // Flow: User completes checkout → subscription is created → validateSubscription action runs
      // → stamps IMEI on subscription metadata (source of truth for per-device validation)
      // → also sets IMEI on customer metadata as a search index / diagnostic aid.
      //
      // Per-device subscription validity is determined by subscription metadata.imei (strict path)
      // or customer metadata search (legacy path). Customer metadata alone does not prove subscription.
      devLog.log("PAY DEBUG: [A2.11] Updating customer metadata with IMEI");
      await stripeInstance.customers.update(session.customer as string, {
        metadata: {
          imei: requestedImei
        }
      });
      devLog.log("PAY DEBUG: [A2.12] Customer metadata updated with IMEI:", requestedImei);

      const isSubscribed = subscription.status === "active" || subscription.status === "trialing";
      devLog.log("PAY DEBUG: [A2.13] Subscription check result - isSubscribed:", isSubscribed);
      devLog.log("PAY DEBUG: [A2.14] Subscription status check:", subscription.status, "->", isSubscribed);

      return {
        isSubscribed
      };
    }
  })
};
