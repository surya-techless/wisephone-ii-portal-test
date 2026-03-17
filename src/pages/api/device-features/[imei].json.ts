import type { APIRoute } from "astro";
import { db, DeviceFeatureFlags, eq } from "astro:db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

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

  const row = await db
    .select()
    .from(DeviceFeatureFlags)
    .where(eq(DeviceFeatureFlags.imei, imei))
    .get();

  if (!row) {
    return new Response(JSON.stringify({ success: false, error: "No feature flags found for this device" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const { updatedAt, imei: _imei, ...flags } = row;

  return new Response(
    JSON.stringify({ success: true, imei, flags, updatedAt }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    }
  );
};
