# Subscription backfill

Brings every device that already has a portal account (`Wisephone` table) up to
date in `DeviceSubscriptionStatus` — subscription status, Stripe/Gigs type, raw
status, and the `canceledAt` / `scheduledEndAt` / `endedAt` dates the 90-day
auto-unenroll relies on. After this, the Stripe/Gigs webhooks keep those rows
current.

Nothing here runs automatically. Every script is a **dry run by default** and
**refuses the production database** unless `--allow-production` is passed.

## Files

| File | What it does |
|---|---|
| `001_add_subscription_tables.sql` | Creates `WebhookEvent` and `DeviceSubscriptionStatus` (missing in production). Additive, `IF NOT EXISTS`. Copied from the schema Astro generated in `wisephone-ii-portal-test`. |
| `migrate.ts` | Runs the SQL above against the target database. Dry run lists what's missing; `--apply` creates it. |
| `backfill-device-subscriptions.ts` | Looks up every `Wisephone` IMEI in Stripe and Gigs and writes `DeviceSubscriptionStatus`. Dry run writes a CSV report only; `--apply` writes the database. |
| `target-db.ts` | Shared connection + production guard. |
| `output/` | Reports, summaries and the resume file (git-ignored — contains customer data). |

## Databases (Turso, org `techless-admin`)

| Database | What it is |
|---|---|
| `wisephone-ii-portal` | **Production** (13,109 `Wisephone` rows). No `WebhookEvent` / `DeviceSubscriptionStatus` yet. |
| `test-production` | Clone of production, made 2026-10-01 — **run everything here first**. |
| `wisephone-ii-portal-test` | Staging (25 `Wisephone` rows). Already has both tables — where `astro db push --remote` has been landing. |

Why the scripts don't use `astro db push` / `astro db execute`: production also
has a `SubscriptionGracePeriod` table that isn't in `db/config.ts`, so
`astro db push` against it would want to drop that table (data loss) and refuse.
And the `--remote` commands read `.env`, which has several database URLs; they
have already written to staging when production was intended. These scripts
take an explicit target instead.

## Environment

```bash
export TARGET_DB_URL="libsql://test-production-techless-admin.aws-us-east-1.turso.io"
export TARGET_DB_TOKEN="$(turso db tokens create test-production)"
export STRIPE_SECRET_KEY="sk_live_…"   # live key — a test key finds no real customers
export GIGS_API_KEY="…"
```

## Procedure

0. **Stamp IMEIs onto older Stripe subscriptions** (existing script) so they can
   be found by `metadata.imei`:
   ```bash
   npx tsx scripts/backfill-stripe-sub-imei.ts          # dry run, review its report
   npx tsx scripts/backfill-stripe-sub-imei.ts --live
   ```
   The backfill still finds subscriptions that only have the IMEI on the
   customer, but flags them `legacy_customer_imei`.

1. **Migrate the clone**
   ```bash
   npx tsx scripts/subscription-backfill/migrate.ts            # shows what's missing
   npx tsx scripts/subscription-backfill/migrate.ts --apply
   ```

2. **Dry-run the backfill against the clone**
   ```bash
   npx tsx scripts/subscription-backfill/backfill-device-subscriptions.ts --limit=50   # quick sample
   npx tsx scripts/subscription-backfill/backfill-device-subscriptions.ts              # all ~13k IMEIs, a few hours
   ```
   Review `output/backfill-report-dryrun-*.csv` and the summary: counts by type
   and status, every flagged row, and spot-check ~10 of each kind in the Stripe
   and Gigs dashboards. Compare against the IMEI checker results.

3. **Apply to the clone**, then check it in the clone:
   ```bash
   npx tsx scripts/subscription-backfill/backfill-device-subscriptions.ts --apply
   turso db shell test-production "SELECT subscriptionType, subscriptionStatus, COUNT(*) FROM DeviceSubscriptionStatus GROUP BY 1,2"
   ```
   If interrupted, re-run with `--apply --resume` to skip IMEIs already done.

4. **Production** — only after 1–3 look right. Point `TARGET_DB_URL` /
   `TARGET_DB_TOKEN` at `wisephone-ii-portal` and repeat 1 and 3 with
   `--allow-production`. Clear `output/progress.jsonl` first so the clone's
   progress isn't reused.

## Options (`backfill-device-subscriptions.ts`)

| Option | Default | |
|---|---|---|
| `--apply` | off | Write to `DeviceSubscriptionStatus` |
| `--resume` | off | With `--apply`, skip IMEIs listed in `output/progress.jsonl` |
| `--concurrency=N` | 4 | Parallel IMEIs (Stripe search allows ~20 req/s) |
| `--limit=N` | all | Only the first N IMEIs |
| `--imei=…` | all | Just one IMEI |
| `--allow-production` | off | Permit the production database |

## Lookup rules

Same rules as the portal's webhooks and device-level subscription check.

- **Bypass** — IMEI in `BypassTechlessSubscription`: active, type `Bypass`, no API calls.
- **Stripe** — subscriptions with `metadata.imei` = IMEI, any status. The
  `active`/`trialing` one if any, else the most recently ended. Dates:
  `canceled_at` → `canceledAt`; `cancel_at` (or `current_period_end` when
  cancelling at period end) → `scheduledEndAt`; `ended_at` → `endedAt`.
- **Gigs** — device(s) by IMEI → their users' subscriptions (all pages) →
  **only subscriptions whose SIM is in this phone**, any status. The
  `active`/`pending` one if any, else the most recently ended. Dates:
  `canceledAt`; `endedAt` → `scheduledEndAt`, and also `endedAt` once the
  subscription is no longer active.
- **Both active** → Stripe, flagged `also_active_on_gigs`. **Neither active** →
  whichever ended most recently (for its dates). **Nothing found** → not active,
  type empty, `rawStatus = not_found`.

## Write rule

Rows get `lastEventType = 'backfill'`. A row is inserted if the IMEI has none,
otherwise updated **only if it was last updated before the run started** — a
webhook that arrives during the run is newer and is kept (`skipped-newer-row`
in the report). Lookup errors don't write anything (`lookup_error`).

No MQTT pushes, no Knox group changes, no unenrolls.

## Flags in the report

| Flag | Meaning |
|---|---|
| `invalid_imei` | `Wisephone.imei` isn't 15 digits (2 rows in production) — skipped |
| `legacy_customer_imei` | Stripe IMEI only on the customer, not the subscription |
| `multiple_active_stripe` | More than one active Stripe subscription for the IMEI |
| `also_active_on_gigs` | Active on both Stripe and Gigs |
| `gigs_sim_unlinked` | Gigs knows the device but has no SIM linked to it |
| `gigs_no_sim_match` | The account has Gigs subscriptions, none on this phone's SIM |
| `gigs_phone_mismatch` | Matched Gigs line's number ≠ `Wisephone.phoneNumber` |
| `lookup_error` | A Stripe/Gigs call failed — row not written; re-run later |
