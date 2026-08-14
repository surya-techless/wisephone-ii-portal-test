// src/libs/subscription-matching.ts
import type { Subscription, Device } from "./types";

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
