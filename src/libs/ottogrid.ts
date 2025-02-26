import { OTTOGRID_API_KEY } from "astro:env/server";

const BASE_ID = "kNd55fD3";
const CACHE_EXPIRATION = 24 * 60 * 60; // 24 hours in seconds
export const CACHE_KEY = "ottogrid_data";

// Instead of NodeCache, we'll use Astro's built-in caching mechanisms
// and implement fallback error handling

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
  fetchTime?: number;
}

// Empty base data structure for when API calls fail
const EMPTY_DATA: ToolData = {
  rows: [],
  fetchTime: 0
};

/**
 * Fetch data from Ottogrid API using fetch API's caching capabilities
 * This is more compatible with serverless environments
 * @param forceRefresh - Whether to bypass cache and force a fresh fetch
 * @returns Promise<ToolData>
 */
async function fetchOttogridData(forceRefresh = false): Promise<ToolData> {
  const ottogridApiUrl = new URL(`https://api.ottogrid.ai/api/v1/bases/${BASE_ID}/rows`);
  ottogridApiUrl.searchParams.set("expanded", "false");

  try {
    // Set up fetch options with caching directives
    const fetchOptions: RequestInit = {
      method: "GET",
      headers: {
        "X-API-KEY": OTTOGRID_API_KEY,
        "Content-Type": "application/json"
      },
      // Use cache: 'default' to allow the browser/runtime to cache according to headers
      cache: forceRefresh ? "no-cache" : "default"
    };

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(ottogridApiUrl, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Ottogrid API returned status: ${response.status}`);
        return EMPTY_DATA;
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.rows)) {
        console.error("Invalid data format from Ottogrid API");
        return EMPTY_DATA;
      }

      // Sort the rows by the "Tool Name" column
      const sortedRows = data.rows
        .filter((row: any) => row && row.cells) // Filter out any potentially invalid rows
        .sort((a: ToolRow, b: ToolRow) => {
          const nameA = (a.cells["Tool Name"] || "").toLowerCase();
          const nameB = (b.cells["Tool Name"] || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });

      return {
        rows: sortedRows,
        fetchTime: Date.now()
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error("Ottogrid API request timed out after 10 seconds");
      } else {
        console.error("Error fetching from Ottogrid API:", fetchError);
      }
      return EMPTY_DATA;
    }
  } catch (error) {
    console.error("Unexpected error in fetchOttogridData:", error);
    return EMPTY_DATA;
  }
}

export { fetchOttogridData, type ToolData, type ToolRow, type ToolCell };
