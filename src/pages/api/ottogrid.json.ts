import type { APIRoute } from "astro";
import { captureException } from "@sentry/astro";
import { fetchOttogridData } from "@/libs/ottogrid";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("forceRefresh") === "true";

  try {
    // fetchOttogridData handles caching internally with Astro DB
    const data = await fetchOttogridData(forceRefresh);

    // Set simple cache control headers
    const maxAge = forceRefresh ? 0 : 3600; // No cache if forced, 1 hour otherwise

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Simple browser cache control
        "Cache-Control": forceRefresh ? "no-store" : `public, max-age=${maxAge}, must-revalidate`
      }
    });
  } catch (error) {
    captureException(error);
    console.error("Error in ottogrid API route:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch tool drawer data" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }
};
