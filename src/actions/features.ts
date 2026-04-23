import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, DeviceFeatureFlags, eq, sql } from "astro:db";
import { publishFeatureFlags } from "@/libs/mqtt";

const featureFlagSchema = z.object({
  TOOL_DRAWER: z.number().min(0).max(1),
  TOOL_DRAWER_IN_PHONE: z.number().min(0).max(1),
  GOOGLE_APPS: z.number().min(0).max(1),
  NO_HOTSPOT: z.number().min(0).max(1),
  ALLOW_FACTORY_RESET: z.number().min(0).max(1),
  WISEOS_PROTECT: z.number().min(0).max(1),
  SHOW_SCREEN_TIME: z.number().min(0).max(1)
});

export const features = {
  /**
   * Inserts a new DeviceFeatureFlags record for a device.
   * Called on manage page load when no record exists yet.
   */
  upsertFeatureFlags: defineAction({
    accept: "json",
    input: z.object({
      imei: z.string(),
      flags: featureFlagSchema,
      phoneType: z.enum(["CSPIRE", "WPII"]).optional()
    }),
    handler: async ({ imei, flags, phoneType }) => {
      const extra = phoneType ? { phoneType } : {};
      await db
        .insert(DeviceFeatureFlags)
        .values({ imei, ...flags, ...extra, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: DeviceFeatureFlags.imei,
          set: { ...flags, ...extra, updatedAt: new Date() }
        });
      await publishFeatureFlags(imei, flags);
      return { success: true };
    }
  }),

  /**
   * Updates a single feature flag field for a device.
   * Called after every successful toggle.
   */
  updateFeatureFlag: defineAction({
    accept: "json",
    input: z.object({
      imei: z.string(),
      featureKey: z.string(),
      value: z.number().min(0).max(1)
    }),
    handler: async ({ imei, featureKey, value }) => {
      const allowed = Object.keys(featureFlagSchema.shape);
      if (!allowed.includes(featureKey)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Unknown feature key: ${featureKey}`
        });
      }

      await db
        .update(DeviceFeatureFlags)
        .set({ [featureKey]: value, updatedAt: new Date() })
        .where(eq(DeviceFeatureFlags.imei, imei));

      await publishFeatureFlags(imei, { [featureKey]: value });
      return { success: true };
    }
  })
};
