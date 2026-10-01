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

/**
 * True when the subscription's SIM is one of this device's SIMs, regardless of
 * status — used to work out WHICH phone a subscription belongs to (e.g. an
 * "ended" webhook), not whether it's active.
 */
export function gigsDeviceHasSubscriptionSim(sub: Subscription, device: Device): boolean {
  return Boolean(sub.sim?.id) && Boolean(device.sims?.some((sim) => sim.id === sub.sim?.id));
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
const KICKOUT_TEST_IMEIS = new Set([
  "351944810229850",
  "350256486678703",
  "353994918174688",
  "350256489986988", // Aimee A15
  "353994918206035", // Aimee A16
  "351944811727332", // Aimee A17
  "350256486849403", // Surya A15
  "353994910606125", // Surya A16
  "352648341001626" // Micah A16
]);

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

// Groups applied when a device is kicked out, and removed again when it
// resubscribes.
const KICKOUT_GROUPS = [KNOX_USER_GROUPS.KICKOUT_TEST];

// Base subscription-state groups, per device variant. A device should only
// ever be in one of these at a time.
const UNPAID_GROUPS = [
  KNOX_USER_GROUPS.UNPAID,
  KNOX_USER_GROUPS.A16_UNPAID,
  KNOX_USER_GROUPS.CSPIRE_WPII_Unpaid_v2
];
const SUBSCRIBED_GROUPS = [
  KNOX_USER_GROUPS.SUBSCRIBED,
  KNOX_USER_GROUPS.A16_SUBSCRIBED,
  KNOX_USER_GROUPS.CSPIRE_WPII_Subscribed
];

type DeviceVariant = "cspire" | "a16" | "regular";

/**
 * Which group variant a device uses — same rules as the manage page:
 * C-Spire if it's already in any C-Spire group, otherwise A16 when Knox's
 * model name contains A16 or A17, otherwise the regular (A15) groups. An
 * unknown model falls back to regular.
 */
async function deviceVariant(imei: string, currentGroups: string[]): Promise<DeviceVariant> {
  const cspireGroups = [
    KNOX_USER_GROUPS.CSPIRE_WPII_Subscribed,
    KNOX_USER_GROUPS.CSPIRE_WPII_Unpaid_v2,
    KNOX_USER_GROUPS.CSPIRE_ADD_ON_BLOCK_TOOL_DRAWER
  ];
  if (currentGroups.some((groupId) => cspireGroups.includes(groupId))) return "cspire";

  const rv = (await SamsungKnoxService.getDeviceFromImei(imei))?.resultValue;
  const model = String(
    rv?.deviceModelName || rv?.modelName || rv?.deviceModel || rv?.model || rv?.deviceName || ""
  ).toUpperCase();
  return model.includes("A16") || model.includes("A17") ? "a16" : "regular";
}

const UNPAID_GROUP_FOR: Record<DeviceVariant, string> = {
  cspire: KNOX_USER_GROUPS.CSPIRE_WPII_Unpaid_v2,
  a16: KNOX_USER_GROUPS.A16_UNPAID,
  regular: KNOX_USER_GROUPS.UNPAID
};
const SUBSCRIBED_GROUP_FOR: Record<DeviceVariant, string> = {
  cspire: KNOX_USER_GROUPS.CSPIRE_WPII_Subscribed,
  a16: KNOX_USER_GROUPS.A16_SUBSCRIBED,
  regular: KNOX_USER_GROUPS.SUBSCRIBED
};
// "Add-on- WPII - Block-Tool Drawer" — C-Spire devices are A16s, so they get the A16 variant.
const BLOCK_TOOL_DRAWER_GROUP_FOR: Record<DeviceVariant, string> = {
  cspire: KNOX_USER_GROUPS.A16_ADD_ON_BLOCK_TOOL_DRAWER,
  a16: KNOX_USER_GROUPS.A16_ADD_ON_BLOCK_TOOL_DRAWER,
  regular: KNOX_USER_GROUPS.ADD_ON_BLOCK_TOOL_DRAWER
};

/**
 * Moves a device to the Kickout(Test) Knox group — removes every group it
 * currently has EXCEPT its Tool Drawer group(s), which are left untouched,
 * then applies the KICKOUT_GROUPS plus the device's Unpaid group and
 * Block-Tool Drawer group (C-Spire / A16 / regular variant). Called from
 * stripe.ts/gigs.ts whenever a webhook reports a device's subscription is no
 * longer active. Non-fatal on failure, matching publishSubscriptionStatus's
 * convention — webhook handlers must still return 200 quickly.
 */
export async function moveDeviceToKickoutGroup(imei: string): Promise<void> {
  const normalized = normalizeImei(imei);
  if (!KICKOUT_TEST_IMEIS.has(normalized)) return;

  try {
    const currentGroups = await SamsungKnoxService.getGroupsForDevice(normalized);
    const variant = await deviceVariant(normalized, currentGroups);
    const targetGroups = [...KICKOUT_GROUPS, UNPAID_GROUP_FOR[variant], BLOCK_TOOL_DRAWER_GROUP_FOR[variant]];

    for (const groupId of currentGroups) {
      if (targetGroups.includes(groupId)) continue;
      if (KICKOUT_PRESERVED_GROUPS.has(groupId)) continue;
      await SamsungKnoxService.removeFeature(groupId, normalized);
    }
    for (const groupId of targetGroups) {
      if (!currentGroups.includes(groupId)) {
        await SamsungKnoxService.applyFeature(groupId, normalized);
      }
    }
    console.log(
      `[kickout] Moved IMEI ${normalized} (${variant}) to Kickout(Test) + Unpaid + Block-Tool Drawer groups (Tool Drawer groups preserved)`
    );
  } catch (err) {
    console.error(`[kickout] Failed to move IMEI ${normalized} to Kickout(Test) group:`, err);
  }
}

/**
 * The mirror of moveDeviceToKickoutGroup(), called whenever a webhook reports
 * a device's subscription is active again: removes Kickout(Test) and any
 * Unpaid group, and adds the device's Subscribed group (C-Spire / A16 /
 * regular variant) if it doesn't have one. Without this, a device that
 * resubscribes via webhook alone (no need to redo Setup — wiseOS's own
 * isSubscriptionActive gate already auto-unlocks it) would stay stuck in
 * Kickout(Test) + Unpaid. Tool Drawer groups are left as they are. The manage
 * page's assignSubscriptionGroupByDeviceModel() applies the same rule when a
 * subscription is confirmed there. Non-fatal on failure — webhook handlers
 * must still return 200 quickly.
 */
export async function removeDeviceFromKickoutGroup(imei: string): Promise<void> {
  const normalized = normalizeImei(imei);
  if (!KICKOUT_TEST_IMEIS.has(normalized)) return;

  try {
    const currentGroups = await SamsungKnoxService.getGroupsForDevice(normalized);
    const toRemove = currentGroups.filter((groupId) => KICKOUT_GROUPS.includes(groupId) || UNPAID_GROUPS.includes(groupId));
    const hasSubscribedGroup = currentGroups.some((groupId) => SUBSCRIBED_GROUPS.includes(groupId));
    if (toRemove.length === 0 && hasSubscribedGroup) return;

    for (const groupId of toRemove) {
      await SamsungKnoxService.removeFeature(groupId, normalized);
    }
    if (!hasSubscribedGroup) {
      const variant = await deviceVariant(normalized, currentGroups);
      await SamsungKnoxService.applyFeature(SUBSCRIBED_GROUP_FOR[variant], normalized);
    }
    console.log(`[kickout] Resubscribed IMEI ${normalized}: removed Kickout(Test)/Unpaid, ensured Subscribed group`);
  } catch (err) {
    console.error(`[kickout] Failed to remove IMEI ${normalized} from Kickout(Test) group:`, err);
  }
}
