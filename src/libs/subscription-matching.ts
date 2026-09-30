// src/libs/subscription-matching.ts
import type Stripe from "stripe";
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

export interface SubscriptionDates {
  canceledAt: Date | null;
  scheduledEndAt: Date | null;
  endedAt: Date | null;
}

/**
 * Stripe keeps a cancelled subscription "active" until the end of the paid
 * period: canceled_at is set when the customer cancels, cancel_at (or
 * current_period_end, when cancel_at_period_end) is when access stops, and
 * ended_at only once it actually has. Stripe timestamps are Unix seconds.
 */
export function subscriptionDatesFromStripe(sub: Stripe.Subscription): SubscriptionDates {
  const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);
  return {
    canceledAt: toDate(sub.canceled_at),
    scheduledEndAt: toDate(sub.cancel_at ?? (sub.cancel_at_period_end ? sub.current_period_end : null)),
    endedAt: toDate(sub.ended_at)
  };
}

/**
 * Gigs sets endedAt as soon as a subscription is cancelled — to the future
 * date access stops — and the status stays "active" until then, flipping to
 * "ended" on that date. So endedAt is the scheduled end while still active,
 * and only counts as the actual end once the subscription is no longer active.
 */
export function subscriptionDatesFromGigs(sub: Subscription): SubscriptionDates {
  const toDate = (iso: string | null | undefined) => (iso ? new Date(iso) : null);
  const endAt = toDate(sub.endedAt);
  const isActive = (GIGS_ACTIVE_STATUSES as readonly string[]).includes(sub.status);
  return {
    canceledAt: toDate(sub.canceledAt),
    scheduledEndAt: endAt,
    endedAt: isActive ? null : endAt
  };
}

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
const KICKOUT_TEST_IMEIS = new Set(["351944810229850", "350256486678703", "351944811727332"]);

// Tool Drawer groups (enable + block variants, all device models) are kept
// as-is when a device is kicked out — a lapsed subscriber's Tool Drawer
// access/restriction shouldn't change just because their subscription did.
const KICKOUT_PRESERVED_GROUPS = new Set([
  KNOX_USER_GROUPS.ADD_ON_TOOL_DRAWER,
  KNOX_USER_GROUPS.A16_ADD_ON_TOOL_DRAWER,
  KNOX_USER_GROUPS.ADD_ON_BLOCK_TOOL_DRAWER,
  KNOX_USER_GROUPS.A16_ADD_ON_BLOCK_TOOL_DRAWER,
  KNOX_USER_GROUPS.CSPIRE_ADD_ON_BLOCK_TOOL_DRAWER
]);

/**
 * Moves a device to the Kickout(Test) Knox group — removes every group it
 * currently has EXCEPT its Tool Drawer group(s), which are left untouched,
 * then applies Kickout(Test) on top. Called from stripe.ts/gigs.ts whenever
 * a webhook reports a device's subscription is no longer active. Non-fatal
 * on failure, matching publishSubscriptionStatus's convention — webhook
 * handlers must still return 200 quickly.
 */
export async function moveDeviceToKickoutGroup(imei: string): Promise<void> {
  const normalized = normalizeImei(imei);
  if (!KICKOUT_TEST_IMEIS.has(normalized)) return;

  try {
    const currentGroups = await SamsungKnoxService.getGroupsForDevice(normalized);
    for (const groupId of currentGroups) {
      if (groupId === KNOX_USER_GROUPS.KICKOUT_TEST) continue;
      if (KICKOUT_PRESERVED_GROUPS.has(groupId)) continue;
      await SamsungKnoxService.removeFeature(groupId, normalized);
    }
    await SamsungKnoxService.applyFeature(KNOX_USER_GROUPS.KICKOUT_TEST, normalized);
    console.log(`[kickout] Moved IMEI ${normalized} to Kickout(Test) group (Tool Drawer groups preserved)`);
  } catch (err) {
    console.error(`[kickout] Failed to move IMEI ${normalized} to Kickout(Test) group:`, err);
  }
}

/**
 * Removes a device from the Kickout(Test) group — the mirror of
 * moveDeviceToKickoutGroup(), called whenever a webhook reports a device's
 * subscription is active again. Without this, a device that resubscribes via
 * webhook alone (no need to redo Setup — wiseOS's own isSubscriptionActive
 * gate already auto-unlocks it) would stay stuck in Kickout(Test) forever,
 * since nothing else removes it.
 *
 * Only removes KICKOUT_TEST — does not assign SUBSCRIBED/UNPAID or any other
 * group. That reassignment already happens separately, when the user next
 * completes Setup in the portal (assignSubscriptionGroupByDeviceModel() in
 * manage/[imei].astro); this just undoes the one group this codebase added,
 * so a resubscribed device isn't left carrying a stale "kicked out" marker.
 * Non-fatal on failure — webhook handlers must still return 200 quickly.
 */
export async function removeDeviceFromKickoutGroup(imei: string): Promise<void> {
  const normalized = normalizeImei(imei);
  if (!KICKOUT_TEST_IMEIS.has(normalized)) return;

  try {
    const currentGroups = await SamsungKnoxService.getGroupsForDevice(normalized);
    if (!currentGroups.includes(KNOX_USER_GROUPS.KICKOUT_TEST)) return;

    await SamsungKnoxService.removeFeature(KNOX_USER_GROUPS.KICKOUT_TEST, normalized);
    console.log(`[kickout] Removed IMEI ${normalized} from Kickout(Test) group`);
  } catch (err) {
    console.error(`[kickout] Failed to remove IMEI ${normalized} from Kickout(Test) group:`, err);
  }
}
