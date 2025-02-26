import type { APIRoute } from "astro";
import { fetchOttogridData } from "@/libs/ottogrid";
import { purgeCache } from "@netlify/functions";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("forceRefresh") === "true";

  try {
    const data = await fetchOttogridData(forceRefresh);

    // If force refresh, invalidate the cache using cache tags
    if (forceRefresh) {
      try {
        await purgeCache({ tags: ["ottogrid-data"] });
      } catch (error) {
        console.warn("Failed to purge cache:", error);
      }
    }

    // Set a fixed TTL for CDN caching since we can't rely on node-cache in serverless
    const ttl = forceRefresh ? 3600 : 86400; // 1 hour if forced, 24 hours otherwise

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Browser cache control - always check freshness
        "Cache-Control": "public, max-age=0, must-revalidate",
        // Netlify-specific CDN cache control with durable caching
        "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${ttl}, stale-while-revalidate=86400`,
        // Cache tag for targeted invalidation
        "Netlify-Cache-Tag": "ottogrid-data",
        // Vary on the forceRefresh parameter only
        "Netlify-Vary": "query=forceRefresh"
      }
    });
  } catch (error) {
    console.error("Error in ottogrid API route:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch Ottogrid data" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }
};
