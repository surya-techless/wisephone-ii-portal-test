// db/migrate.ts
// Manual migration script to create tables in the correct order
// Run with: astro db execute db/migrate.ts --remote

import { db, sql } from "astro:db";

export default async function migrate() {
  console.log("========================================");
  console.log("🚀 Starting database migration...");
  console.log("========================================");

  try {
    // Create DeviceScreenTime table first (parent table)
    console.log("📊 Creating DeviceScreenTime table...");
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
    console.log("✅ DeviceScreenTime table created");

    // Create DeviceAppUsage table (depends on DeviceScreenTime)
    console.log("📱 Creating DeviceAppUsage table...");
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
    console.log("✅ DeviceAppUsage table created");

    // Create indexes for DeviceAppUsage
    console.log("📇 Creating indexes for DeviceAppUsage...");
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_app_usage_screen_time_id ON DeviceAppUsage(screenTimeId)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_app_usage_imei_week ON DeviceAppUsage(imei, weekStartDate)`);
    console.log("✅ DeviceAppUsage indexes created");

    // Create DeviceDailyScreenTime table (depends on DeviceScreenTime)
    console.log("📅 Creating DeviceDailyScreenTime table...");
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
    console.log("✅ DeviceDailyScreenTime table created");

    // Create indexes for DeviceDailyScreenTime
    console.log("📇 Creating indexes for DeviceDailyScreenTime...");
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_screen_time_screen_time_id ON DeviceDailyScreenTime(screenTimeId)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_screen_time_imei_date ON DeviceDailyScreenTime(imei, date)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_screen_time_imei_week ON DeviceDailyScreenTime(imei, weekStartDate)`);
    console.log("✅ DeviceDailyScreenTime indexes created");

    // Create DeviceDailyAppUsage table (depends on DeviceDailyScreenTime and DeviceScreenTime)
    console.log("📱 Creating DeviceDailyAppUsage table...");
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
    console.log("✅ DeviceDailyAppUsage table created");

    // Create indexes for DeviceDailyAppUsage
    console.log("📇 Creating indexes for DeviceDailyAppUsage...");
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_daily_screen_time_id ON DeviceDailyAppUsage(dailyScreenTimeId)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_screen_time_id ON DeviceDailyAppUsage(screenTimeId)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_imei_date ON DeviceDailyAppUsage(imei, date)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_device_daily_app_usage_imei_week ON DeviceDailyAppUsage(imei, weekStartDate)`);
    console.log("✅ DeviceDailyAppUsage indexes created");

    console.log("========================================");
    console.log("🎉 Migration completed successfully!");
    console.log("========================================");
  } catch (error) {
    console.error("========================================");
    console.error("❌ Migration failed:", error);
    console.error("========================================");
    throw error;
  }
}

