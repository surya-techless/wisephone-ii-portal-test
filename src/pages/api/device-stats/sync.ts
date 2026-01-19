import type { APIRoute } from "astro";
import {
  db,
  DeviceScreenTime,
  DeviceAppUsage,
  DeviceDailyScreenTime,
  DeviceDailyAppUsage,
  Wisephone,
  eq,
  sql
} from "astro:db";
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

// Table 1: DeviceScreenTime (Weekly Summary)
//   ┌────────────────────┬────────────────────┬────────────────────────────────────┐
//   │       Column       │        Type        │            Description             │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ id                 │ INTEGER (PK, auto) │ Unique row ID                      │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ imei               │ TEXT               │ Device IMEI                        │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ weekStartDate      │ DATE               │ Start of week (used as lookup key) │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ weekEndDate        │ DATE               │ End of week                        │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ totalScreenTimeMs  │ INTEGER            │ Total screen time in milliseconds  │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ dailyAverageMs     │ INTEGER            │ Daily average in ms                │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ syncedAt           │ DATE               │ When data was synced               │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ deviceName         │ TEXT (optional)    │ Device model                       │
//   ├────────────────────┼────────────────────┼────────────────────────────────────┤
//   │ deviceManufacturer │ TEXT (optional)    │ Manufacturer                       │
//   └────────────────────┴────────────────────┴────────────────────────────────────┘
//   ---
//   Table 2: DeviceAppUsage (Weekly App Breakdown)
//   ┌────────────────┬────────────────────┬──────────────────────────────┐
//   │     Column     │        Type        │         Description          │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ id             │ INTEGER (PK, auto) │ Unique row ID                │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ screenTimeId   │ INTEGER (FK)       │ Links to DeviceScreenTime.id │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ imei           │ TEXT               │ For easier querying          │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ packageName    │ TEXT               │ Android app package          │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ appName        │ TEXT               │ Human-readable name          │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ totalTimeMs    │ INTEGER            │ Total usage for the week     │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ dailyAverageMs │ INTEGER            │ Daily average                │
//   ├────────────────┼────────────────────┼──────────────────────────────┤
//   │ weekStartDate  │ DATE               │ For easier querying          │
//   └────────────────┴────────────────────┴──────────────────────────────┘
//   ---
//   Table 3: DeviceDailyScreenTime (Daily Breakdown)
//   ┌───────────────────┬────────────────────┬──────────────────────────────┐
//   │      Column       │        Type        │         Description          │
//   ├───────────────────┼────────────────────┼──────────────────────────────┤
//   │ id                │ INTEGER (PK, auto) │ Unique row ID                │
//   ├───────────────────┼────────────────────┼──────────────────────────────┤
//   │ screenTimeId      │ INTEGER (FK)       │ Links to DeviceScreenTime.id │
//   ├───────────────────┼────────────────────┼──────────────────────────────┤
//   │ imei              │ TEXT               │ For easier querying          │
//   ├───────────────────┼────────────────────┼──────────────────────────────┤
//   │ date              │ DATE               │ Specific day                 │
//   ├───────────────────┼────────────────────┼──────────────────────────────┤
//   │ totalScreenTimeMs │ INTEGER            │ Screen time for that day     │
//   ├───────────────────┼────────────────────┼──────────────────────────────┤
//   │ weekStartDate     │ DATE               │ For easier querying          │
//   └───────────────────┴────────────────────┴──────────────────────────────┘
//   ---
//   Table 4: DeviceDailyAppUsage (Daily App Breakdown)
//   ┌───────────────────┬────────────────────┬───────────────────────────────────┐
//   │      Column       │        Type        │            Description            │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ id                │ INTEGER (PK, auto) │ Unique row ID                     │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ dailyScreenTimeId │ INTEGER (FK)       │ Links to DeviceDailyScreenTime.id │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ screenTimeId      │ INTEGER (FK)       │ Links to DeviceScreenTime.id      │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ imei              │ TEXT               │ For easier querying               │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ date              │ DATE               │ Specific day                      │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ packageName       │ TEXT               │ Android app package               │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ appName           │ TEXT               │ Human-readable name               │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ totalTimeMs       │ INTEGER            │ Usage for that day                │
//   ├───────────────────┼────────────────────┼───────────────────────────────────┤
//   │ weekStartDate     │ DATE               │ For easier querying               │
//   └───────────────────┴────────────────────┴───────────────────────────────────┘


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

      // Check if all screen time tables exist, create if any are missing
      let tablesExist = true;
      const tablesToCheck = [
        { name: "DeviceScreenTime", table: DeviceScreenTime },
        { name: "DeviceAppUsage", table: DeviceAppUsage },
        { name: "DeviceDailyScreenTime", table: DeviceDailyScreenTime },
        { name: "DeviceDailyAppUsage", table: DeviceDailyAppUsage }
      ];

      for (const { name, table } of tablesToCheck) {
        try {
          await db.select().from(table).limit(1);
          console.log(`✅ ${name} table exists`);
        } catch (tableError: any) {
          if (tableError?.code === "SQLITE_UNKNOWN" || tableError?.message?.includes("no such table")) {
            console.log(`⚠️ ${name} table missing`);
            tablesExist = false;
          } else {
            throw tableError;
          }
        }
      }

      if (!tablesExist) {
        console.log("⚠️ Some screen time tables are missing, creating all tables...");
        await createScreenTimeTables();
        console.log("✅ All screen time tables created successfully");
      }
    } catch (dbError) {
      console.error("❌ Database connection failed:", dbError);
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
      console.error("DEVICE_SYNC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
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
    console.log("========================================");
    console.log("📥 NEW SCREEN TIME DATA RECEIVED");
    console.log("========================================");
    console.log("Full payload:", JSON.stringify(body, null, 2));
    console.log("========================================");

    const { device, weeks, collectedAt } = body;

    // Validate required fields
    if (!device?.imei) {
      return new Response(JSON.stringify({ error: "Missing device IMEI" }), {
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

    // Validate IMEI exists in our system
    // Convert IMEI to number for Wisephone table lookup (IMEI is stored as number there)
    const imeiNumber = typeof device.imei === "string" ? parseInt(device.imei, 10) : Number(device.imei);

    if (isNaN(imeiNumber)) {
      return new Response(JSON.stringify({ error: "Invalid IMEI format" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    console.log(`🔍 Looking up device with IMEI: ${imeiNumber} (type: ${typeof imeiNumber})`);
    const wisephone = await db.select().from(Wisephone).where(eq(Wisephone.imei, imeiNumber)).get();

    console.log(`📱 Wisephone lookup result:`, wisephone ? `Found device: ${JSON.stringify(wisephone)}` : "NOT FOUND");

    if (!wisephone) {
      return new Response(JSON.stringify({ error: "Unknown device" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Delete ALL existing data for this IMEI (fresh insert approach)
    // Device always sends complete 4-week snapshot, so we replace everything
    const imeiString = String(device.imei);
    console.log(`🗑️  Deleting all existing data for IMEI: ${imeiString}...`);

    // Delete in order: child tables first, then parent
    await db.delete(DeviceDailyAppUsage).where(eq(DeviceDailyAppUsage.imei, imeiString));
    await db.delete(DeviceDailyScreenTime).where(eq(DeviceDailyScreenTime.imei, imeiString));
    await db.delete(DeviceAppUsage).where(eq(DeviceAppUsage.imei, imeiString));
    await db.delete(DeviceScreenTime).where(eq(DeviceScreenTime.imei, imeiString));
    console.log(`✅ Deleted existing data for IMEI: ${imeiString}`);

    let syncedWeeks = 0;
    let syncedApps = 0;
    let syncedDays = 0;
    let syncedDailyApps = 0;

    console.log(`📊 Processing ${weeks.length} weeks of data...`);

    // Process each week's data (always INSERT since we deleted everything)
    for (let i = 0; i < weeks.length; i++) {
      const week = weeks[i];
      console.log(`\n📅 Processing week ${i + 1}/${weeks.length}: ${week.weekLabel || "Unknown"}`);

      // Parse dates - new format uses "YYYY-MM-DD" strings, old format uses formatted strings
      let weekStart: Date | null = null;
      let weekEnd: Date | null = null;

      if (week.startDate && week.endDate) {
        // New format: "YYYY-MM-DD" strings
        console.log(`   📅 New format detected: startDate="${week.startDate}", endDate="${week.endDate}"`);
        weekStart = new Date(week.startDate + "T00:00:00.000Z");
        weekEnd = new Date(week.endDate + "T23:59:59.999Z");
      } else if (week.startDateFormatted && week.endDateFormatted) {
        // Old format: formatted strings like "Dec 9"
        console.log(
          `   📅 Old format detected: startDateFormatted="${week.startDateFormatted}", endDateFormatted="${week.endDateFormatted}"`
        );
        weekStart = parseWeekDate(week.startDateFormatted);
        weekEnd = parseWeekDate(week.endDateFormatted);
      }

      console.log(`   Parsed start date: ${weekStart ? weekStart.toISOString() : "NULL"}`);
      console.log(`   Parsed end date: ${weekEnd ? weekEnd.toISOString() : "NULL"}`);

      if (!weekStart || !weekEnd) {
        console.warn(`⚠️  Skipping week ${i + 1} with invalid dates`);
        continue;
      }

      // Insert new DeviceScreenTime record (we already deleted all old data for this IMEI)
      console.log(`   ➕ Inserting DeviceScreenTime record...`);
      const insertData = {
        imei: imeiString,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        totalScreenTimeMs: week.totalScreenTime || week.totalScreenTimeMs || 0,
        dailyAverageMs: week.dailyAverage || week.dailyAverageMs || 0,
        syncedAt: new Date(),
        deviceName: device.deviceName || device.deviceId,
        deviceManufacturer: device.manufacturer
      };

      let screenTimeId: number;
      try {
        const result = await db.insert(DeviceScreenTime).values(insertData);
        screenTimeId = Number(result.lastInsertRowid);
        console.log(`   ✅ Inserted DeviceScreenTime record (ID: ${screenTimeId})`);
      } catch (insertError: any) {
        console.error(`   ❌ Error inserting DeviceScreenTime:`, insertError);
        throw insertError;
      }

      // Insert daily breakdown data (new format)
      if (week.days && Array.isArray(week.days) && week.days.length > 0) {
        console.log(`   📅 Inserting ${week.days.length} daily screen time records...`);
        let weekSyncedDays = 0;
        let weekSyncedDailyApps = 0;

        for (const day of week.days) {
          const dayDate = new Date(day.date + "T00:00:00.000Z");
          const dayScreenTimeMs = day.totalScreenTime || 0;

          // Insert daily screen time record
          let dailyScreenTimeId: number;
          try {
            const dailyResult = await db.insert(DeviceDailyScreenTime).values({
              screenTimeId,
              imei: imeiString,
              date: dayDate,
              totalScreenTimeMs: dayScreenTimeMs,
              weekStartDate: weekStart
            });

            dailyScreenTimeId = Number(dailyResult.lastInsertRowid);
            weekSyncedDays++;
            console.log(`   📅 Inserted daily record ID: ${dailyScreenTimeId} for date: ${dayDate.toISOString()}`);
          } catch (dailyError: any) {
            console.error(`   ❌ Error inserting DeviceDailyScreenTime for date ${dayDate}:`, dailyError);
            throw dailyError;
          }

          // Insert daily app usage
          if (day.apps && Array.isArray(day.apps) && day.apps.length > 0) {
            const dailyAppRecords = day.apps.map((app: any) => ({
              dailyScreenTimeId,
              screenTimeId,
              imei: imeiString,
              date: dayDate,
              packageName: app.packageName,
              appName: app.appName,
              totalTimeMs: app.totalTime || 0,
              weekStartDate: weekStart
            }));

            try {
              await db.insert(DeviceDailyAppUsage).values(dailyAppRecords);
              weekSyncedDailyApps += dailyAppRecords.length;
              console.log(
                `   📱 Inserted ${dailyAppRecords.length} daily app records for date: ${dayDate.toISOString()}`
              );
            } catch (dailyAppError: any) {
              console.error(`   ❌ Error inserting DeviceDailyAppUsage for date ${dayDate}:`, dailyAppError);
              throw dailyAppError;
            }
          }
        }

        syncedDays += weekSyncedDays;
        syncedDailyApps += weekSyncedDailyApps;
        console.log(
          `   ✅ Inserted ${weekSyncedDays} daily records and ${weekSyncedDailyApps} daily app usage records`
        );
      }

      // Insert weekly app usage data (for backward compatibility and weekly aggregates)
      if (week.apps && Array.isArray(week.apps) && week.apps.length > 0) {
        console.log(`   📱 Inserting ${week.apps.length} weekly app usage records...`);
        const appRecords = week.apps.map((app: any) => ({
          screenTimeId,
          imei: imeiString,
          packageName: app.packageName,
          appName: app.appName,
          totalTimeMs: app.totalTime || app.totalTimeMs || 0,
          dailyAverageMs: app.dailyAverage || app.dailyAverageMs || 0,
          weekStartDate: weekStart
        }));

        console.log(`   📝 App records sample (first 2):`, JSON.stringify(appRecords.slice(0, 2), null, 2));

        try {
          await db.insert(DeviceAppUsage).values(appRecords);
          syncedApps += appRecords.length;
          console.log(`   ✅ Inserted ${appRecords.length} DeviceAppUsage records`);

          // Verify the inserts
          const verifyApps = await db
            .select()
            .from(DeviceAppUsage)
            .where(eq(DeviceAppUsage.screenTimeId, screenTimeId));
          console.log(
            `   🔍 Verification: Found ${verifyApps.length} app records in DB for screenTimeId ${screenTimeId}`
          );
        } catch (appError: any) {
          console.error(`   ❌ Error inserting DeviceAppUsage:`, appError);
          console.error(`   ❌ Error code:`, appError?.code);
          console.error(`   ❌ Error message:`, appError?.message);
          throw appError;
        }
      } else {
        console.log(`   ⚠️  No apps data for this week`);
      }

      syncedWeeks++;
      console.log(`   ✅ Completed week ${i + 1}/${weeks.length}`);
    }

    console.log(
      `\n📊 Sync Summary: ${syncedWeeks} weeks, ${syncedApps} weekly apps, ${syncedDays} days, ${syncedDailyApps} daily apps`
    );

    // Final verification: Query all records for this IMEI
    console.log(`\n🔍 Final Verification: Querying all DeviceScreenTime records for IMEI: ${imeiString}`);
    try {
      const allRecords = await db
        .select()
        .from(DeviceScreenTime)
        .where(eq(DeviceScreenTime.imei, imeiString))
        .orderBy(sql`${DeviceScreenTime.weekStartDate} DESC`)
        .limit(10);
      console.log(`   📊 Found ${allRecords.length} total DeviceScreenTime records for this IMEI`);
      if (allRecords.length > 0) {
        console.log(`   📋 Latest record:`, JSON.stringify(allRecords[0], null, 2));
      } else {
        console.warn(`   ⚠️  WARNING: No records found in database for IMEI ${imeiString} after sync!`);
      }
    } catch (verifyError: any) {
      console.error(`   ❌ Error verifying records:`, verifyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        syncedWeeks,
        syncedApps,
        syncedDays,
        syncedDailyApps,
        timestamp: new Date().toISOString()
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
    console.error("Error syncing device stats:", error);
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
 * Create screen time tables if they don't exist
 * This handles the case where tables are missing in remote/production DB
 */
async function createScreenTimeTables() {
  console.log("🔨 Creating DeviceScreenTime table...");
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS DeviceScreenTime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imei TEXT NOT NULL,
      weekStartDate TEXT NOT NULL,
      weekEndDate TEXT NOT NULL,
      totalScreenTimeMs INTEGER NOT NULL,
      dailyAverageMs INTEGER NOT NULL,
      syncedAt TEXT NOT NULL DEFAULT (datetime('now')),
      deviceName TEXT,
      deviceManufacturer TEXT
    )
  `);

  console.log("🔨 Creating DeviceAppUsage table...");
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS DeviceAppUsage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screenTimeId INTEGER NOT NULL,
      imei TEXT NOT NULL,
      packageName TEXT NOT NULL,
      appName TEXT NOT NULL,
      totalTimeMs INTEGER NOT NULL,
      dailyAverageMs INTEGER NOT NULL,
      weekStartDate TEXT NOT NULL
    )
  `);

  console.log("🔨 Creating DeviceDailyScreenTime table...");
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS DeviceDailyScreenTime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screenTimeId INTEGER NOT NULL,
      imei TEXT NOT NULL,
      date TEXT NOT NULL,
      totalScreenTimeMs INTEGER NOT NULL,
      weekStartDate TEXT NOT NULL
    )
  `);

  console.log("🔨 Creating DeviceDailyAppUsage table...");
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS DeviceDailyAppUsage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dailyScreenTimeId INTEGER NOT NULL,
      screenTimeId INTEGER NOT NULL,
      imei TEXT NOT NULL,
      date TEXT NOT NULL,
      packageName TEXT NOT NULL,
      appName TEXT NOT NULL,
      totalTimeMs INTEGER NOT NULL,
      weekStartDate TEXT NOT NULL
    )
  `);

  console.log("🔨 Creating indexes...");
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_app_usage_screen_time_id ON DeviceAppUsage(screenTimeId)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_app_usage_imei_week ON DeviceAppUsage(imei, weekStartDate)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_screen_time_id ON DeviceDailyScreenTime(screenTimeId)`);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_device_daily_screen_time_imei_date ON DeviceDailyScreenTime(imei, date)`
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_device_daily_screen_time_imei_week ON DeviceDailyScreenTime(imei, weekStartDate)`
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_daily_id ON DeviceDailyAppUsage(dailyScreenTimeId)`
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_screen_time_id ON DeviceDailyAppUsage(screenTimeId)`
  );
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_imei_date ON DeviceDailyAppUsage(imei, date)`);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_imei_week ON DeviceDailyAppUsage(imei, weekStartDate)`
  );

  console.log("✅ All screen time tables and indexes created");
}

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
