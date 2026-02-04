import type { APIRoute } from "astro";
import { db, Wisephone, like, or, asc, sql } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";
import { captureException } from "@sentry/astro";
import { devLog } from "@/libs/utils";
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

    // Parse pagination parameters from the URL
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const searchQuery = url.searchParams.get("search") || "";

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where condition for search
    let whereCondition;
    if (searchQuery) {
      whereCondition = or(
        sql`cast(${Wisephone.imei} as text) like ${"%" + searchQuery + "%"}`,
        like(Wisephone.nickname, `%${searchQuery}%`),
        like(Wisephone.phoneNumber, `%${searchQuery}%`),
        like(Wisephone.userId, `%${searchQuery}%`)
      );
    }

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(Wisephone)
      .where(whereCondition)
      .get();

    const totalCount = totalCountResult?.count || 0;

    // Get paginated wisephones
    const wisephones = await db
      .select()
      .from(Wisephone)
      .where(whereCondition)
      .orderBy(asc(Wisephone.imei))
      .limit(limit)
      .offset(offset)
      .all();

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / limit);

    return new Response(
      JSON.stringify({
        wisephones,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    captureException(error);
    devLog.error("Error fetching wisephones:", error);
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
