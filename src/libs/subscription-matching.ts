// src/libs/subscription-matching.ts
import type { Subscription, Device } from "./types";
import { SamsungKnoxService } from "./samsung-knox-service";
import { KNOX_USER_GROUPS } from "./utils";

export function normalizeImei(value: string): string {
  return value.replace(/\D/g, "");
}

export function stripeSubscriptionMatchesImei(
  metadata: Record<string, string> | null | undefined,
  imei: string
): boolean {
  const normalizedMetadata = normalizeImei(metadata?.imei ?? "");
  const normalizedImei = normalizeImei(imei);
  return normalizedMetadata !== "" && normalizedMetadata === normalizedImei;
}

export const GIGS_ACTIVE_STATUSES = ["active", "pending"] as const;

export function gigsSubscriptionMatchesDevice(sub: Subscription, device: Device): boolean {
  return (
    (GIGS_ACTIVE_STATUSES as readonly string[]).includes(sub.status) &&
    Boolean(sub.sim?.id) &&
    Boolean(device.sims?.some((sim) => sim.id === sub.sim?.id))
  );
}

/**
 * Prints a readable summary block for a resolved subscription webhook event —
 * called from stripe.ts/gigs.ts once IMEI + active status are known. Uses
 * plain console.log (not devLog) so it's visible in Netlify function logs,
 * not just local dev.
 */
export function logSubscriptionWebhookEvent(params: {
  provider: "Stripe" | "Gigs";
  isActive: boolean;
  imei: string;
}): void {
  const { provider, isActive, imei } = params;
  const statusLabel = isActive ? "✅ Active" : "⛔ Not Active";
  const date = new Date().toISOString();

  console.log(
    "\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "📨 Subscription Webhook Received\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `  Subscription type   : ${provider}\n` +
      `  Subscription status : ${statusLabel}\n` +
      `  Date                : ${date}\n` +
      `  IMEI                : ${imei}\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
}

// [TEST OVERRIDE] — only these IMEIs get moved to KICKOUT_TEST when a webhook
// reports their subscription inactive. Remove once the group's Knox Manage
// policy has been verified to do the right thing on a real device (wiseOS
// showing setup-only, per its own isSubscriptionActive gate).
const KICKOUT_TEST_IMEIS = new Set(["351944810229850"]);

/**
 * Moves a device to ONLY the Kickout(Test) Knox group — removes every group
 * it currently has, then applies just this one. Called from stripe.ts/gigs.ts
 * whenever a webhook reports a device's subscription is no longer active.
 * Non-fatal on failure, matching publishSubscriptionStatus's convention —
 * webhook handlers must still return 200 quickly.
 */
export async function moveDeviceToKickoutGroup(imei: string): Promise<void> {
  const normalized = normalizeImei(imei);
  if (!KICKOUT_TEST_IMEIS.has(normalized)) return;

  try {
    const currentGroups = await SamsungKnoxService.getGroupsForDevice(normalized);
    for (const groupId of currentGroups) {
      if (groupId === KNOX_USER_GROUPS.KICKOUT_TEST) continue;
      await SamsungKnoxService.removeFeature(groupId, normalized);
    }
    await SamsungKnoxService.applyFeature(KNOX_USER_GROUPS.KICKOUT_TEST, normalized);
    console.log(`[kickout] Moved IMEI ${normalized} to Kickout(Test) group only`);
  } catch (err) {
    console.error(`[kickout] Failed to move IMEI ${normalized} to Kickout(Test) group:`, err);
  }
}
