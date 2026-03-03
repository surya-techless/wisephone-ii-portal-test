import type { APIRoute } from "astro";
import { db, DeviceScreenTimeMetrics, DeviceDataUsage, Wisephone, eq } from "astro:db";
import { captureException } from "@sentry/astro";
import { devLog } from "@/libs/utils";

/**
 * POST /api/device-stats/sync
 *
 * Endpoint for WiseOS devices to push their screen time statistics.
 * Only the row for this device (IMEI) is updated; no other rows are touched.
 * Storage: DeviceScreenTimeMetrics — one row per IMEI, screenTimeDetail (JSON).
 *
 * Expected payload: { device, weeks, dataUsage?: { cycleStartDate, totalBytesInCycle, totalFormatted, mobile?, wifi?, byWeek? } }
 */
// CORS headers for device sync requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export const POST: APIRoute = async ({ request }) => {
  try {
    // ============================================
    // DATABASE VERIFICATION - Check we're connected to the right DB
    // ============================================
    devLog.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    devLog.log("🔍 DATABASE VERIFICATION");
    devLog.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
      // Test database connection
      const dbTest = await db.select().from(Wisephone).limit(1);
      devLog.log("✅ Database connection: OK");
      devLog.log(`📊 Sample Wisephone records: ${dbTest.length} found`);

      // Count total devices and verify we're hitting the right DB
      const allDevices = await db.select().from(Wisephone);
      devLog.log(`📱 Total devices in Wisephone table: ${allDevices.length}`);
      if (allDevices.length > 0) {
        devLog.log(
          `   Sample IMEIs: ${allDevices
            .slice(0, 3)
            .map((d) => d.imei)
            .join(", ")}`
        );

        // Check for the specific device to verify we're hitting remote DB
        const testImei = 350256489950778;
        const testDevice = allDevices.find((d) => d.imei === testImei);
        if (testDevice) {
          devLog.log(`\n🔍 VERIFICATION: Checking device ${testImei}:`);
          devLog.log(`   Current nickname in DB: "${testDevice.nickname}"`);
          devLog.log(`   Expected nickname (remote): "surya 0778"`);
          if (testDevice.nickname === "surya 0778") {
            devLog.log(`   ✅ Database matches remote (nickname is correct)`);
            devLog.log(`   ✅ CONFIRMED: Connected to REMOTE database`);
          } else {
            devLog.log(`   ❌ ERROR: Database nickname doesn't match remote!`);
            devLog.log(`   ❌ WARNING: This suggests we're hitting LOCAL SQLite, not remote DB!`);
            devLog.log(`   ❌ Current nickname: "${testDevice.nickname}"`);
            devLog.log(`   ❌ Expected nickname: "surya 0778"`);
            devLog.log(`\n⚠️  ACTION REQUIRED: Stop server and run: npm run dev:remote`);
          }
        } else {
          devLog.log(`\n⚠️  WARNING: Device ${testImei} not found in database!`);
        }
      }

      // Count existing DeviceScreenTimeMetrics records (one row per IMEI)
      const existingMetrics = await db.select().from(DeviceScreenTimeMetrics).limit(5);
      devLog.log(`📊 Existing DeviceScreenTimeMetrics records (sample): ${existingMetrics.length}`);
      if (existingMetrics.length > 0) {
        devLog.log(`   Sample IMEIs with data: ${existingMetrics.map((d) => d.imei).join(", ")}`);
      }

      // Show database environment info
      // Astro DB uses ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN for remote connection
      const astroRemoteUrl = import.meta.env.ASTRO_DB_REMOTE_URL;
      const astroAppToken = import.meta.env.ASTRO_DB_APP_TOKEN;

      // Also check for legacy Turso env vars
      const tursoUrl = import.meta.env.TURSO_DATABASE_URL;

      devLog.log(`🌍 Environment: ${import.meta.env.MODE || "unknown"}`);

      if (astroRemoteUrl || tursoUrl) {
        const dbUrl = astroRemoteUrl || tursoUrl;
        // Extract database name from URL (format: libsql://database-name.turso.io)
        const urlMatch = dbUrl.match(/libsql:\/\/([^\.]+)\.turso\.io/);
        const dbName = urlMatch ? urlMatch[1] : "unknown";
        devLog.log(`🔗 Database Type: Turso (remote)`);
        devLog.log(`📛 Database Name: ${dbName}`);
        devLog.log(`🔗 Database URL: ${dbUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`); // Hide credentials
        devLog.log(`🔑 Remote Token: ${astroAppToken ? "✅ Set" : "❌ Missing"}`);
      } else {
        // Local SQLite - try to get database name from config
        const dbPath = import.meta.env.DATABASE_PATH || ".astro/db.sqlite";
        const dbName = dbPath.split("/").pop() || "db.sqlite";
        devLog.log(`🔗 Database Type: Local SQLite`);
        devLog.log(`📛 Database Name: ${dbName}`);
        devLog.log(`📁 Database Path: ${dbPath}`);
        devLog.log(`\n❌ ERROR: Using LOCAL SQLite database!`);
        devLog.log(`⚠️  This means data will NOT sync to remote database!`);
        devLog.log(`\n💡 SOLUTION: Stop the server and run:`);
        devLog.log(`   npm run dev:remote`);
        devLog.log(`\n   Or set these environment variables:`);
        devLog.log(`   ASTRO_DB_REMOTE_URL=libsql://your-db.turso.io`);
        devLog.log(`   ASTRO_DB_APP_TOKEN=your-token`);
        devLog.log(`\n⚠️  Current request will use LOCAL database only!`);
      }

      devLog.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // Check if DeviceScreenTimeMetrics table exists (created from Astro DB config)
      try {
        await db.select().from(DeviceScreenTimeMetrics).limit(1);
        devLog.log(`✅ DeviceScreenTimeMetrics table exists`);
      } catch (tableError: any) {
        if (tableError?.code === "SQLITE_UNKNOWN" || tableError?.message?.includes("no such table")) {
          devLog.log(`⚠️ DeviceScreenTimeMetrics table missing — run: astro db push`);
          throw tableError;
        }
        throw tableError;
      }
    } catch (dbError) {
      devLog.error("❌ Database connection failed:", dbError);
      return new Response(
        JSON.stringify({
          error: "Database connection failed",
          message: dbError instanceof Error ? dbError.message : "Unknown database error"
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

    // API key authentication - device uses a shared secret
    const authHeader = request.headers.get("Authorization");
    const expectedKey = import.meta.env.DEVICE_SYNC_API_KEY;

    if (!expectedKey) {
      devLog.error("DEVICE_SYNC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured without Api key" }), {
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

    const body = await request.json();
    devLog.log("========================================");
    devLog.log("📥 NEW SCREEN TIME DATA RECEIVED");
    devLog.log("========================================");
    devLog.log("Full payload:", JSON.stringify(body, null, 2));
    devLog.log("========================================");

    const { device, weeks, collectedAt, dataUsage: dataUsagePayload } = body;

    // Validate required fields - accept either IMEI or phone number
    if (!device?.imei && !device?.phoneNumber) {
      return new Response(JSON.stringify({ error: "Missing device IMEI or phone number" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    if (!weeks || !Array.isArray(weeks)) {
      return new Response(JSON.stringify({ error: "Missing weeks data" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Lookup device - try IMEI first, then phone number as fallback
    let wisephone = null;
    let imeiNumber: number | null = null;
    let imeiString: string = "";

    if (device.imei) {
      // Try IMEI lookup first (primary method)
      imeiNumber = typeof device.imei === "string" ? parseInt(device.imei, 10) : Number(device.imei);

      if (isNaN(imeiNumber)) {
        return new Response(JSON.stringify({ error: "Invalid IMEI format" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }

      devLog.log(`🔍 Looking up device with IMEI: ${imeiNumber} (type: ${typeof imeiNumber})`);
      wisephone = await db.select().from(Wisephone).where(eq(Wisephone.imei, imeiNumber)).get();
      devLog.log(`📱 Wisephone lookup result (IMEI):`, wisephone ? `Found device: ${JSON.stringify(wisephone)}` : "NOT FOUND");
    }

    // If IMEI lookup failed, try phone number lookup
    if (!wisephone && device.phoneNumber) {
      devLog.log(`📞 IMEI not provided or not found, trying phone number lookup: ${device.phoneNumber}`);
      
      // Validate phone number format (XXX-XXX-XXXX)
      const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
      if (!phoneRegex.test(device.phoneNumber)) {
        return new Response(JSON.stringify({ error: `Invalid phone number format. Expected XXX-XXX-XXXX (got: "${device.phoneNumber}")` }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }

      wisephone = await db.select().from(Wisephone).where(eq(Wisephone.phoneNumber, device.phoneNumber)).get();
      devLog.log(`📱 Wisephone lookup result (Phone):`, wisephone ? `Found device: ${JSON.stringify(wisephone)}` : "NOT FOUND");
      
      if (wisephone) {
        imeiNumber = wisephone.imei;
        imeiString = String(wisephone.imei);
        devLog.log(`✅ Found IMEI via phone number lookup: ${imeiString}`);
      }
    }

    if (!wisephone) {
      return new Response(JSON.stringify({ error: "Unknown device" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    const imeiString = String(device.imei);
    devLog.log(`📊 Building screenTimeDetail for IMEI: ${imeiString} (${weeks.length} weeks) — only this device's row will be updated`);


    // Build screenTimeDetail from payload (same structure as before, stored in one JSON column)
    const screenTimeDetailWeeks: Array<{
      weekStartDate: string;
      weekEndDate: string;
      totalScreenTimeMs: number;
      dailyAverageMs: number;
      days?: Array<{
        date: string;
        totalScreenTimeMs: number;
        apps?: Array<{ packageName: string; appName: string; totalTimeMs: number }>;
      }>;
      apps: Array<{
        packageName: string;
        appName: string;
        totalTimeMs: number;
        dailyAverageMs: number;
      }>;
    }> = [];

    for (let i = 0; i < weeks.length; i++) {
      const week = weeks[i];
      let weekStart: Date | null = null;
      let weekEnd: Date | null = null;

      if (week.startDate && week.endDate) {
        weekStart = new Date(week.startDate + "T00:00:00.000Z");
        weekEnd = new Date(week.endDate + "T23:59:59.999Z");
      } else if (week.startDateFormatted && week.endDateFormatted) {
        weekStart = parseWeekDate(week.startDateFormatted);
        weekEnd = parseWeekDate(week.endDateFormatted);
      }

      if (!weekStart || !weekEnd) {
        devLog.warn(`⚠️  Skipping week ${i + 1} with invalid dates`);
        continue;
      }

      const totalScreenTimeMs = week.totalScreenTime ?? week.totalScreenTimeMs ?? 0;
      const dailyAverageMs = week.dailyAverage ?? week.dailyAverageMs ?? 0;

      const days =
        week.days && Array.isArray(week.days)
          ? week.days.map((day: any) => ({
              date: day.date,
              totalScreenTimeMs: day.totalScreenTime ?? 0,
              apps: (day.apps || []).map((app: any) => ({
                packageName: app.packageName ?? "",
                appName: app.appName ?? "",
                totalTimeMs: app.totalTime ?? 0
              }))
            }))
          : undefined;

      const apps = (week.apps || []).map((app: any) => ({
        packageName: app.packageName ?? "",
        appName: app.appName ?? "",
        totalTimeMs: app.totalTime ?? app.totalTimeMs ?? 0,
        dailyAverageMs: app.dailyAverage ?? app.dailyAverageMs ?? 0
      }));

      screenTimeDetailWeeks.push({
        weekStartDate: weekStart.toISOString().slice(0, 10),
        weekEndDate: weekEnd.toISOString().slice(0, 10),
        totalScreenTimeMs,
        dailyAverageMs,
        ...(days && { days }),
        apps
      });
    }

    const screenTimeDetail = { weeks: screenTimeDetailWeeks };
    const syncedAt = new Date();
    const deviceName = device.deviceName ?? device.deviceId ?? null;
    const deviceManufacturer = device.manufacturer ?? null;

    // Upsert: update only this IMEI's row (or insert if first sync). No other rows are touched.
    const existingRow = await db
      .select()
      .from(DeviceScreenTimeMetrics)
      .where(eq(DeviceScreenTimeMetrics.imei, imeiString))
      .get();

    if (existingRow) {
      await db
        .update(DeviceScreenTimeMetrics)
        .set({
          syncedAt,
          deviceName,
          deviceManufacturer,
          screenTimeDetail
        })
        .where(eq(DeviceScreenTimeMetrics.imei, imeiString));
      devLog.log(`   ✅ Updated existing row for IMEI: ${imeiString}`);
    } else {
      await db.insert(DeviceScreenTimeMetrics).values({
        imei: imeiString,
        syncedAt,
        deviceName,
        deviceManufacturer,
        screenTimeDetail
      });
      devLog.log(`   ✅ Inserted new row for IMEI: ${imeiString}`);
    }

    // Upsert data usage for this IMEI when provided (same sync request)
    if (dataUsagePayload && typeof dataUsagePayload === "object") {
      const cycleStartDate =
        dataUsagePayload.cycleStartDate != null
          ? new Date(dataUsagePayload.cycleStartDate)
          : undefined;
      const usageDetail = {
        totalBytesInCycle: dataUsagePayload.totalBytesInCycle ?? 0,
        totalFormatted: dataUsagePayload.totalFormatted ?? null,
        mobile: dataUsagePayload.mobile ?? null,
        wifi: dataUsagePayload.wifi ?? null,
        byWeek: dataUsagePayload.byWeek ?? []
      };
      const lastSyncedAt = new Date();
      const existingDataUsage = await db
        .select()
        .from(DeviceDataUsage)
        .where(eq(DeviceDataUsage.imei, imeiString))
        .get();
      if (existingDataUsage) {
        await db
          .update(DeviceDataUsage)
          .set({ cycleStartDate, usageDetail, lastSyncedAt })
          .where(eq(DeviceDataUsage.imei, imeiString));
        devLog.log(`   ✅ Updated DeviceDataUsage row for IMEI: ${imeiString}`);
      } else {
        await db.insert(DeviceDataUsage).values({
          imei: imeiString,
          cycleStartDate,
          usageDetail,
          lastSyncedAt
        });
        devLog.log(`   ✅ Inserted DeviceDataUsage row for IMEI: ${imeiString}`);
      }
    }

    devLog.log(`\n📊 Sync Summary: ${screenTimeDetailWeeks.length} weeks — single row updated for IMEI ${imeiString}`);

    // Verify only this device's row exists and was updated
    const verifyRow = await db
      .select()
      .from(DeviceScreenTimeMetrics)
      .where(eq(DeviceScreenTimeMetrics.imei, imeiString))
      .get();
    if (verifyRow) {
      devLog.log(`   📋 Verified: row for IMEI ${imeiString} has ${(verifyRow.screenTimeDetail as any)?.weeks?.length ?? 0} weeks`);
    } else {
      devLog.warn(`   ⚠️  WARNING: No row found for IMEI ${imeiString} after sync!`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        syncedWeeks: screenTimeDetailWeeks.length,
        timestamp: syncedAt.toISOString()
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
    devLog.error("Error syncing device stats:", error);
    return new Response(
      JSON.stringify({
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

/**
 * Parse a short date format (e.g., "Dec 9") into a full Date object.
 * Assumes the date is in the current year or previous year if the month is ahead.
 */
function parseWeekDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };

  const parts = dateStr.split(" ");
  if (parts.length !== 2) return null;

  const month = months[parts[0]];
  const day = parseInt(parts[1], 10);

  if (month === undefined || isNaN(day)) return null;

  const now = new Date();
  let year = now.getFullYear();

  // If the parsed month is ahead of current month, it's likely from last year
  if (month > now.getMonth()) {
    year--;
  }

  return new Date(year, month, day);
}
