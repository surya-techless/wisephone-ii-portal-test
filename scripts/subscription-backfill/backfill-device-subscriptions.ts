// scripts/subscription-backfill/backfill-device-subscriptions.ts
//
// Step 2: for every IMEI in the Wisephone table (devices with a portal
// account), look up its subscription in Stripe and Gigs and write the result
// to DeviceSubscriptionStatus — status, type, raw status and the three
// lifecycle dates (canceledAt / scheduledEndAt / endedAt), the same fields the
// Stripe and Gigs webhooks keep up to date. Data only: no MQTT pushes, no Knox
// group changes, no unenrolls.
//
// Dry run by default — writes a CSV report and touches nothing. --apply writes
// to the database. See README.md for the full procedure.
//
//   STRIPE_SECRET_KEY=… GIGS_API_KEY=… TARGET_DB_URL=… TARGET_DB_TOKEN=… \
//     npx tsx scripts/subscription-backfill/backfill-device-subscriptions.ts [--apply] [--resume]
//     [--concurrency=4] [--limit=N] [--imei=<one IMEI>] [--allow-production]
//
// Lookup rules (match the portal's webhook handlers and validateIsSubscribedStrict):
//   Bypass  — IMEI in BypassTechlessSubscription → active, type "Bypass".
//   Stripe  — subscriptions whose metadata.imei is this IMEI (any status); the
//             active/trialing one if any, else the most recently ended. Falls back
//             to customers with metadata.imei (older records) → flag legacy_customer_imei.
//             Every Stripe search hit counts; hits whose metadata doesn't read back
//             as this IMEI are kept but flagged stripe_imei_metadata_mismatch.
//   Gigs    — device(s) by IMEI → their users' subscriptions → only subscriptions
//             whose SIM is in this phone (device.sims), any status; the active/pending
//             one if any, else the most recently ended. Never another line on the account.
//   Both active → Stripe wins, flagged also_active_on_gigs.
//
// Write rule: insert if the IMEI has no row; otherwise update only if the row
// was last updated before this run started — a webhook that lands during the
// run is newer and is never overwritten.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { connectTargetDb } from "./target-db";

// ── Config ────────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const GIGS_API_KEY = process.env.GIGS_API_KEY;
const GIGS_BASE_URL = "https://api.gigs.com/projects/techless";
const STRIPE_ACTIVE_STATUSES = ["active", "trialing"];
const GIGS_ACTIVE_STATUSES = ["active", "pending"];

const isApply = process.argv.includes("--apply");
const isResume = process.argv.includes("--resume");
const argValue = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const concurrency = Math.max(1, Number(argValue("concurrency") ?? 4));
const limit = argValue("limit") ? Number(argValue("limit")) : undefined;
const singleImei = argValue("imei");

if (!STRIPE_SECRET_KEY || !GIGS_API_KEY) {
  console.error("STRIPE_SECRET_KEY and GIGS_API_KEY must be set (see README.md).");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia", typescript: true });
const stripeKeyMode = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : STRIPE_SECRET_KEY.startsWith("sk_test_") ? "test" : "unknown";

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "output");
const PROGRESS_FILE = join(OUTPUT_DIR, "progress.jsonl");

// ── Types ─────────────────────────────────────────────────────────────────────
type GigsSim = { id: string };
type GigsDevice = { id: string; imei: string; sims?: GigsSim[]; user?: { id: string } };
type GigsSubscription = {
  id: string;
  status: string;
  phoneNumber?: string | null;
  sim?: { id: string } | null;
  user?: { id: string } | null;
  createdAt?: string | null;
  canceledAt?: string | null;
  endedAt?: string | null;
};

type SubscriptionDates = { canceledAt: string | null; scheduledEndAt: string | null; endedAt: string | null };

type ProviderMatch = SubscriptionDates & {
  active: boolean;
  rawStatus: string;
  subscriptionId: string;
  customerId: string | null;
  simId?: string | null;
};

