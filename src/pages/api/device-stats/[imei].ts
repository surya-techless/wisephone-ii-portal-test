import type { APIRoute } from "astro";
import { db, DeviceScreenTimeMetrics, DeviceDataUsage, Wisephone, eq, sql, and } from "astro:db";
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

    // One row per IMEI: fetch the single metrics row for this device
    const row = await db
      .select()
      .from(DeviceScreenTimeMetrics)
      .where(eq(DeviceScreenTimeMetrics.imei, imei))
      .get();

    // Fetch data usage (one row per IMEI) regardless of screen time
    const dataUsageRow = await db
      .select()
      .from(DeviceDataUsage)
      .where(eq(DeviceDataUsage.imei, imei))
      .get();

    const dataUsage =
      dataUsageRow != null
        ? {
            cycleStartDate: dataUsageRow.cycleStartDate,
            usageDetail: dataUsageRow.usageDetail,
            lastSyncedAt: dataUsageRow.lastSyncedAt
          }
        : null;

    if (!row || !row.screenTimeDetail) {
      return new Response(
        JSON.stringify({
          device: {
            imei,
            deviceName: null,
            deviceManufacturer: null,
            lastSynced: null
          },
          weeks: [],
          dataUsage,
          message: "No screen time data available. Device has not synced yet."
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const deviceInfo = {
      imei,
      deviceName: row.deviceName ?? null,
      deviceManufacturer: row.deviceManufacturer ?? null,
      lastSynced: row.syncedAt
    };

    const detail = row.screenTimeDetail as { weeks?: Array<{
      weekStartDate: string;
      weekEndDate: string;
      totalScreenTimeMs: number;
      dailyAverageMs: number;
      apps?: Array<{ packageName: string; appName: string; totalTimeMs: number; dailyAverageMs?: number }>;
    }> };
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const weeksData = (detail?.weeks ?? [])
      .filter((week) => new Date(week.weekEndDate + "T23:59:59.999Z") >= fourWeeksAgo)
      .sort(
        (a, b) => new Date(b.weekStartDate).getTime() - new Date(a.weekStartDate).getTime()
      )
      .slice(0, weeksCount);

    const weeks = weeksData.map((week) => {
      const weekStartDate = new Date(week.weekStartDate + "T00:00:00.000Z");
      const apps = (week.apps ?? [])
        .filter((app) => (app.totalTimeMs ?? 0) > 0)
        .map((app) => ({
          packageName: app.packageName,
          appName: app.appName,
          totalTimeMs: app.totalTimeMs ?? 0,
          dailyAverageMs: app.dailyAverageMs ?? 0,
          totalTimeFormatted: formatDuration(app.totalTimeMs ?? 0),
          dailyAverageFormatted: formatDuration(app.dailyAverageMs ?? 0)
        }));
      return {
        weekStartDate,
        weekEndDate: new Date(week.weekEndDate + "T23:59:59.999Z"),
        weekLabel: getWeekLabel(weekStartDate),
        totalScreenTimeMs: week.totalScreenTimeMs ?? 0,
        dailyAverageMs: week.dailyAverageMs ?? 0,
        totalScreenTimeFormatted: formatDuration(week.totalScreenTimeMs ?? 0),
        dailyAverageFormatted: formatDuration(week.dailyAverageMs ?? 0),
        syncedAt: row.syncedAt,
        apps
      };
    });

    return new Response(
      JSON.stringify({
        device: deviceInfo,
        weeks,
        dataUsage
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
