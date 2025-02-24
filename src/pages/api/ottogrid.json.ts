import type { APIRoute } from "astro";
import { fetchOttogridData, cache, CACHE_KEY } from "@/libs/ottogrid";
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

    // Calculate remaining TTL from node-cache
    const remainingTTL = cache.getTtl(CACHE_KEY)
      ? Math.max(0, Math.floor((cache.getTtl(CACHE_KEY)! - Date.now()) / 1000))
      : 0;

    // Default TTL if none remaining (e.g., after force refresh)
    const defaultTTL = 3600; // 1 hour
    const effectiveTTL = forceRefresh ? defaultTTL : remainingTTL || defaultTTL;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Browser cache control - always check freshness
        "Cache-Control": "public, max-age=0, must-revalidate",
        // Netlify-specific CDN cache control with durable caching
        "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${effectiveTTL}, stale-while-revalidate=86400`,
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