type BackfillResult = SubscriptionDates & {
  imei: string;
  phoneNumber: string;
  userId: string;
  subscriptionType: "Stripe" | "Gigs" | "Bypass" | null;
  hasActiveSubscription: boolean;
  rawStatus: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  gigsSubscriptionId: string;
  gigsUserId: string;
  gigsSimId: string;
  flags: string[];
  error: string;
  dbWrite: "dry-run" | "written" | "skipped-newer-row" | "skipped" | "error";
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalizeImei = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const fromUnix = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const fromIso = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString() : null);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lastTen = (phone: string | null | undefined) => String(phone ?? "").replace(/\D/g, "").slice(-10);
const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.statusCode ?? error?.status;
      const retryable = status === 429 || (status >= 500 && status < 600) || error?.type === "StripeConnectionError";
      if (!retryable || attempt >= attempts) throw error;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

async function gigsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return withRetry(`gigs ${path}`, async () => {
    const response = await fetch(`${GIGS_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GIGS_API_KEY}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const error: any = new Error(`Gigs ${path.split("?")[0]} failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return (await response.json()) as T;
  });
}

// ── Stripe ────────────────────────────────────────────────────────────────────
function stripeDates(sub: Stripe.Subscription): SubscriptionDates {
  return {
    canceledAt: fromUnix(sub.canceled_at),
    scheduledEndAt: fromUnix(sub.cancel_at ?? (sub.cancel_at_period_end ? sub.current_period_end : null)),
    endedAt: fromUnix(sub.ended_at)
  };
}

function pickSubscription<T>(subs: T[], isActive: (sub: T) => boolean, recency: (sub: T) => number): T | undefined {
  const active = subs.filter(isActive).sort((a, b) => recency(b) - recency(a));
  if (active.length > 0) return active[0];
  return [...subs].sort((a, b) => recency(b) - recency(a))[0];
}

// Stripe's search already matches metadata['imei'] exactly, so every result it
// returns is tagged with this IMEI. Some older records read back without a
// plain `imei` key equal to it (different key spelling or formatting) — they
// used to be filtered out here, which marked ~71 paying devices Not Active.
// Keep them all; flag the ones whose metadata doesn't read back as this IMEI.
function metadataHasImei(metadata: Record<string, string> | null | undefined, imei: string): boolean {
  return Object.entries(metadata ?? {}).some(
    ([key, value]) => key.trim().toLowerCase() === "imei" && normalizeImei(value) === imei
  );
}

async function lookupStripe(imei: string, flags: string[]): Promise<ProviderMatch | null> {
  const search = await withRetry("stripe subscriptions.search", () =>
    stripe.subscriptions.search({ query: `metadata['imei']:'${imei}'`, limit: 100 })
  );
  let subs = [...search.data];
  if (subs.some((sub) => !metadataHasImei(sub.metadata, imei))) flags.push("stripe_imei_metadata_mismatch");

  // Older records only carry the IMEI on the customer.
  if (subs.length === 0) {
    const customers = await withRetry("stripe customers.search", () =>
      stripe.customers.search({ query: `metadata['imei']:'${imei}'`, limit: 100 })
    );
    if (customers.data.some((c) => !metadataHasImei(c.metadata, imei))) flags.push("stripe_imei_metadata_mismatch");
    for (const customer of customers.data) {
      const list = await withRetry("stripe subscriptions.list", () =>
        stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })
      );
      subs.push(...list.data);
    }
    if (subs.length > 0) flags.push("legacy_customer_imei");
  }

  if (subs.length === 0) return null;

  const isActive = (sub: Stripe.Subscription) => STRIPE_ACTIVE_STATUSES.includes(sub.status);
  if (subs.filter(isActive).length > 1) flags.push("multiple_active_stripe");

  const chosen = pickSubscription(subs, isActive, (sub) => sub.ended_at ?? sub.canceled_at ?? sub.created)!;
  return {
    active: isActive(chosen),
    rawStatus: chosen.status,
    subscriptionId: chosen.id,
    customerId: typeof chosen.customer === "string" ? chosen.customer : chosen.customer?.id ?? null,
    ...stripeDates(chosen)
  };
}

