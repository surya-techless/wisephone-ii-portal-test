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
 * Fetch data from Ottogrid API with improved error handling
 * @param forceRefresh - Whether to bypass cache (handled at API route level)
 * @returns Promise<ToolData>
 */
async function fetchOttogridData(forceRefresh = false): Promise<ToolData> {
  const ottogridApiUrl = new URL(`https://api.ottogrid.ai/api/v1/bases/${BASE_ID}/rows`);
  ottogridApiUrl.searchParams.set("expanded", "false");

  try {
    // Increase timeout to 15 seconds - the API might be slow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
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
        console.warn(`Ottogrid API returned status ${response.status}`);
        return EMPTY_DATA;
      }

      const data: ToolData = await response.json();

      // Validate data structure
      if (!data || !Array.isArray(data.rows)) {
        console.warn("Invalid data structure from Ottogrid API");
        return EMPTY_DATA;
      }

      // Sort the rows by the "Tool Name" column
      const sortedRows = data.rows
        .filter((row) => row && row.cells && row.cells["Tool Name"]) // Filter out invalid rows
        .sort((a, b) => a.cells["Tool Name"].toLowerCase().localeCompare(b.cells["Tool Name"].toLowerCase()));

      return { rows: sortedRows };
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        console.warn("Ottogrid API request timed out after 15 seconds");
      } else {
        console.error("Error during Ottogrid API fetch:", fetchError);
      }

      return EMPTY_DATA;
    }
  } catch (error) {
    console.error("Unexpected error in fetchOttogridData:", error);
    return EMPTY_DATA;
  }
}

export { fetchOttogridData, type ToolData, type ToolRow, type ToolCell };
