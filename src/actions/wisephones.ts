import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Wisephone, BypassTechlessSubscription, DeviceFeatureFlags, eq, sql } from "astro:db";
import { SamsungKnoxService } from "@/libs/samsung-knox-service";
import { validateIsSubscribed } from "@/libs/stripe";
import { isValidIMEI, devLog, FEATURES, KNOX_USER_GROUPS } from "@/libs/utils";

export const wisephones = {
  // Create a new Wisephone
  createWisephone: defineAction({
    accept: "form",
    input: z.object({
      imei: z.coerce.number(), // Coerce string to number (HTML forms submit strings)
      nickname: z.string().max(64).optional(),
      phoneNumber: z.string().min(12).max(12),
      userId: z.string()
    }),
    handler: async (input, context) => {
      try {
        // 1. Get Wisephone from IMEI in Knox
        // 2. Ensure it's using the primary IMEI
        // 3. If it is, create the Wisephone
        const knoxDevice = await SamsungKnoxService.getDeviceFromImei(input.imei.toString());

        if (!knoxDevice) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        if (knoxDevice.resultValue?.secondaryImei.toString() === input.imei.toString()) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "This device is using IMEI slot 2. Please enter IMEI slot 1 to register."
          });
        }

        const newWisephone = await db.insert(Wisephone).values(input).returning();

        // Seed DeviceFeatureFlags from live Knox groups
        let isCspireDevice = false;
        let deviceGroups: string[] = [];
        try {
          const groups = await SamsungKnoxService.getGroupsForDevice(input.imei.toString());
          deviceGroups = groups;
          const flags: Record<string, number> = { SHOW_SCREEN_TIME: 0 };
          for (const [key, feature] of Object.entries(FEATURES)) {
            if (feature.isPortalOnly) continue;
            const hasGroup =
              (feature.knoxManageId ? groups.includes(feature.knoxManageId) : false) ||
              (feature.a16KnoxManageId ? groups.includes(feature.a16KnoxManageId) : false);
            flags[key] = (feature.isInverse ? !hasGroup : hasGroup) ? 1 : 0;
          }
          const allCspireGroupIds = [
            KNOX_USER_GROUPS.CSPIRE_WPII_Unpaid_v2,
            KNOX_USER_GROUPS.CSPIRE_WPII_Subscribed,
            KNOX_USER_GROUPS.CSPIRE_ADD_ON_BLOCK_TOOL_DRAWER
          ];
          const cspireGroupIds = [KNOX_USER_GROUPS.CSPIRE_WPII_Unpaid_v2, KNOX_USER_GROUPS.CSPIRE_WPII_Subscribed];
          isCspireDevice = groups.some(id => allCspireGroupIds.includes(id));
          const phoneType = groups.some(id => cspireGroupIds.includes(id)) ? "CSPIRE" : "WPII";
          await db
            .insert(DeviceFeatureFlags)
            .values({ imei: input.imei.toString(), ...(flags as any), phoneType, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: DeviceFeatureFlags.imei,
              set: { ...(flags as any), phoneType, updatedAt: new Date() }
            });
          devLog.log("[FeatureFlags] Seeded from Knox on device add for IMEI:", input.imei, "| phoneType:", phoneType);
        } catch (flagsError) {
          // Non-fatal — flags will be seeded on first manage page visit
          devLog.error("[FeatureFlags] Failed to seed on device add:", flagsError);
        }

        // Log CSPIRE status before subscription check
        const cspireGroupNames = Object.entries(KNOX_USER_GROUPS)
          .filter(([key]) => key.startsWith("CSPIRE"))
          .filter(([, id]) => deviceGroups.includes(id))
          .map(([key]) => key);
        devLog.log(
          `[Device Details] IMEI: ${input.imei} | isCspire: ${isCspireDevice}`,
          isCspireDevice
            ? `| CSPIRE Knox groups: [${cspireGroupNames.join(", ")}]`
            : "| No CSPIRE Knox groups found"
        );

        // Check if device is already subscribed
        // First check for bypass subscription
        const bypassSubscription = await db
          .select()
          .from(BypassTechlessSubscription)
          .where(eq(BypassTechlessSubscription.imei, input.imei))
          .limit(1);

        let isSubscribed = bypassSubscription.length > 0;

        // If not bypassed, check actual subscription
        if (!isSubscribed && input.phoneNumber) {
          try {
            isSubscribed = await validateIsSubscribed({
              imei: input.imei.toString(),
              phoneNumber: input.phoneNumber.replace(/[^0-9+]/g, "")
            });
          } catch (error) {
            // Error checking subscription
          }
        }
        return {
          success: "Wisephone created successfully!",
          wisephone: newWisephone,
          isSubscribed,
          isCspire: isCspireDevice
        };
      } catch (error: any) {
        if (error?.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || error?.code === "SQLITE_CONSTRAINT") {
          throw new ActionError({
            code: "CONFLICT",
            message: `Wisephone (${input.imei}) is already registered on another account. To add it to this account, please remove it from the other account first.`
          });
        }

        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to create Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Read a Wisephone by IMEI
  getWisephone: defineAction({
    input: z.object({
      imei: z.number()
    }),
    handler: async ({ imei }) => {
      try {
        const wisephone = await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .get();

        if (!wisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        return {
          success: "Wisephone found",
          wisephone
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to get Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Update a Wisephone
  updateWisephone: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number(),
      nickname: z
        .string()
        .max(15, {
          message: "The name of the device is too long. Please limit the name to 15 characters."
        })
        .optional()
        .refine(
          (val: string | undefined) => {
            if (!val) return true;
            const name = val.trim();
            return name.length > 0;
          },
          {
            message: "Device nickname cannot be empty"
          }
        ),
      phoneNumber: z
        .string()
        .min(12)
        .max(12)
        .optional()
        .refine(
          (val) => {
            if (val) {
              return /^\d{3}-\d{3}-\d{4}$/.test(val);
            }
            return true;
          },
          {
            message: "Phone number must be in the format 123-456-7890"
          }
        ),
      userId: z.string().optional()
    }),
    handler: async (input) => {
      try {
        const updatedWisephone = await db
          .update(Wisephone)
          .set(input)
          .where(sql`${Wisephone.imei} = ${input.imei}`)
          .returning()
          .get();

        if (!updatedWisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        return {
          success: "Wisephone updated successfully!",
          wisephone: updatedWisephone
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to update Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Delete a Wisephone
  deleteWisephone: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number()
    }),
    handler: async ({ imei }) => {
      try {
        const deletedWisephone = await db
          .delete(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .returning()
          .get();

        if (!deletedWisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        return {
          success: "Wisephone deleted successfully!",
          message: "Wisephone deleted successfully"
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to delete Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Install an Android app on a Wisephone
  installApp: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number(),
      url: z.string().url("Invalid APK URL").optional(),
      appPackage: z.string().min(1, "Package name is required"),
      componentClass: z
        .enum(["Activity", "Broadcast", "Service"], {
          errorMap: () => ({ message: "Component class must be Activity, Broadcast, or Service" })
        })
        .default("Activity")
        .optional(),
      autoRun: z
        .enum(["Automatic", "Manual"], {
          errorMap: () => ({ message: "Auto run must be Automatic or Manual" })
        })
        .default("Manual")
        .optional(),
      knoxId: z.string().optional()
    }),
    handler: async (input) => {
      try {
        // First verify the Wisephone exists
        const wisephone = await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${input.imei}`)
          .get();

        if (!wisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        // Use the SamsungKnoxService to install the app
        const result = await SamsungKnoxService.installAndroidApp(input.imei.toString(), {
          appPackage: input.appPackage,
          ...(input.autoRun && { autoRun: input.autoRun }),
          ...(input.componentClass && { componentClass: input.componentClass }),
          ...(input.knoxId && { knoxId: input.knoxId }),
          ...(input.url && { url: input.url })
        });

        return {
          success: "App will be installed on the device shortly",
          result
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to install app: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Uninstall an Android app from a Wisephone
  uninstallApp: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number(),
      appPackage: z.string().min(1, "Package name is required"),
      knoxId: z.string().optional()
    }),
    handler: async (input) => {
      try {
        // First verify the Wisephone exists
        const wisephone = await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${input.imei}`)
          .get();

        if (!wisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        // Use the SamsungKnoxService to uninstall the app
        const result = await SamsungKnoxService.uninstallAndroidApp(
          input.imei.toString(),
          input.appPackage,
          input.knoxId || ""
        );

        return {
          success: "App will be uninstalled from the device shortly",
          result
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to uninstall app: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Get list of installed apps on a Wisephone
  getInstalledApps: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number()
    }),
    handler: async ({ imei }) => {
      try {
        // First verify the Wisephone exists
        const wisephone = await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .get();

        if (!wisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        // Use the SamsungKnoxService to get installed apps
        const result = await SamsungKnoxService.getInstalledApps(imei.toString());

        const apps = result.resultValue.appList || [];

        return {
          success: "Retrieved installed applications",
          apps: apps
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to get installed apps: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  // Sync installed apps list on a Wisephone
  syncInstalledApps: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number()
    }),
    handler: async ({ imei }) => {
      try {
        // First verify the Wisephone exists
        const wisephone = await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .get();

        if (!wisephone) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        // Use the SamsungKnoxService to sync installed apps list
        const result = await SamsungKnoxService.syncInstalledAppList(imei.toString());

        return {
          success: "Sync of installed applications list initiated",
          result
        };
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Failed to sync installed apps list: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }
  }),

  validateIsUserSubscribed: defineAction({
    input: z.object({
      imei: z.string(),
      phoneNumber: z.string().min(12).max(12)
    }),
    handler: async (input) => {
      // Check bypass first, consistent with server-side subscription checks
      const bypassSubscription = await db
        .select()
        .from(BypassTechlessSubscription)
        .where(eq(BypassTechlessSubscription.imei, Number(input.imei)))
        .limit(1);

      if (bypassSubscription.length > 0) {
        return { success: "User is subscribed", isSubscribed: true };
      }

      const isSubscribed = await validateIsSubscribed({ phoneNumber: input.phoneNumber, imei: input.imei });

      return {
        success: "User is subscribed",
        isSubscribed
      };
    }
  }),

  forceUpdateDevice: defineAction({
    accept: "form",
    input: z.object({
      imei: z.string()
    }),
    handler: async ({ imei }) => {
      if (!isValidIMEI(imei)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Invalid IMEI"
        });
      }

      // Pushing the profile updates tells the device to pull in the latest updates from Knox.
      const pushProfileResult = await SamsungKnoxService.pushProfile(imei.toString());

      // Force install the latest WiseOS update
      const installWiseOSUpdateResult = await SamsungKnoxService.installAndroidApp(imei.toString(), {
        appPackage: "com.techless.wiseos"
      });

      return {
        success: `Force update initiated for ${imei}. The user will receive a "Processing" notification on their Wisephone.`,
        result: {
          pushProfileResult,
          installWiseOSUpdateResult
        }
      };
    }
  })
};
