// scripts/backfill-stripe-sub-imei.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.error("Error: STRIPE_SECRET_KEY environment variable is not set.");
  console.error("Usage: STRIPE_SECRET_KEY=sk_... npx tsx scripts/backfill-stripe-sub-imei.ts [--live]");
  process.exit(1);
}

const isLiveRun = process.argv.includes("--live");
const stripeKeyMode = stripeSecretKey.startsWith("sk_test_")
  ? "test"
  : stripeSecretKey.startsWith("sk_live_")
    ? "live"
    : "unknown";

console.log("=".repeat(60));
console.log(`Stripe key mode: ${stripeKeyMode.toUpperCase()}`);
console.log(`Run mode: ${isLiveRun ? "LIVE (will write to Stripe)" : "DRY-RUN (no writes)"}`);
console.log("=".repeat(60));

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-02-24.acacia",
  typescript: true
});

type StampedEntry = {
  subscriptionId: string;
  imei: string;
  source: "session" | "customer";
};

type UnattributedEntry = {
  subscriptionId: string;
  customerId: string;
  status: string;
  created: string;
  customerEmail?: string;
};

type Report = {
  mode: "dry-run" | "live";
  stripeKeyMode: string;
  counts: {
    scanned: number;
    alreadyStamped: number;
    stamped: number;
    unattributed: number;
  };
  stamped: StampedEntry[];
  unattributed: UnattributedEntry[];
};

function normalizeImei(value: string | undefined | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function isTrustedImei(imei: string): boolean {
  return imei.length >= 14 && imei.length <= 16;
}

function getCustomerId(subscription: Stripe.Subscription): string {
  const customer = subscription.customer;
  if (typeof customer === "string") {
    return customer;
  }
  if (customer && typeof customer === "object" && "id" in customer) {
    return customer.id;
  }
  return "";
}

type ResolveResult = {
  resolved: { imei: string; source: "session" | "customer" } | null;
  customerEmail?: string;
};

async function resolveImei(subscription: Stripe.Subscription): Promise<ResolveResult> {
  const sessions = await stripe.checkout.sessions.list({ subscription: subscription.id, limit: 1 });
  const session = sessions.data[0];
  const customerEmail = session?.customer_email ?? session?.customer_details?.email ?? undefined;
  const sessionImei = normalizeImei(session?.metadata?.imei);

  if (sessionImei) {
    if (isTrustedImei(sessionImei)) {
      return { resolved: { imei: sessionImei, source: "session" }, customerEmail };
    }
    console.warn(
      `[warn] Subscription ${subscription.id}: session IMEI "${sessionImei}" is not 14-16 digits, skipping`
    );
  }

  const customerId = getCustomerId(subscription);
  if (!customerId) {
    return { resolved: null, customerEmail };
  }

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    console.warn(`[warn] Subscription ${subscription.id}: customer ${customerId} is deleted`);
    return { resolved: null, customerEmail };
  }

  const customerImei = normalizeImei(customer.metadata?.imei);
  if (!customerImei) {
    return { resolved: null, customerEmail };
  }

  if (!isTrustedImei(customerImei)) {
    console.warn(
      `[warn] Subscription ${subscription.id}: customer IMEI "${customerImei}" is not 14-16 digits, skipping`
    );
    return { resolved: null, customerEmail };
  }

  return { resolved: { imei: customerImei, source: "customer" }, customerEmail };
}

async function processSubscription(
  subscription: Stripe.Subscription,
  report: Report
): Promise<void> {
  report.counts.scanned++;

  const existing = normalizeImei(subscription.metadata?.imei);
  if (existing) {
    report.counts.alreadyStamped++;
    return;
  }

  const { resolved, customerEmail } = await resolveImei(subscription);

  if (resolved) {
    if (isLiveRun) {
      await stripe.subscriptions.update(subscription.id, {
        metadata: { ...subscription.metadata, imei: resolved.imei }
      });
    }

    report.counts.stamped++;
    report.stamped.push({
      subscriptionId: subscription.id,
      imei: resolved.imei,
      source: resolved.source
    });
    return;
  }

  report.counts.unattributed++;
  report.unattributed.push({
    subscriptionId: subscription.id,
    customerId: getCustomerId(subscription),
    status: subscription.status,
    created: new Date(subscription.created * 1000).toISOString(),
    ...(customerEmail ? { customerEmail } : {})
  });
}

async function main(): Promise<void> {
  const report: Report = {
    mode: isLiveRun ? "live" : "dry-run",
    stripeKeyMode,
    counts: {
      scanned: 0,
      alreadyStamped: 0,
      stamped: 0,
      unattributed: 0
    },
    stamped: [],
    unattributed: []
  };

  for (const status of ["active", "trialing"] as const) {
    for await (const subscription of stripe.subscriptions.list({ status, limit: 100 })) {
      await processSubscription(subscription, report);
    }
  }

  const outputDir = join(process.cwd(), "scripts", "output");
  mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(outputDir, `backfill-report-${timestamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("");
  console.log("Summary");
  console.log("-".repeat(40));
  console.log(`Scanned:         ${report.counts.scanned}`);
  console.log(`Already stamped: ${report.counts.alreadyStamped}`);
  console.log(`Stamped:         ${report.counts.stamped}`);
  console.log(`Unattributed:    ${report.counts.unattributed}`);
  console.log("-".repeat(40));
  console.log(`Report written to: ${reportPath}`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
