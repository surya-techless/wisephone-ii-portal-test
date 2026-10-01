-- Adds the two tables the subscription-status work relies on that production
-- (wisephone-ii-portal, and its clone test-production) doesn't have yet.
--
-- The CREATE TABLE statements are copied verbatim from the schema Astro DB
-- generated in wisephone-ii-portal-test (sqlite_master), so the result matches
-- what `astro db push` would have produced from db/config.ts. Additive only:
-- IF NOT EXISTS means re-running is a no-op, and no existing table is touched.

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" integer PRIMARY KEY,
  "source" text NOT NULL,
  "type" text NOT NULL,
  "imei" text,
  "status" text,
  "isActive" integer,
  "receivedAt" text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "DeviceSubscriptionStatus" (
  "imei" text PRIMARY KEY,
  "subscriptionType" text,
  "hasActiveSubscription" integer NOT NULL,
  "subscriptionStatus" text NOT NULL,
  "rawStatus" text,
  "lastEventType" text,
  "updatedAt" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "canceledAt" text,
  "scheduledEndAt" text,
  "endedAt" text
);
