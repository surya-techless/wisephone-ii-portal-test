import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, Wisephone, eq } from "astro:db";

export const wisephones = {
  // Create a new Wisephone
  createWisephone: defineAction({
    accept: "form",
    input: z.object({
      imei: z.number(),
      nickname: z.string().optional(),
      phoneNumber: z.string(),
      userId: z.string()
    }),
    handler: async (input) => {
      try {
        const newWisephone = await db.insert(Wisephone).values(input).returning().get();

        return {
          success: "Wisephone created successfully!",
          wisephone: newWisephone
        };
      } catch (error) {
        throw new Error(`Failed to create Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        const wisephone = await db.select().from(Wisephone).where(eq(Wisephone.imei, imei)).get();

        if (!wisephone) {
          throw new Error("Wisephone not found");
        }

        return {
          success: "Wisephone found",
          wisephone
        };
      } catch (error) {
        throw new Error(`Failed to get Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`);
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
          .where(eq(Wisephone.imei, input.imei))
          .returning()
          .get();

        if (!updatedWisephone) {
          throw new Error("Wisephone not found");
        }

        return {
          success: "Wisephone updated successfully!",
          wisephone: updatedWisephone
        };
      } catch (error) {
        throw new Error(`Failed to update Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        const deletedWisephone = await db.delete(Wisephone).where(eq(Wisephone.imei, imei)).returning().get();

        if (!deletedWisephone) {
          throw new Error("Wisephone not found");
        }

        return {
          success: "Wisephone deleted successfully!",
          message: "Wisephone deleted successfully"
        };
      } catch (error) {
        throw new Error(`Failed to delete Wisephone: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  })
};
