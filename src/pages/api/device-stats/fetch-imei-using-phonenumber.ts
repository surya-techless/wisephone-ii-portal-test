import type { APIRoute } from "astro";
import { db, Wisephone, eq } from "astro:db";
import { captureException } from "@sentry/astro";
import { devLog } from "@/libs/utils";

/**
 * GET /api/device-stats/fetch-imei-using-phonenumber?phoneNumber=480-287-1184
 *
 * Endpoint for WiseOS devices to fetch their IMEI using phone number.
 * Used when IMEI is missing from device but phone number is available.
 *
 * Query parameters:
 *   phoneNumber: "480-287-1184"  // Must be in format XXX-XXX-XXXX (12 characters)
 *
 * Response format:
 * {
 *   success: true,
 *   imei: "350256489950778"
 * }
 * OR
 * {
 *   success: false,
 *   error: "Device not found" | "Invalid phone number format" | "Missing phone number"
 * }
 */

// CORS headers for device requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

// Handle CORS preflight requests
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
};

export const GET: APIRoute = async ({ request, url }) => {
  try {
    // API key authentication - device uses a shared secret
    const authHeader = request.headers.get("Authorization");
    const expectedKey = import.meta.env.DEVICE_SYNC_API_KEY;

    if (!expectedKey) {
      devLog.error("DEVICE_SYNC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured without API key" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Get phone number from query parameter
    const phoneNumber = url.searchParams.get("phoneNumber");
    devLog.log("========================================");
    devLog.log("📞 IMEI LOOKUP REQUEST (Phone Number)");
    devLog.log("========================================");
    devLog.log("Phone number from query:", phoneNumber);
    devLog.log("========================================");

    // Validate phone number is provided
    if (!phoneNumber) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing phone number"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    // Validate phone number format (must be XXX-XXX-XXXX, 12 characters)
    const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
    if (!phoneRegex.test(phoneNumber)) {
      devLog.log(`⚠️  Invalid phone number format: "${phoneNumber}"`);
      devLog.log("   Expected format: XXX-XXX-XXXX (12 characters)");
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid phone number format. Expected format: XXX-XXX-XXXX (got: "${phoneNumber}")`
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    // Lookup device by phone number
    devLog.log(`🔍 Looking up device with phone number: ${phoneNumber}`);
    const wisephone = await db
      .select()
      .from(Wisephone)
      .where(eq(Wisephone.phoneNumber, phoneNumber))
      .get();

    devLog.log(
      `📱 Wisephone lookup result:`,
      wisephone ? `Found device: IMEI=${wisephone.imei}` : "NOT FOUND"
    );

    if (!wisephone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Device not found"
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    // Return IMEI
    const imei = String(wisephone.imei);
    devLog.log(`✅ IMEI found: ${imei.substring(0, 8)}...`);

    return new Response(
      JSON.stringify({
        success: true,
        imei: imei
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  } catch (error) {
    captureException(error);
    devLog.error("Error fetching IMEI by phone number:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  }
};
