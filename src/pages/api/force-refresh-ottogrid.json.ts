import type { APIRoute } from "astro";
import { fetchOttogridData } from "@/libs/ottogrid";
import { devLog } from "@/libs/utils";

export const GET: APIRoute = async () => {
  try {
    devLog.log("Force refreshing Ottogrid data cache...");

    // Force refresh the data (this will bypass any existing cache)
    const data = await fetchOttogridData(true);

    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
      devLog.error("Forced refresh returned empty or invalid data");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Refresh returned empty or invalid data",
          rowCount: 0
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Successfully refreshed Ottogrid data cache",
        rowCount: data.rows.length,
        timestamp: new Date().toISOString()
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
    devLog.error("Error in force-refresh-ottogrid endpoint:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : String(error)
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
