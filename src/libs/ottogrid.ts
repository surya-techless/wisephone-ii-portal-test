import { OTTOGRID_API_KEY } from "astro:env/server";

const BASE_ID = "kNd55fD3";
export const CACHE_KEY = "ottogrid_data";

// Define fallback empty data structure
const EMPTY_DATA = { rows: [] };

interface ToolCell {
  Comments: string;
  "Submitter Comment": string;
  "Play Store URL": string;
  "Healthiness Rating": string;
  "Tool Drawer": string;
  "App Category": string;
  "User Ratings and Reviews": string;
  "Tool Name": string;
}

interface ToolRow {
  id: string;
  cells: ToolCell;
}

interface ToolData {
  rows: ToolRow[];
}

/**
 * Fetch data from Ottogrid API
 * Note: In serverless environment, we rely on Netlify CDN for caching
 * @param forceRefresh - Whether to bypass cache (handled at API route level)
 * @returns Promise<ToolData>
 */
async function fetchOttogridData(forceRefresh = false): Promise<ToolData> {
  // In serverless, we can't effectively use NodeCache between invocations
  // So we fetch fresh data each time and let API routes handle caching

  const ottogridApiUrl = new URL(`https://api.ottogrid.ai/api/v1/bases/${BASE_ID}/rows`);
  ottogridApiUrl.searchParams.set("expanded", "false");

  try {
    // Add timeout to prevent function from hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(ottogridApiUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "X-API-KEY": OTTOGRID_API_KEY,
        "Content-Type": "application/json"
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ToolData = await response.json();

    // Validate data structure
    if (!data || !Array.isArray(data.rows)) {
      console.error("Invalid data structure from Ottogrid API");
      return EMPTY_DATA;
    }

    // Sort the rows by the "Tool Name" column
    const sortedRows = data.rows
      .filter((row) => row && row.cells && row.cells["Tool Name"]) // Filter out invalid rows
      .sort((a, b) => a.cells["Tool Name"].toLowerCase().localeCompare(b.cells["Tool Name"].toLowerCase()));

    return { rows: sortedRows };
  } catch (error) {
    console.error("Error fetching Ottogrid data:", error);
    // Return empty data rather than crashing
    return EMPTY_DATA;
  }
}

export { fetchOttogridData, type ToolData, type ToolRow, type ToolCell };
