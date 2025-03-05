import type { APIRoute } from "astro";
import { db, BypassTechlessSubscription } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";
import { captureException } from "@sentry/astro";
export const GET: APIRoute = async ({ locals }) => {
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

    // Get all bypass entries
    const bypassList = await db.select().from(BypassTechlessSubscription).all();

    // Return the list as a map with IMEI as the key for easier lookup
    const bypassMap: Record<number, typeof BypassTechlessSubscription.$inferSelect> = bypassList.reduce(
      (acc, bypass) => {
        acc[bypass.imei] = bypass;
        return acc;
      },
      {} as Record<number, typeof BypassTechlessSubscription.$inferSelect>
    );

    return new Response(JSON.stringify({ bypassMap }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    captureException(error);
    console.error("Error fetching bypass list:", error);
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