// ── Gigs ──────────────────────────────────────────────────────────────────────
async function listGigsSubscriptionsForUser(userId: string): Promise<GigsSubscription[]> {
  const all: GigsSubscription[] = [];
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ user: userId, limit: "100" });
    if (after) query.set("after", after);
    const page = await gigsFetch<{ items?: GigsSubscription[]; moreItemsAfter?: string | null }>(`/subscriptions?${query}`);
    all.push(...(page.items ?? []));
    after = page.moreItemsAfter ?? null;
  } while (after);
  return all;
}

async function lookupGigs(imei: string, phoneNumber: string, flags: string[]): Promise<ProviderMatch | null> {
  const devices = (await gigsFetch<{ items?: GigsDevice[] }>("/devices/search", {
    method: "POST",
    body: JSON.stringify({ imei })
  })).items ?? [];
  if (devices.length === 0) return null;

  const simIds = new Set(devices.flatMap((device) => (device.sims ?? []).map((sim) => sim.id)));
  const userIds = [...new Set(devices.map((device) => device.user?.id).filter(Boolean))] as string[];

  const userSubs: GigsSubscription[] = [];
  for (const userId of userIds) userSubs.push(...(await listGigsSubscriptionsForUser(userId)));

  // Only subscriptions running on a SIM in this phone — any status, so an ended
  // subscription still yields its endedAt for the 90-day clock.
  const deviceSubs = userSubs.filter((sub) => sub.sim?.id && simIds.has(sub.sim.id));

  if (deviceSubs.length === 0) {
    if (simIds.size === 0) flags.push("gigs_sim_unlinked");
    else if (userSubs.length > 0) flags.push("gigs_no_sim_match");
    return null;
  }

  const isActive = (sub: GigsSubscription) => GIGS_ACTIVE_STATUSES.includes(sub.status);
  const recency = (sub: GigsSubscription) => Date.parse(sub.endedAt ?? sub.canceledAt ?? sub.createdAt ?? "") || 0;
  const chosen = pickSubscription(deviceSubs, isActive, recency)!;

  if (chosen.phoneNumber && phoneNumber && lastTen(chosen.phoneNumber) !== lastTen(phoneNumber)) {
    flags.push("gigs_phone_mismatch");
  }

  const active = isActive(chosen);
  // Gigs sets endedAt as soon as a subscription is cancelled (the future date
  // access stops); it's only the actual end once the subscription is no longer active.
  const endAt = fromIso(chosen.endedAt);
  return {
    active,
    rawStatus: chosen.status,
    subscriptionId: chosen.id,
    customerId: chosen.user?.id ?? null,
    simId: chosen.sim?.id ?? null,
    canceledAt: fromIso(chosen.canceledAt),
    scheduledEndAt: endAt,
    endedAt: active ? null : endAt
  };
}

