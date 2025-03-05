import type { APIRoute } from "astro";
import { db, Wisephone, eq, BypassTechlessSubscription, sql } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";
import { captureException } from "@sentry/astro";
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    // Check if user is authenticated
    const userId = locals.auth().userId;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check if user is an admin
    const user = await locals.currentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!(await isAdmin(user.id))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get form data
    const formData = await request.formData();
    const imei = Number(formData.get("imei"));
    const nickname = formData.get("nickname") as string;
    const phoneNumber = formData.get("phoneNumber") as string;
    const wisephoneUserId = formData.get("userId") as string;
    const bypassSubscription = formData.get("bypassSubscription") === "true";
    const bypassReason = formData.get("bypassReason") as string;

    // Validate inputs
    if (!imei || isNaN(imei)) {
      return new Response(JSON.stringify({ error: "Invalid IMEI" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!phoneNumber || !/^\d{3}-\d{3}-\d{4}$/.test(phoneNumber)) {
      return new Response(JSON.stringify({ error: "Invalid phone number format. Must be in format 123-456-7890" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!wisephoneUserId) {
      return new Response(JSON.stringify({ error: "User ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check if wisephone exists
    const existingWisephone = await db
      .select()
      .from(Wisephone)
      .where(sql`${Wisephone.imei} = ${imei}`)
      .get();

    if (!existingWisephone) {
      return new Response(JSON.stringify({ error: "Wisephone not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Update the wisephone
    const updatedWisephone = await db
      .update(Wisephone)
      .set({
        nickname: nickname.trim() || null,
        phoneNumber,
        userId: wisephoneUserId
      })
      .where(sql`${Wisephone.imei} = ${imei}`)
      .returning()
      .get();

    // Handle bypass subscription
    if (bypassSubscription && bypassReason) {
      // Check if a bypass already exists
      const existingBypass = await db
        .select()
        .from(BypassTechlessSubscription)
        .where(eq(BypassTechlessSubscription.imei, imei))
        .get();

      if (existingBypass) {
        // Update existing bypass
        await db
          .update(BypassTechlessSubscription)
          .set({ reason: bypassReason.trim() })
          .where(eq(BypassTechlessSubscription.imei, imei));
      } else {
        // Create new bypass
        await db.insert(BypassTechlessSubscription).values({
          imei,
          reason: bypassReason.trim()
        });
      }
    } else {
      // Remove bypass if it exists
      await db.delete(BypassTechlessSubscription).where(eq(BypassTechlessSubscription.imei, imei));
    }

    return new Response(
      JSON.stringify({
        success: "Wisephone updated successfully",
        wisephone: updatedWisephone
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    captureException(error);
    console.error("Error updating wisephone:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
