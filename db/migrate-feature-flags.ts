// db/migrate-feature-flags.ts
// Creates the DeviceFeatureFlags table if it doesn't already exist.
// Safe to run on a live DB — uses CREATE TABLE IF NOT EXISTS, touches no other tables.
// Run with: astro db execute db/migrate-feature-flags.ts --remote

import { db, sql } from "astro:db";

export default async function migrate() {
  console.log("========================================");
  console.log("🚀 Starting DeviceFeatureFlags migration...");
  console.log("========================================");

  try {
    console.log("📊 Creating DeviceFeatureFlags table...");
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS DeviceFeatureFlags (
        imei TEXT PRIMARY KEY NOT NULL,
        TOOL_DRAWER INTEGER NOT NULL DEFAULT 0,
        TOOL_DRAWER_IN_PHONE INTEGER NOT NULL DEFAULT 0,
        GOOGLE_APPS INTEGER NOT NULL DEFAULT 0,
        NO_HOTSPOT INTEGER NOT NULL DEFAULT 1,
        ALLOW_FACTORY_RESET INTEGER NOT NULL DEFAULT 1,
        WISEOS_PROTECT INTEGER NOT NULL DEFAULT 0,
        SHOW_SCREEN_TIME INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log("✅ DeviceFeatureFlags table ready");

    console.log("📊 Adding SHOW_SCREEN_TIME column (if not exists)...");
    try {
      await db.run(sql`
        ALTER TABLE DeviceFeatureFlags ADD COLUMN SHOW_SCREEN_TIME INTEGER NOT NULL DEFAULT 0
      `);
      console.log("✅ SHOW_SCREEN_TIME column added");
    } catch (alterError: any) {
      if (alterError?.message?.includes("duplicate column name")) {
        console.log("ℹ️  SHOW_SCREEN_TIME column already exists, skipping");
      } else {
        throw alterError;
      }
    }

    console.log("📊 Adding phoneType column (if not exists)...");
    try {
      await db.run(sql`
        ALTER TABLE DeviceFeatureFlags ADD COLUMN phoneType TEXT NOT NULL DEFAULT 'WPII'
      `);
      console.log("✅ phoneType column added");
    } catch (alterError: any) {
      if (alterError?.message?.includes("duplicate column name")) {
        console.log("ℹ️  phoneType column already exists, skipping");
      } else {
        throw alterError;
      }
    }

    console.log("📊 Adding BLOCK_GOOGLE_MESSAGES_GIFS column (if not exists)...");
    try {
      await db.run(sql`ALTER TABLE DeviceFeatureFlags ADD COLUMN BLOCK_GOOGLE_MESSAGES_GIFS INTEGER NOT NULL DEFAULT 0`);
      console.log("✅ BLOCK_GOOGLE_MESSAGES_GIFS column added");
    } catch (alterError: any) {
      if (alterError?.message?.includes("duplicate column name")) {
        console.log("ℹ️  BLOCK_GOOGLE_MESSAGES_GIFS column already exists, skipping");
      } else {
        throw alterError;
      }
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
