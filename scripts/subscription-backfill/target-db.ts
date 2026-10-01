// scripts/subscription-backfill/target-db.ts
//
// Connection to the database these scripts operate on. Deliberately does NOT
// read ASTRO_DB_REMOTE_URL / ASTRO_DB_APP_TOKEN — the portal's .env has several
// (mostly commented-out) database URLs, and `astro db … --remote` has already
// been seen writing to a different database than the active .env line names.
// The target is always explicit: TARGET_DB_URL + TARGET_DB_TOKEN.
//
// Production is refused unless --allow-production is passed, so the default
// workflow is: run everything against the test-production clone first.
import { createClient, type Client } from "@libsql/client";

// Hostname fragments of databases that hold live customer data.
const PRODUCTION_DB_HOSTS = ["wisephone-ii-portal-techless-admin"];

export function connectTargetDb(): { db: Client; url: string; isProduction: boolean } {
  const url = process.env.TARGET_DB_URL;
  const authToken = process.env.TARGET_DB_TOKEN;

  if (!url || !authToken) {
    console.error("TARGET_DB_URL and TARGET_DB_TOKEN must be set (see README.md).");
    process.exit(1);
  }

  const host = url.replace(/^[a-z]+:\/\//, "").split(/[/?]/)[0];
  const isProduction = PRODUCTION_DB_HOSTS.some((prod) => host === `${prod}.turso.io` || host.startsWith(`${prod}.`));

  if (isProduction && !process.argv.includes("--allow-production")) {
    console.error(`Refusing to run against the production database (${host}).`);
    console.error("Run against the test-production clone first; pass --allow-production only when that's been verified.");
    process.exit(1);
  }

  console.log(`Target database: ${host}${isProduction ? "  ⚠️  PRODUCTION" : ""}`);
  return { db: createClient({ url, authToken }), url, isProduction };
}
