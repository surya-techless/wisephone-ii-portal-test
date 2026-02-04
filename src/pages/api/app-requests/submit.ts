import type { APIRoute } from "astro";
import { captureException } from "@sentry/astro";
import { devLog } from "@/libs/utils";

interface AppRequest {
  imei: number;
  apps: Array<{
    packageName: string;
    name: string;
    category: string;
  }>;
  requestedFrom: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body: AppRequest = await request.json();

    // Validate request body
    if (!body.imei || !body.apps || !Array.isArray(body.apps) || body.apps.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          message: "IMEI and apps array are required"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            // CORS headers
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        }
      );
    }

    // Log the request for now (later you can save to database)
    devLog.log(" App Request Received:", {
      imei: body.imei,
      appsCount: body.apps.length,
      apps: body.apps,
      requestedFrom: body.requestedFrom,
      timestamp: new Date().toISOString()
    });

    // TODO: Save to database or send notification to managers
    // For now, we'll just return success

    return new Response(
      JSON.stringify({
        success: true,
        message: "App request submitted successfully",
        requestId: `REQ-${Date.now()}` // Generate a simple request ID
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // CORS headers
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  } catch (error) {
    captureException(error);
    devLog.error("Error in app-requests/submit API route:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to submit app request",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          // CORS headers
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
};

// Handle OPTIONS preflight request
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
};


