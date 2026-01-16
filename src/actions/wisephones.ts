import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Wisephone, eq, sql } from "astro:db";
import { SamsungKnoxService } from "@/libs/samsung-knox-service";
import { validateIsSubscribed } from "@/libs/stripe";
import { isValidIMEI } from "@/libs/utils";

export const wisephones = {
  // Create a new Wisephone
  createWisephone: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number(),
      nickname: z.string().max(64).optional(),
      phoneNumber: z.string().min(12).max(12),
      userId: z.string()
    }),
    handler: async (input) => {
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

        return {
          success: "Wisephone created successfully!",
          wisephone: newWisephone
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
        .max(64)
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
      console.log(`[SERVER] getInstalledApps called for IMEI: ${imei}`);
      try {
        // First verify the Wisephone exists
        const wisephone = await db
          .select()
          .from(Wisephone)
          .where(sql`${Wisephone.imei} = ${imei}`)
          .get();

        if (!wisephone) {
          console.log(`[SERVER] Wisephone not found for IMEI: ${imei}`);
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Wisephone not found"
          });
        }

        console.log(`[SERVER] Wisephone found, fetching installed apps from Samsung Knox API...`);
        // Use the SamsungKnoxService to get installed apps
        const result = await SamsungKnoxService.getInstalledApps(imei.toString());

        const apps = result.resultValue.appList || [];
        console.log(`[SERVER] Retrieved ${apps.length} installed apps from Samsung Knox API`);
        // console.log(
        //   `[SERVER] Sample apps (first 20):`,
        //   apps.slice(0, 20).map((app: any) => ({
        //     packageName: app.packageName,
        //     appName: app.appName,
        //     isGoogleManaged: app.isGoogleManaged
        //   }))
        // );

        return {
          success: "Retrieved installed applications",
          apps: apps
        };
      } catch (error) {
        console.error(`[SERVER] Error getting installed apps for IMEI ${imei}:`, error);
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
