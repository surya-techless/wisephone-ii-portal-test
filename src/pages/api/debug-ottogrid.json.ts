import type { APIRoute } from "astro";
import { OTTOGRID_API_KEY } from "astro:env/server";
import { devLog } from "@/libs/utils";

interface DiagnosticData {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  isValidJson: boolean;
  responseLength: number;
  responseSample: string;
  apiKey: string;
  url: string;
  authType: string;
  dataStructure?: {
    hasRows: boolean;
    rowsIsArray: boolean;
    rowCount: number | string;
    dataKeys: string[];
  };
  sampleRow?: unknown;
}

// This is a debugging endpoint to test the Ottogrid API directly
export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    // Try different auth types: bearer, header, param
    const authType = url.searchParams.get("auth") || "bearer";

    const BASE_ID = "kNd55fD3";
    const ottogridApiUrl = new URL(`https://api.ottogrid.ai/api/v1/bases/${BASE_ID}/rows`);
    ottogridApiUrl.searchParams.set("expanded", "false");

    // If using API key as a URL parameter
    if (authType === "param") {
      ottogridApiUrl.searchParams.set("apiKey", OTTOGRID_API_KEY);
    }

    devLog.log(`Debug: Testing Ottogrid API URL with ${authType} auth:`, ottogridApiUrl.toString());

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      // Set authorization header based on authType
      if (authType === "bearer") {
        headers["Authorization"] = `Bearer ${OTTOGRID_API_KEY.trim()}`;
      } else if (authType === "header") {
        headers["x-api-key"] = OTTOGRID_API_KEY.trim();
      }

      const response = await fetch(ottogridApiUrl, {
        method: "GET",
        signal: controller.signal,
        headers
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let parsedData;
      let isValidJson = true;

      try {
        parsedData = JSON.parse(responseText);
      } catch (parseError) {
        isValidJson = false;
      }

      // Prepare diagnostic information
      const diagnosticData: DiagnosticData = {
        statusCode: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        isValidJson,
        responseLength: responseText.length,
        responseSample: responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""),
        apiKey: OTTOGRID_API_KEY ? OTTOGRID_API_KEY.substring(0, 3) + "***" : "Not set",
        url: ottogridApiUrl.toString(),
        authType
      };

      if (isValidJson && parsedData) {
        diagnosticData.dataStructure = {
          hasRows: Boolean(parsedData?.rows),
          rowsIsArray: Array.isArray(parsedData?.rows),
          rowCount: Array.isArray(parsedData?.rows) ? parsedData.rows.length : "N/A",
          dataKeys: Object.keys(parsedData || {})
        };

        if (Array.isArray(parsedData?.rows) && parsedData.rows.length > 0) {
          diagnosticData.sampleRow = parsedData.rows[0];
        }
      }

      return new Response(JSON.stringify(diagnosticData, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({
          error: "Fetch error",
          message: fetchError instanceof Error ? fetchError.message : String(fetchError),
          stack: fetchError instanceof Error ? fetchError.stack : undefined
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
  } catch (error: unknown) {
    devLog.error("Error in debug-ottogrid API route:", error);
    return new Response(
      JSON.stringify({
        error: "General error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
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
