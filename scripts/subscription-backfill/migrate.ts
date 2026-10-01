// scripts/subscription-backfill/migrate.ts
//
// Step 1: create WebhookEvent and DeviceSubscriptionStatus in the target
// database (001_add_subscription_tables.sql). Dry run by default — reports
// which tables are missing and what would run. --apply executes it.
//
//   TARGET_DB_URL=… TARGET_DB_TOKEN=… npx tsx scripts/subscription-backfill/migrate.ts            # dry run
//   TARGET_DB_URL=… TARGET_DB_TOKEN=… npx tsx scripts/subscription-backfill/migrate.ts --apply    # create tables
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectTargetDb } from "./target-db";

const REQUIRED_TABLES = ["WebhookEvent", "DeviceSubscriptionStatus"];
const isApply = process.argv.includes("--apply");

async function main() {
  const { db } = connectTargetDb();
  console.log(`Mode: ${isApply ? "APPLY (will create missing tables)" : "DRY RUN (no changes)"}\n`);

  const existing = new Set(
    (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((row) => String(row.name))
  );
  const missing = REQUIRED_TABLES.filter((table) => !existing.has(table));

  for (const table of REQUIRED_TABLES) {
    console.log(`  ${existing.has(table) ? "✓ exists " : "✗ missing"}  ${table}`);
  }

  if (missing.length === 0) {
    console.log("\nNothing to do — all required tables exist.");
    return;
  }

  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "001_add_subscription_tables.sql"), "utf-8");
  const statements = sql
    .split(";")
    .map((statement) => statement.replace(/--.*$/gm, "").trim())
    .filter(Boolean);

  if (!isApply) {
    console.log(`\nWould run ${statements.length} statement(s) from 001_add_subscription_tables.sql. Re-run with --apply.`);
    return;
  }

  await db.batch(statements, "write");

  const after = new Set(
    (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((row) => String(row.name))
  );
  const stillMissing = REQUIRED_TABLES.filter((table) => !after.has(table));
  if (stillMissing.length > 0) {
    console.error(`\nMigration ran but these tables are still missing: ${stillMissing.join(", ")}`);
    process.exit(1);
  }
  console.log(`\nCreated: ${missing.join(", ")}`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
