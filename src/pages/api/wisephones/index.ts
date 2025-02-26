import type { APIRoute } from "astro";
import { db, Wisephone } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";

export const GET: APIRoute = async ({ locals, request }) => {
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

    // Fetch all wisephones
    const wisephones = await db.select().from(Wisephone).all();

    return new Response(JSON.stringify({ wisephones }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error fetching wisephones:", error);
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
