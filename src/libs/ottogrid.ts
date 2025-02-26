import { OTTOGRID_API_KEY } from "astro:env/server";
import { db, OttogridCache, eq, desc, sql } from "astro:db";

const BASE_ID = "kNd55fD3";
export const CACHE_KEY = "ottogrid_data";

// Define fallback empty data structure
const EMPTY_DATA = { rows: [] };

// Cache duration in milliseconds (4 hours)
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000;

// Maximum number of cache entries to keep
const MAX_CACHE_ENTRIES = 7;

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
 * Fetches Ottogrid data, prioritizing cached data and refreshing cache when needed
 * This function handles all caching internally using Astro DB
 * @param forceRefresh - Whether to bypass cache and force a fresh fetch
 * @returns Promise<ToolData>
 */
async function fetchOttogridData(forceRefresh = false): Promise<ToolData> {
  try {
    // If not forcing refresh, attempt to get valid cached data
    if (!forceRefresh) {
      const cachedData = await getLatestValidCache();
      if (cachedData) {
        return cachedData as ToolData;
      }
    }

    // If we reach here, we need fresh data (forced refresh or no valid cache)
    const freshData = await fetchFreshData();

    // After fetching fresh data, clean up old cache entries
    cleanupOldCacheEntries().catch((err) => console.error("Error cleaning up old cache entries:", err));

    return freshData;
  } catch (error) {
    console.error("Error in fetchOttogridData:", error);
    // If anything fails, return empty data with fallback
    return getFallbackData();
  }
}

/**
 * Gets the latest valid cache entry (not expired)
 * @returns Promise<ToolData | null>
 */
async function getLatestValidCache(): Promise<ToolData | null> {
  try {
    // Query for the most recent non-expired cache entry
    const now = new Date();
    const cacheEntries = await db
      .select()
      .from(OttogridCache)
      .where(sql`${OttogridCache.expiresAt} > ${now}`)
      .orderBy(desc(OttogridCache.createdAt))
      .limit(1);

    if (cacheEntries.length > 0) {
      console.log("Cache hit - using cached Ottogrid data from:", cacheEntries[0].createdAt);
      return cacheEntries[0].data as ToolData;
    }

    return null;
  } catch (error) {
    console.error("Error fetching from cache:", error);
    return null;
  }
}

/**
 * Fetches fresh data from Ottogrid API and stores in cache
 * @returns Promise<ToolData>
 */
async function fetchFreshData(): Promise<ToolData> {
  try {
    // Use the actual Ottogrid API
    const ottogridApiUrl = new URL(`https://api.ottogrid.ai/api/v1/bases/${BASE_ID}/rows`);
    ottogridApiUrl.searchParams.set("expanded", "false");

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(ottogridApiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "X-API-Key": OTTOGRID_API_KEY,
          "Content-Type": "application/json"
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ottogrid API returned status ${response.status}`);
      }

      const data: ToolData = await response.json();

      // Validate data structure
      if (!data || !Array.isArray(data.rows)) {
        throw new Error("Invalid data structure from Ottogrid API");
      }

      // Process and sort the data
      const processedData = processToolDrawerData(data);

      // Store in database cache with expiration time
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CACHE_DURATION_MS);

      await db.insert(OttogridCache).values({
        data: processedData,
        createdAt: now,
        expiresAt: expiresAt
      });

      console.log("Cache miss - fetched and cached fresh Ottogrid data");
      return processedData;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError; // Rethrow to be handled by the parent try/catch
    }
  } catch (error) {
    console.error("Error fetching fresh Ottogrid data:", error);

    // On error, try to get any cached data, even if expired
    const fallbackCache = await getLastCacheEntry();
    if (fallbackCache) {
      console.warn("Using expired cache as fallback after fetch error");
      return fallbackCache as ToolData;
    }

    return EMPTY_DATA;
  }
}

/**
 * Gets the latest cache entry regardless of expiration
 * @returns Promise<ToolData | null>
 */
async function getLastCacheEntry(): Promise<ToolData | null> {
  try {
    const cacheEntries = await db.select().from(OttogridCache).orderBy(desc(OttogridCache.createdAt)).limit(1);

    if (cacheEntries.length > 0) {
      return cacheEntries[0].data as ToolData;
    }

    return null;
  } catch (error) {
    console.error("Error getting last cache entry:", error);
    return null;
  }
}

/**
 * Process raw data from the Tool Drawer API
 * @param data - Raw data from the API
 * @returns ToolData - Cleaned and sorted data
 */
function processToolDrawerData(data: ToolData): ToolData {
  // Sort the rows by the "Tool Name" column
  const sortedRows = data.rows
    .filter((row) => row && row.cells && row.cells["Tool Name"]) // Filter out invalid rows
    .sort((a, b) => a.cells["Tool Name"].toLowerCase().localeCompare(b.cells["Tool Name"].toLowerCase()));

  return { rows: sortedRows };
}

/**
 * Clean up old cache entries, keeping only the most recent MAX_CACHE_ENTRIES
 */
async function cleanupOldCacheEntries(): Promise<void> {
  try {
    // Get all cache entries sorted by creation date
    const allEntries = await db.select().from(OttogridCache).orderBy(desc(OttogridCache.createdAt));

    // If we have more than MAX_CACHE_ENTRIES, delete the oldest entries
    if (allEntries.length > MAX_CACHE_ENTRIES) {
      const entriesToDelete = allEntries.slice(MAX_CACHE_ENTRIES);

      for (const entry of entriesToDelete) {
        await db.delete(OttogridCache).where(eq(OttogridCache.id, entry.id));
      }

      console.log(`Cleaned up ${entriesToDelete.length} old cache entries`);
    }
  } catch (error) {
    console.error("Error cleaning up cache entries:", error);
  }
}

/**
 * Get fallback empty data in case of errors
 */
function getFallbackData(): ToolData {
  return EMPTY_DATA;
}

export { fetchOttogridData, type ToolData, type ToolRow, type ToolCell };
