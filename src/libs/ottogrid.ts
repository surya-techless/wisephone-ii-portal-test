import { OTTOGRID_API_KEY } from "astro:env/server";
import NodeCache from "node-cache";

const BASE_ID = "kNd55fD3";
const CACHE_EXPIRATION = 24 * 60 * 60; // 24 hours in seconds
export const CACHE_KEY = "ottogrid_data";

// Initialize NodeCache
const cache = new NodeCache({
  stdTTL: CACHE_EXPIRATION,
  checkperiod: CACHE_EXPIRATION * 0.2, // Check for expired keys every 20% of TTL
  useClones: false
});

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
 * Fetch data from Ottogrid API with server-side caching using node-cache
 * @param forceRefresh - Whether to bypass cache and force a fresh fetch
 * @returns Promise<ToolData>
 */
async function fetchOttogridData(forceRefresh = false): Promise<ToolData> {
  // Check cache first if not forcing refresh
  if (!forceRefresh) {
    const cachedData = cache.get<ToolData>(CACHE_KEY);
    if (cachedData && (Boolean(cachedData?.rows?.length) || cachedData?.rows?.length > 0)) {
      console.log("Cache hit for Ottogrid data. TTL: ", cache.getTtl(CACHE_KEY));
      return cachedData;
    } else {
      cache.del(CACHE_KEY);
    }
  }

  const ottogridApiUrl = new URL(`https://api.ottogrid.ai/api/v1/bases/${BASE_ID}/rows`);
  ottogridApiUrl.searchParams.set("expanded", "false");
  // Search filters does not work
  // ottogridApiUrl.searchParams.set(
  //   "filters",
  //   `[{"id":"scol_bKKTicMbtU9kogL7","type":"single-select","operator":"eq","value":"h4ZfnwpZyXWbYst8"}]`
  // );
  // Page param does not work
  // ottogridApiUrl.searchParams.set("page", "2");

  try {
    const response = await fetch(ottogridApiUrl, {
      method: "GET",
      headers: {
        "X-API-KEY": OTTOGRID_API_KEY,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ToolData = await response.json();

    // Sort the rows by the "Tool Name" column
    const sortedRows = data.rows.sort((a, b) =>
      a.cells["Tool Name"].toLowerCase().localeCompare(b.cells["Tool Name"].toLowerCase())
    );

    // Store in cache
    cache.set(CACHE_KEY, { rows: sortedRows });

    return { rows: sortedRows };
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}

export { fetchOttogridData, cache, type ToolData, type ToolRow, type ToolCell };
