import type { APIRoute } from "astro";
import { db, DeviceScreenTime, DeviceAppUsage, Wisephone, eq, desc, sql, and } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";
import { captureException } from "@sentry/astro";
import { devLog } from "@/libs/utils";

/**
 * GET /api/device-stats/[imei]
 *
 * Fetches screen time statistics for a specific device from TURSO DB .
 * Used by the portal UI to display stats that were previously synced from WiseOS.
 *
 * Query params:
 *   - weeks: Number of weeks to fetch (default: 4)
 *
 * Response format:
 * {
 *   device: { imei, deviceName, deviceManufacturer, lastSynced },
 *   weeks: [{
 *     weekStartDate, weekEndDate,
 *     totalScreenTimeMs, dailyAverageMs,
 *     totalScreenTimeFormatted, dailyAverageFormatted,
 *     apps: [{ packageName, appName, totalTimeMs, dailyAverageMs, ... }]
 *   }]
 * }
 */
export const GET: APIRoute = async ({ params, locals, request }) => {
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
    const userIsAdmin = await isAdmin(user?.id || "");

    // Verify user owns this device (or is admin)
    const wisephone = userIsAdmin
      ? await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .get()
      : await db
          .select()
          .from(Wisephone)
          .where(and(sql`${Wisephone.imei} = ${imei}`, eq(Wisephone.userId, userId)))
          .get();

    if (!wisephone) {
      return new Response(JSON.stringify({ error: "Device not found or access denied" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const weeksCount = Math.min(parseInt(url.searchParams.get("weeks") || "4"), 12); // Max 12 weeks

    // Fetch screen time records for this device, ordered by most recent first
    const screenTimeRecords = await db
      .select()
      .from(DeviceScreenTime)
      .where(eq(DeviceScreenTime.imei, imei))
      .orderBy(desc(DeviceScreenTime.weekStartDate))
      .limit(weeksCount);

    if (screenTimeRecords.length === 0) {
      return new Response(
        JSON.stringify({
          device: {
            imei,
            deviceName: null,
            deviceManufacturer: null,
            lastSynced: null
          },
          weeks: [],
          message: "No screen time data available. Device has not synced yet."
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Get device info from the most recent record
    const latestRecord = screenTimeRecords[0];
    const deviceInfo = {
      imei,
      deviceName: latestRecord.deviceName,
      deviceManufacturer: latestRecord.deviceManufacturer,
      lastSynced: latestRecord.syncedAt
    };

    // Fetch app usage for each week and format the response
    const weeks = await Promise.all(
      screenTimeRecords.map(async (record) => {
        const apps = await db
          .select()
          .from(DeviceAppUsage)
          .where(eq(DeviceAppUsage.screenTimeId, record.id))
          .orderBy(desc(DeviceAppUsage.totalTimeMs));

        return {
          id: record.id,
          weekStartDate: record.weekStartDate,
          weekEndDate: record.weekEndDate,
          weekLabel: getWeekLabel(record.weekStartDate),
          totalScreenTimeMs: record.totalScreenTimeMs,
          dailyAverageMs: record.dailyAverageMs,
          totalScreenTimeFormatted: formatDuration(record.totalScreenTimeMs),
          dailyAverageFormatted: formatDuration(record.dailyAverageMs),
          syncedAt: record.syncedAt,
          apps: apps
            .filter((app) => (app.totalTimeMs ?? 0) > 0)
            .map((app) => ({
              packageName: app.packageName,
              appName: app.appName,
              totalTimeMs: app.totalTimeMs,
              dailyAverageMs: app.dailyAverageMs,
              totalTimeFormatted: formatDuration(app.totalTimeMs),
              dailyAverageFormatted: formatDuration(app.dailyAverageMs)
            }))
        };
      })
    );

    return new Response(
      JSON.stringify({
        device: deviceInfo,
        weeks
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    captureException(error);
    devLog.error("Error fetching device stats:", error);
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

/**
 * Format milliseconds to human-readable duration (e.g., "2h 30m")
 */
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "0m";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Generate a label for the week based on how recent it is
 */
function getWeekLabel(weekStart: Date): string {
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);

  const weekStartTime = new Date(weekStart).getTime();
  const thisWeekTime = startOfThisWeek.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  const weeksDiff = Math.floor((thisWeekTime - weekStartTime) / oneWeek);

  if (weeksDiff === 0) return "This Week";
  if (weeksDiff === 1) return "Last Week";
  return `${weeksDiff + 1} Weeks Ago`;
}
