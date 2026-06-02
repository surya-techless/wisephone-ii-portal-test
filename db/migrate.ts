// db/migrate.ts
// One-time migration: drop old screen time tables (clear data), create new one-row-per-IMEI tables,
// and ensure DeviceFeatureFlags has SHOW_SCREEN_TIME on legacy databases.
// Run with: astro db execute db/migrate.ts --remote
// Ensure config has DeviceScreenTimeMetrics and DeviceDataUsage; then run: astro db push

import { db, sql } from "astro:db";

import { tursoDb, WPIIPortalPersistenceError } from "./TursoDb";
import WiseOSLogEvent from "./migrations/WiseOSLogEvent/Create_WiseOSLogEvent";


export default async function migrate() {
  console.log("========================================");
  console.log("🚀 Starting database migration...");
  console.log("========================================");

  try {
    // 1. Drop old screen time tables (child tables first). This clears all existing screen time data.
    console.log("🗑️  Dropping old screen time tables...");
    await db.run(sql`DROP TABLE IF EXISTS DeviceDailyAppUsage`);
    await db.run(sql`DROP TABLE IF EXISTS DeviceDailyScreenTime`);
    await db.run(sql`DROP TABLE IF EXISTS DeviceAppUsage`);
    await db.run(sql`DROP TABLE IF EXISTS DeviceScreenTime`);
    console.log("✅ Old tables dropped (data cleared)");

    // 2. Create new one-row-per-IMEI tables (if not already created by astro db push)
    console.log("📊 Creating DeviceScreenTimeMetrics table...");
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS DeviceScreenTimeMetrics (
        imei TEXT PRIMARY KEY NOT NULL,
        syncedAt TEXT NOT NULL DEFAULT (datetime('now')),
        deviceName TEXT,
        deviceManufacturer TEXT,
        screenTimeDetail TEXT
      )
    `);
    console.log("✅ DeviceScreenTimeMetrics table ready");

    console.log("📊 Creating DeviceDataUsage table...");
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS DeviceDataUsage (
        imei TEXT PRIMARY KEY NOT NULL,
        cycleStartDate TEXT,
        usageDetail TEXT,
        lastSyncedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log("✅ DeviceDataUsage table ready");

    // 3. Older DeviceFeatureFlags rows may exist without SHOW_SCREEN_TIME (schema added later).
    // CREATE TABLE IF NOT EXISTS does not alter existing tables — add column when missing.
    console.log("📊 Ensuring DeviceFeatureFlags.SHOW_SCREEN_TIME column exists...");
    try {
      await db.run(sql`
        ALTER TABLE DeviceFeatureFlags ADD COLUMN SHOW_SCREEN_TIME INTEGER NOT NULL DEFAULT 0
      `);
      console.log("✅ DeviceFeatureFlags.SHOW_SCREEN_TIME column added");
    } catch (alterError: unknown) {
      const msg = alterError instanceof Error ? alterError.message : String(alterError);
      if (
        msg.includes("duplicate column name") ||
        msg.includes("already exists") ||
        /duplicate column/i.test(msg)
      ) {
        console.log("ℹ️  DeviceFeatureFlags.SHOW_SCREEN_TIME already present — skipping");
      } else if (msg.includes("no such table")) {
        console.log(
          "ℹ️  DeviceFeatureFlags table not found — create it with: astro db execute db/migrate-feature-flags.ts --remote"
        );
      } else {
        throw alterError;
      }
    }

    try {
      await tursoDb.batch(WiseOSLogEvent.migrationStatements);  // cool! turso automatically commits this change within a transaction!
      console.log(`✅ ran migrations for table ${WiseOSLogEvent.name}`);
    } catch (error) {
      console.error("❌ error:", error);
      throw new WPIIPortalPersistenceError(`there was an issue performing database migration for table ${WiseOSLogEvent.name}: ${error}`);
    }

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
