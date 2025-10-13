import type { APIRoute } from "astro";
import { db, App } from "astro:db";

export const GET: APIRoute = async () => {
  try {
    // Check database connectivity
    const dbCheck = await db.select().from(App).limit(1);
    
    return new Response(JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: import.meta.env.MODE || "production",
      services: {
        database: "connected",
        appCount: dbCheck.length
      }
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
      services: {
        database: "disconnected"
      }
    }), {
      status: 503,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }
};

