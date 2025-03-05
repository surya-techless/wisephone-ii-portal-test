// src/pages/api/wisephones/delete.ts
import type { APIRoute } from "astro";
import { db, Wisephone, eq, sql, BypassTechlessSubscription } from "astro:db";
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

    // Validate IMEI
    if (!imei || isNaN(imei)) {
      return new Response(JSON.stringify({ error: "Invalid IMEI" }), {
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

    // Delete the wisephone
    await db.delete(Wisephone).where(sql`${Wisephone.imei} = ${imei}`);

    // Also delete any bypass entries for this IMEI
    await db.delete(BypassTechlessSubscription).where(eq(BypassTechlessSubscription.imei, imei));

    return new Response(
      JSON.stringify({
        success: "Wisephone deleted successfully"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    captureException(error);
    console.error("Error deleting wisephone:", error);
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
