import type { APIRoute } from "astro";
import { db, DeviceScreenTime, DeviceAppUsage, Wisephone, eq, and, sql } from "astro:db";
import { captureException } from "@sentry/astro";

/**
 * POST /api/device-stats/sync
 *
 * Endpoint for WiseOS devices to push their screen time statistics.
 * Device sends weekly app breakdown data which is upserted into the database.
 *
 * Expected payload format (from getWeeklyAppBreakdown):
 * {
 *   device: { imei, deviceName, deviceId, manufacturer },
 *   weeks: [{
 *     weekLabel, startDateFormatted, endDateFormatted,
 *     totalScreenTime, dailyAverage,
 *     apps: [{ packageName, appName, totalTime, dailyAverage }]
 *   }]
 * }
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // ============================================
    // DATABASE VERIFICATION - Check we're connected to the right DB
    // ============================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 DATABASE VERIFICATION");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
      // Test database connection
      const dbTest = await db.select().from(Wisephone).limit(1);
      console.log("✅ Database connection: OK");
      console.log(`📊 Sample Wisephone records: ${dbTest.length} found`);

      // Count total devices and verify we're hitting the right DB
      const allDevices = await db.select().from(Wisephone);
      console.log(`📱 Total devices in Wisephone table: ${allDevices.length}`);
      if (allDevices.length > 0) {
        console.log(
          `   Sample IMEIs: ${allDevices
            .slice(0, 3)
            .map((d) => d.imei)
            .join(", ")}`
        );

        // Check for the specific device to verify we're hitting remote DB
        const testImei = 350256489950778;
        const testDevice = allDevices.find((d) => d.imei === testImei);
        if (testDevice) {
          console.log(`\n🔍 VERIFICATION: Checking device ${testImei}:`);
          console.log(`   Current nickname in DB: "${testDevice.nickname}"`);
          console.log(`   Expected nickname (remote): "surya 0778"`);
          if (testDevice.nickname === "surya 0778") {
            console.log(`   ✅ Database matches remote (nickname is correct)`);
            console.log(`   ✅ CONFIRMED: Connected to REMOTE database`);
          } else {
            console.log(`   ❌ ERROR: Database nickname doesn't match remote!`);
            console.log(`   ❌ WARNING: This suggests we're hitting LOCAL SQLite, not remote DB!`);
            console.log(`   ❌ Current nickname: "${testDevice.nickname}"`);
            console.log(`   ❌ Expected nickname: "surya 0778"`);
            console.log(`\n⚠️  ACTION REQUIRED: Stop server and run: npm run dev:remote`);
          }
        } else {
          console.log(`\n⚠️  WARNING: Device ${testImei} not found in database!`);
        }
      }

      // Count existing DeviceScreenTime records
      const existingScreenTime = await db.select().from(DeviceScreenTime).limit(5);
      console.log(`📊 Existing DeviceScreenTime records (sample): ${existingScreenTime.length}`);
      if (existingScreenTime.length > 0) {
        console.log(`   Sample IMEIs with data: ${[...new Set(existingScreenTime.map((d) => d.imei))].join(", ")}`);
      }

      // Count existing DeviceAppUsage records
      const existingAppUsage = await db.select().from(DeviceAppUsage).limit(5);
      console.log(`📱 Existing DeviceAppUsage records (sample): ${existingAppUsage.length}`);

      // Show database environment info
      // Astro DB uses ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN for remote connection
      const astroRemoteUrl = import.meta.env.ASTRO_DB_REMOTE_URL;
      const astroAppToken = import.meta.env.ASTRO_DB_APP_TOKEN;

      // Also check for legacy Turso env vars
      const tursoUrl = import.meta.env.TURSO_DATABASE_URL;

      console.log(`🌍 Environment: ${import.meta.env.MODE || "unknown"}`);

      if (astroRemoteUrl || tursoUrl) {
        const dbUrl = astroRemoteUrl || tursoUrl;
        // Extract database name from URL (format: libsql://database-name.turso.io)
        const urlMatch = dbUrl.match(/libsql:\/\/([^\.]+)\.turso\.io/);
        const dbName = urlMatch ? urlMatch[1] : "unknown";
        console.log(`🔗 Database Type: Turso (remote)`);
        console.log(`📛 Database Name: ${dbName}`);
        console.log(`🔗 Database URL: ${dbUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`); // Hide credentials
        console.log(`🔑 Remote Token: ${astroAppToken ? "✅ Set" : "❌ Missing"}`);
      } else {
        // Local SQLite - try to get database name from config
        const dbPath = import.meta.env.DATABASE_PATH || ".astro/db.sqlite";
        const dbName = dbPath.split("/").pop() || "db.sqlite";
        console.log(`🔗 Database Type: Local SQLite`);
        console.log(`📛 Database Name: ${dbName}`);
        console.log(`📁 Database Path: ${dbPath}`);
        console.log(`\n❌ ERROR: Using LOCAL SQLite database!`);
        console.log(`⚠️  This means data will NOT sync to remote database!`);
        console.log(`\n💡 SOLUTION: Stop the server and run:`);
        console.log(`   npm run dev:remote`);
        console.log(`\n   Or set these environment variables:`);
        console.log(`   ASTRO_DB_REMOTE_URL=libsql://your-db.turso.io`);
        console.log(`   ASTRO_DB_APP_TOKEN=your-token`);
        console.log(`\n⚠️  Current request will use LOCAL database only!`);
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } catch (dbError) {
      console.error("❌ Database connection failed:", dbError);
      return new Response(
        JSON.stringify({
          error: "Database connection failed",
          message: dbError instanceof Error ? dbError.message : "Unknown database error"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // API key authentication - device uses a shared secret
    const authHeader = request.headers.get("Authorization");
    const expectedKey = import.meta.env.DEVICE_SYNC_API_KEY;

    if (!expectedKey) {
      console.error("DEVICE_SYNC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    console.log("Incoming POST data:", JSON.stringify(body, null, 2));
    const { device, weeks } = body;

    // Validate required fields
    if (!device?.imei) {
      return new Response(JSON.stringify({ error: "Missing device IMEI" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!weeks || !Array.isArray(weeks)) {
      return new Response(JSON.stringify({ error: "Missing weeks data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Validate IMEI exists in our system
    // Convert IMEI to number for Wisephone table lookup (IMEI is stored as number there)
    const imeiNumber = typeof device.imei === "string" ? parseInt(device.imei, 10) : Number(device.imei);

    if (isNaN(imeiNumber)) {
      return new Response(JSON.stringify({ error: "Invalid IMEI format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.log(`🔍 Looking up device with IMEI: ${imeiNumber} (type: ${typeof imeiNumber})`);
    const wisephone = await db.select().from(Wisephone).where(eq(Wisephone.imei, imeiNumber)).get();

    console.log(`📱 Wisephone lookup result:`, wisephone ? `Found device: ${JSON.stringify(wisephone)}` : "NOT FOUND");

    if (!wisephone) {
      return new Response(JSON.stringify({ error: "Unknown device" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    let syncedWeeks = 0;
    let syncedApps = 0;

    console.log(`📊 Processing ${weeks.length} weeks of data...`);

    // Process each week's data
    for (let i = 0; i < weeks.length; i++) {
      const week = weeks[i];
      console.log(`\n📅 Processing week ${i + 1}/${weeks.length}: ${week.weekLabel || "Unknown"}`);
      console.log(`   Start date string: "${week.startDateFormatted}"`);
      console.log(`   End date string: "${week.endDateFormatted}"`);

      // Parse dates from formatted strings (e.g., "Dec 9" -> actual Date)
      const weekStart = parseWeekDate(week.startDateFormatted);
      const weekEnd = parseWeekDate(week.endDateFormatted);

      console.log(`   Parsed start date: ${weekStart ? weekStart.toISOString() : "NULL"}`);
      console.log(`   Parsed end date: ${weekEnd ? weekEnd.toISOString() : "NULL"}`);

      if (!weekStart || !weekEnd) {
        console.warn(
          `⚠️  Skipping week ${i + 1} with invalid dates: ${week.startDateFormatted} - ${week.endDateFormatted}`
        );
        continue;
      }

      // Check if we already have data for this device + week
      const imeiString = String(device.imei);
      console.log(`   🔍 Checking for existing record: imei="${imeiString}", weekStart="${weekStart.toISOString()}"`);

      const existing = await db
        .select()
        .from(DeviceScreenTime)
        .where(and(eq(DeviceScreenTime.imei, imeiString), eq(DeviceScreenTime.weekStartDate, weekStart)))
        .get();

      console.log(`   📋 Existing record: ${existing ? `Found (ID: ${existing.id})` : "Not found - will insert new"}`);

      let screenTimeId: number;

      if (existing) {
        console.log(`   ✏️  Updating existing DeviceScreenTime record (ID: ${existing.id})...`);
        // Update existing record
        await db
          .update(DeviceScreenTime)
          .set({
            totalScreenTimeMs: week.totalScreenTime || 0,
            dailyAverageMs: week.dailyAverage || 0,
            syncedAt: new Date(),
            deviceName: device.deviceName,
            deviceManufacturer: device.manufacturer,
            weekEndDate: weekEnd
          })
          .where(eq(DeviceScreenTime.id, existing.id));

        screenTimeId = existing.id;
        console.log(`   ✅ Updated DeviceScreenTime record`);

        // Delete old app usage records for this week (will re-insert fresh data)
        console.log(`   🗑️  Deleting old DeviceAppUsage records for screenTimeId: ${screenTimeId}...`);
        await db.delete(DeviceAppUsage).where(eq(DeviceAppUsage.screenTimeId, screenTimeId));
        console.log(`   ✅ Deleted old DeviceAppUsage records`);
      } else {
        console.log(`   ➕ Inserting new DeviceScreenTime record...`);
        const insertData = {
          imei: imeiString,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          totalScreenTimeMs: week.totalScreenTime || 0,
          dailyAverageMs: week.dailyAverage || 0,
          syncedAt: new Date(),
          deviceName: device.deviceName,
          deviceManufacturer: device.manufacturer
        };
        console.log(`   📝 Insert data:`, JSON.stringify(insertData, null, 2));

        // Insert new screen time record
        const result = await db.insert(DeviceScreenTime).values(insertData);

        screenTimeId = Number(result.lastInsertRowid);
        console.log(`   ✅ Inserted DeviceScreenTime record (ID: ${screenTimeId})`);
      }

      // Insert app usage data for this week
      if (week.apps && Array.isArray(week.apps) && week.apps.length > 0) {
        console.log(`   📱 Inserting ${week.apps.length} app usage records...`);
        const appRecords = week.apps.map((app: any) => ({
          screenTimeId,
          imei: imeiString,
          packageName: app.packageName,
          appName: app.appName,
          totalTimeMs: app.totalTime || 0,
          dailyAverageMs: app.dailyAverage || 0,
          weekStartDate: weekStart
        }));

        console.log(`   📝 App records sample (first 2):`, JSON.stringify(appRecords.slice(0, 2), null, 2));

        await db.insert(DeviceAppUsage).values(appRecords);
        syncedApps += appRecords.length;
        console.log(`   ✅ Inserted ${appRecords.length} DeviceAppUsage records`);
      } else {
        console.log(`   ⚠️  No apps data for this week`);
      }

      syncedWeeks++;
      console.log(`   ✅ Completed week ${i + 1}/${weeks.length}`);
    }

    console.log(`\n📊 Sync Summary: ${syncedWeeks} weeks, ${syncedApps} apps`);

    return new Response(
      JSON.stringify({
        success: true,
        syncedWeeks,
        syncedApps,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    captureException(error);
    console.error("Error syncing device stats:", error);
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
