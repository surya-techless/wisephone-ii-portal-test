import { db, App, eq, asc } from "astro:db";
import { devLog } from "@/libs/utils";

/** Matches App.source in db/config.ts: 0 = not set, 1 = Tool Drawer, 2 = faith.tools */
export const AppSource = {
  NOT_SET: 0,
  TOOL_DRAWER: 1,
  FAITH_TOOLS: 2
} as const;

export type AppSourceValue = 0 | 1 | 2;

export type CatalogApp = {
  packageName: string;
  name: string;
  playStoreUrl: string | null;
  iconUrl: string | null;
  category: string | null;
  source: AppSourceValue;
};

/** Catalog apps shown in Tool Management (inCatalog = 1). */
export async function getCatalogApps(): Promise<CatalogApp[]> {
  try {
    const rows = await db
      .select({
        packageName: App.packageName,
        name: App.name,
        playStoreUrl: App.playStoreUrl,
        iconUrl: App.iconUrl,
        category: App.category,
        source: App.source
      })
      .from(App)
      .where(eq(App.inCatalog, 1))
      .orderBy(asc(App.name));

    // Coerce source: generated Astro DB types may lag behind db/config.ts (number column).
    return rows.map((row) => ({
      packageName: row.packageName,
      name: row.name,
      playStoreUrl: row.playStoreUrl,
      iconUrl: row.iconUrl,
      category: row.category,
      source: Number(row.source) as AppSourceValue
    }));
  } catch (error) {
    devLog.error("Failed to load catalog apps from DB:", error);
    return [];
  }
}
