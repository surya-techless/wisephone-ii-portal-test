import type { APIRoute } from "astro";
import { fetchOttogridData } from "@/libs/ottogrid";
import { captureException } from "@sentry/astro";
import { devLog } from "@/libs/utils";

/**
 * This endpoint manually refreshes the Tool Drawer cache.
 * It can be called as needed, for example:
 * - From client-side JavaScript when the user performs certain actions
 * - From a periodic background process
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("key");

  // Basic protection - you can remove or change this as needed
  if (apiKey !== import.meta.env.API_REFRESH_KEY && process.env.NODE_ENV === "production") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  try {
    devLog.log("Starting cache refresh");

    // Force refresh the cache
    const data = await fetchOttogridData(true);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cache refreshed successfully",
        timestamp: new Date().toISOString(),
        rowCount: data.rows.length
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    captureException(error);
    devLog.error("Error refreshing cache:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to refresh cache",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }
};
