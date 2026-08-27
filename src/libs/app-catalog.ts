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

export type InsertCatalogAppInput = {
  packageName: string;
  name: string;
  playStoreUrl?: string | null;
  iconUrl?: string | null;
  category?: string | null;
  htiAppId?: string | null;
  source?: AppSourceValue;
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

/** Look up a catalog app by HTI app id. */
export async function getCatalogAppByHtiId(htiAppId: string) {
  return db.select().from(App).where(eq(App.htiAppId, htiAppId)).get();
}

/** Upsert an approved app into the Tool Management catalog (by packageName). */
export async function upsertCatalogApp(input: InsertCatalogAppInput): Promise<void> {
  if (!input.packageName) {
    throw new Error("packageName is required");
  }

  const values = {
    packageName: input.packageName,
    name: input.name || input.packageName,
    playStoreUrl: input.playStoreUrl || undefined,
    iconUrl: input.iconUrl || undefined,
    category: input.category || undefined,
    source: input.source ?? AppSource.TOOL_DRAWER,
    inCatalog: 1,
    htiAppId: input.htiAppId || undefined,
    type: "Yes",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db
    .insert(App)
    .values(values)
    .onConflictDoUpdate({
      target: App.packageName,
      set: {
        name: values.name,
        playStoreUrl: values.playStoreUrl,
        iconUrl: values.iconUrl,
        category: values.category,
        source: values.source,
        inCatalog: values.inCatalog,
        htiAppId: values.htiAppId,
        type: values.type,
        updatedAt: values.updatedAt
      }
    });
}
