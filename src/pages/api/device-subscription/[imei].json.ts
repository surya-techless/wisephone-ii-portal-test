import type { APIRoute } from "astro";
import { db, Wisephone, eq } from "astro:db";
import { resolveDeviceSubscriptionStatus } from "@/libs/stripe";

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
 * trust boundary as /api/device-features/[imei].json. Backed by
 * resolveDeviceSubscriptionStatus() (src/libs/stripe.ts): bypass override,
 * then the DeviceSubscriptionStatus cache kept fresh by the Stripe/Gigs
 * webhook handlers, falling back to a live Stripe/Gigs check only when no
 * cached row exists yet for this IMEI.
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

  const result = await resolveDeviceSubscriptionStatus({
    imei: String(wisephone.imei),
    phoneNumber: wisephone.phoneNumber ?? ""
  });

  return new Response(
    JSON.stringify({
      success: true,
      imei,
      isSubscribed: result.isSubscribed,
      source: result.source,
      checkedAt: result.checkedAt
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    }
  );
};

export const ALL: APIRoute = ({ request }) => {
  return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};
