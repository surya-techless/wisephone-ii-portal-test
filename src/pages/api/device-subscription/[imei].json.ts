import type { APIRoute } from "astro";
import { db, Wisephone, BypassTechlessSubscription, eq } from "astro:db";
import { validateIsSubscribed } from "@/libs/stripe";
import { devLog } from "@/libs/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

/**
 * GET /api/device-subscription/[imei].json
 *
 * Live "is this IMEI subscribed right now" check for devices — same bearer-key
 * trust boundary as /api/device-features/[imei].json, but instead of returning
 * static Knox-derived flags, this runs the same check the portal itself uses
 * (bypass override, then Stripe-then-Gigs via validateIsSubscribed — see
 * src/libs/stripe.ts and /api/wisephones/[imei]/info.ts, which is Clerk-gated
 * and therefore not callable from a device).
 */
export const GET: APIRoute = async ({ params, request }) => {
  // Bearer token auth — same key used by all WiseOS device endpoints
  const authHeader = request.headers.get("Authorization");
  const expectedKey = import.meta.env.DEVICE_SYNC_API_KEY;

  if (!expectedKey) {
    return new Response(JSON.stringify({ success: false, error: "Server misconfigured without API key" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const { imei } = params;

  if (!imei) {
    return new Response(JSON.stringify({ success: false, error: "IMEI is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const imeiNum = Number(imei);

  const wisephone = await db.select().from(Wisephone).where(eq(Wisephone.imei, imeiNum)).limit(1).get();

  if (!wisephone) {
    return new Response(JSON.stringify({ success: false, error: "No Wisephone found for this IMEI" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  // Bypass override first — same as the portal's own check
  let isSubscribed = false;
  let source: "bypass" | "stripe_or_gigs" | "none" = "none";

  const bypass = await db
    .select()
    .from(BypassTechlessSubscription)
    .where(eq(BypassTechlessSubscription.imei, imeiNum))
    .limit(1)
    .get();

  if (bypass) {
    isSubscribed = true;
    source = "bypass";
  } else if (wisephone.phoneNumber) {
    try {
      isSubscribed = await validateIsSubscribed({
        imei: String(wisephone.imei),
        phoneNumber: wisephone.phoneNumber.replace(/[^0-9+]/g, "")
      });
      source = isSubscribed ? "stripe_or_gigs" : "none";
    } catch (subscriptionError) {
      // Best-effort, same as the portal's own callers — don't fail the request
      devLog.error(`[device-subscription] validateIsSubscribed failed for IMEI ${imei}:`, subscriptionError);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      imei,
      isSubscribed,
      source,
      checkedAt: new Date().toISOString()
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    }
  );
};
