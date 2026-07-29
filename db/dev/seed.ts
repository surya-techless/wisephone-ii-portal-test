import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db, Wisephone, BypassTechlessSubscription, UserPermission, App } from "astro:db";

const CAM_CLERK_ID = "user_2sLc5BX4F7qRUklqQ2UTUJXSipf";

function loadAppsFromJson() {
  const { rows } = JSON.parse(readFileSync(join(process.cwd(), "db/dev/apps.json"), "utf-8"));
  const seen = new Set<string>();
  const apps = [];

  for (const row of rows) {
    const cells = row.cells ?? {};
    const playStoreUrl = cells["Play Store URL"];
    if (!playStoreUrl || playStoreUrl === "n/a") continue;

    let packageName = "";
    try {
      packageName = new URL(playStoreUrl).searchParams.get("id") ?? "";
    } catch {
      continue;
    }
    if (!packageName || seen.has(packageName)) continue;
    seen.add(packageName);

    const toolDrawer = cells["Tool Drawer"] ?? "";
    apps.push({
      packageName,
      name: cells["Tool Name"]?.trim() || "Unknown App",
      playStoreUrl,
      iconUrl: cells["Play Store Icon URL"] || undefined,
      category: cells["Play Store Category"] || undefined,
      source: toolDrawer === "Yes" ? 1 : toolDrawer === "faith.tools" ? 2 : 0,
      inCatalog: toolDrawer === "Yes" || toolDrawer === "faith.tools" ? 1 : 0,
      type: toolDrawer || "unset",
      createdAt: new Date()
    });
  }

  return apps;
}

// https://astro.build/db/seed
export default async function seed() {
  const devices = [
    {
      imei: 350256486849403,
      nickname: "Surya's Test Device",
      phoneNumber: "000-000-0000",
      userId: "test_user"
    },
    {
      imei: 350256489950778,
      nickname: "surya 0778",
      phoneNumber: "480-287-1184",
      userId: "user_3444UPZWP8SAuRoSBUhmXvKmfTK"
    }
  ];

  for (const device of devices) {
    try {
      await db.insert(Wisephone).values(device);
    } catch (error: any) {
      if (error?.code !== "SQLITE_CONSTRAINT_PRIMARYKEY" && error?.code !== "SQLITE_CONSTRAINT") {
        throw error;
      }
    }
  }

  await db.insert(BypassTechlessSubscription).values([
    {
      imei: 350256485931533,
      reason: "Works at Techless"
    }
  ]);

  await db.insert(App).values(loadAppsFromJson());

  await db.insert(UserPermission).values([
    {
      userId: CAM_CLERK_ID,
      role: "admin"
    }
  ]);
}