// ── Per-IMEI resolution ───────────────────────────────────────────────────────
async function resolveImei(
  wisephone: { imei: string; phoneNumber: string; userId: string },
  bypassImeis: Set<string>
): Promise<BackfillResult> {
  const result: BackfillResult = {
    imei: wisephone.imei,
    phoneNumber: wisephone.phoneNumber,
    userId: wisephone.userId,
    subscriptionType: null,
    hasActiveSubscription: false,
    rawStatus: "not_found",
    canceledAt: null,
    scheduledEndAt: null,
    endedAt: null,
    stripeSubscriptionId: "",
    stripeCustomerId: "",
    gigsSubscriptionId: "",
    gigsUserId: "",
    gigsSimId: "",
    flags: [],
    error: "",
    dbWrite: isApply ? "skipped" : "dry-run"
  };

  if (!/^\d{15}$/.test(wisephone.imei)) {
    result.flags.push("invalid_imei");
    result.dbWrite = "skipped";
    return result;
  }

  if (bypassImeis.has(wisephone.imei)) {
    result.subscriptionType = "Bypass";
    result.hasActiveSubscription = true;
    result.rawStatus = "bypass";
    return result;
  }

  try {
    const [stripeMatch, gigsMatch] = await Promise.all([
      lookupStripe(wisephone.imei, result.flags),
      lookupGigs(wisephone.imei, wisephone.phoneNumber, result.flags)
    ]);

    if (stripeMatch) {
      result.stripeSubscriptionId = stripeMatch.subscriptionId;
      result.stripeCustomerId = stripeMatch.customerId ?? "";
    }
    if (gigsMatch) {
      result.gigsSubscriptionId = gigsMatch.subscriptionId;
      result.gigsUserId = gigsMatch.customerId ?? "";
      result.gigsSimId = gigsMatch.simId ?? "";
    }

    let chosen: { type: "Stripe" | "Gigs"; match: ProviderMatch } | null = null;
    if (stripeMatch?.active) {
      chosen = { type: "Stripe", match: stripeMatch };
      if (gigsMatch?.active) result.flags.push("also_active_on_gigs");
    } else if (gigsMatch?.active) {
      chosen = { type: "Gigs", match: gigsMatch };
    } else if (stripeMatch || gigsMatch) {
      // Neither active: keep whichever subscription ended most recently, for its dates.
      const endedTime = (match: ProviderMatch | null) =>
        match ? Date.parse(match.endedAt ?? match.canceledAt ?? "") || 0 : -1;
      chosen =
        endedTime(gigsMatch) > endedTime(stripeMatch)
          ? { type: "Gigs", match: gigsMatch! }
          : { type: "Stripe", match: stripeMatch! };
    }

    if (chosen) {
      result.subscriptionType = chosen.type;
      result.hasActiveSubscription = chosen.match.active;
      result.rawStatus = chosen.match.rawStatus;
      result.canceledAt = chosen.match.canceledAt;
      result.scheduledEndAt = chosen.match.scheduledEndAt;
      result.endedAt = chosen.match.endedAt;
    }
  } catch (error: any) {
    result.flags.push("lookup_error");
    result.error = error?.message ?? String(error);
    result.dbWrite = "error";
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { db } = connectTargetDb();
  const runStartedAt = new Date().toISOString();
  const runId = runStartedAt.replace(/[:.]/g, "-");

  console.log("=".repeat(70));
  console.log(`Stripe key: ${stripeKeyMode.toUpperCase()}${stripeKeyMode !== "live" ? "  ⚠️  results will not reflect real customers" : ""}`);
  console.log(`Mode: ${isApply ? "APPLY (writes DeviceSubscriptionStatus)" : "DRY RUN (report only, no writes)"}`);
  console.log(`Run started: ${runStartedAt}   concurrency: ${concurrency}`);
  console.log("=".repeat(70));

  const tables = new Set((await db.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => String(r.name)));
  if (isApply && !tables.has("DeviceSubscriptionStatus")) {
    console.error("DeviceSubscriptionStatus doesn't exist in the target database — run migrate.ts --apply first.");
    process.exit(1);
  }

  const bypassImeis = new Set(
    (await db.execute("SELECT imei FROM BypassTechlessSubscription")).rows.map((row) => normalizeImei(row.imei))
  );

  let wisephones = (await db.execute("SELECT imei, phoneNumber, userId FROM Wisephone ORDER BY imei")).rows.map((row) => ({
    imei: normalizeImei(row.imei),
    phoneNumber: String(row.phoneNumber ?? ""),
    userId: String(row.userId ?? "")
  }));
  if (singleImei) wisephones = wisephones.filter((w) => w.imei === normalizeImei(singleImei));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const done = new Set<string>();
  if (isApply && isResume && existsSync(PROGRESS_FILE)) {
    for (const line of readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean)) {
      done.add(JSON.parse(line).imei);
    }
    console.log(`Resuming: ${done.size} IMEI(s) already processed in a previous --apply run will be skipped.`);
  }
  let queue = wisephones.filter((w) => !done.has(w.imei));
  if (limit !== undefined) queue = queue.slice(0, limit);

  console.log(`Wisephone rows: ${wisephones.length}   to process: ${queue.length}   bypass list: ${bypassImeis.size}\n`);

  const reportFile = join(OUTPUT_DIR, `backfill-report-${isApply ? "apply" : "dryrun"}-${runId}.csv`);
  const columns: (keyof BackfillResult)[] = [
    "imei", "phoneNumber", "userId", "subscriptionType", "hasActiveSubscription", "rawStatus",
    "canceledAt", "scheduledEndAt", "endedAt", "stripeSubscriptionId", "stripeCustomerId",
    "gigsSubscriptionId", "gigsUserId", "gigsSimId", "flags", "dbWrite", "error"
  ];
  writeFileSync(reportFile, columns.join(",") + "\n");

  const counts: Record<string, number> = {};
  const bump = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  let processed = 0;

  async function writeRow(result: BackfillResult) {
    if (!isApply || result.dbWrite === "error" || result.flags.includes("invalid_imei")) return;
    const now = new Date().toISOString();
    const write = await db.execute({
      sql: `INSERT INTO DeviceSubscriptionStatus
              (imei, subscriptionType, hasActiveSubscription, subscriptionStatus, rawStatus, lastEventType,
               updatedAt, canceledAt, scheduledEndAt, endedAt)
            VALUES (?, ?, ?, ?, ?, 'backfill', ?, ?, ?, ?)
            ON CONFLICT(imei) DO UPDATE SET
              subscriptionType = excluded.subscriptionType,
              hasActiveSubscription = excluded.hasActiveSubscription,
              subscriptionStatus = excluded.subscriptionStatus,
              rawStatus = excluded.rawStatus,
              lastEventType = excluded.lastEventType,
              updatedAt = excluded.updatedAt,
              canceledAt = excluded.canceledAt,
              scheduledEndAt = excluded.scheduledEndAt,
              endedAt = excluded.endedAt
            WHERE DeviceSubscriptionStatus.updatedAt < ?`,
      args: [
        result.imei,
        result.subscriptionType,
        result.hasActiveSubscription ? 1 : 0,
        result.hasActiveSubscription ? "Active" : "Not Active",
        result.rawStatus,
        now,
        result.canceledAt,
        result.scheduledEndAt,
        result.endedAt,
        runStartedAt
      ]
    });
    result.dbWrite = write.rowsAffected > 0 ? "written" : "skipped-newer-row";
  }

  async function worker() {
    while (queue.length > 0) {
      const wisephone = queue.shift()!;
      const result = await resolveImei(wisephone, bypassImeis);
      try {
        await writeRow(result);
      } catch (error: any) {
        result.dbWrite = "error";
        result.error = `db write: ${error?.message ?? error}`;
      }

      appendFileSync(reportFile, columns.map((column) => csvCell(column === "flags" ? result.flags.join("|") : result[column])).join(",") + "\n");
      if (isApply && result.dbWrite !== "error") appendFileSync(PROGRESS_FILE, JSON.stringify({ imei: result.imei }) + "\n");

      bump(`${result.subscriptionType ?? "none"} ${result.hasActiveSubscription ? "active" : "inactive"}`);
      bump(`dbWrite:${result.dbWrite}`);
      result.flags.forEach((flag) => bump(`flag:${flag}`));

      processed++;
      if (processed % 100 === 0 || queue.length === 0) {
        console.log(`[${processed}] last=${result.imei} ${result.subscriptionType ?? "none"} ${result.rawStatus} ${result.flags.join(",")}`);
      }
      await sleep(100);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const summary = { mode: isApply ? "apply" : "dry-run", stripeKeyMode, runStartedAt, finishedAt: new Date().toISOString(), processed, counts, reportFile };
  writeFileSync(join(OUTPUT_DIR, `backfill-summary-${isApply ? "apply" : "dryrun"}-${runId}.json`), JSON.stringify(summary, null, 2));

  console.log("\nSummary:");
  for (const [key, value] of Object.entries(counts).sort()) console.log(`  ${key.padEnd(40)} ${value}`);
  console.log(`\nReport: ${reportFile}`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
