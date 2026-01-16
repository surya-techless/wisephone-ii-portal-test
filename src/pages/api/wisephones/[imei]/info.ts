import type { APIRoute } from "astro";
import { db, Wisephone, BypassTechlessSubscription, sql, and, eq } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";
import { validateIsSubscribed } from "@/libs/stripe";
import { actions } from "astro:actions";
import { captureException } from "@sentry/astro";

/**
 * GET /api/wisephones/[imei]/info
 *
 * Fetches device information, subscription status, and installed apps for a device.
 * This endpoint is designed for async loading to improve page load performance.
 *
 * Response format:
 * {
 *   device: { imei, nickname, phoneNumber, userId },
 *   isSubscribed: boolean,
 *   installedApps: Array<{ packageName, appName, ... }>,
 *   appsList: { [packageName]: { source, installed, name } }
 * }
 */
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const userId = locals.auth().userId;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const imei = params.imei;
    if (!imei) {
      return new Response(JSON.stringify({ error: "IMEI required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = await locals.currentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const userIsAdmin = await isAdmin(user.id);

    // Fetch device info
    const wisephone = userIsAdmin
      ? await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .limit(1)
          .get()
      : await db
          .select()
          .from(Wisephone)
          .where(and(sql`${Wisephone.imei} = ${imei}`, eq(Wisephone.userId, userId)))
          .limit(1)
          .get();

    if (!wisephone) {
      return new Response(JSON.stringify({ error: "Device not found or access denied" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check subscription status
    let isSubscribed = false;
    const bypassTechlessSubscription = await db
      .select()
      .from(BypassTechlessSubscription)
      .where(eq(BypassTechlessSubscription.imei, Number(imei)))
      .limit(1)
      .get();

    isSubscribed = bypassTechlessSubscription !== null;

    // If not bypassed, check Stripe subscription
    if (!isSubscribed && wisephone?.phoneNumber) {
      try {
        isSubscribed = await validateIsSubscribed({
          imei: String(wisephone?.imei || ""),
          phoneNumber: `${wisephone?.phoneNumber?.replace(/[^0-9+]/g, "") || ""}`
        });
      } catch (subscriptionError) {
        // Log but don't fail - subscription check is best effort
        console.error("Error checking subscription status:", subscriptionError);
      }
    }

    // Fetch installed apps
    let installedApps: any[] = [];
    try {
      const formData = new FormData();
      formData.append("imei", String(wisephone?.imei || ""));
      const getInstalledAppsResult = await actions.wisephones.getInstalledApps(formData);
      installedApps = getInstalledAppsResult?.data?.apps || [];
    } catch (appsError) {
      console.error("Error getting installed apps:", appsError);
      // Continue without apps - don't fail the entire request
    }

    // Build apps list (simplified - just return installed apps info)
    // The full apps list processing can be done client-side if needed
    const appsList: Record<string, { source: string; installed: boolean; name: string }> = {};

    return new Response(
      JSON.stringify({
        device: {
          imei: wisephone.imei,
          nickname: wisephone.nickname,
          phoneNumber: wisephone.phoneNumber,
          userId: wisephone.userId
        },
        isSubscribed,
        installedApps,
        appsList
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    captureException(error);
    console.error("Error fetching device info:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

