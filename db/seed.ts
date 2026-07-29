import { db, Wisephone, BypassTechlessSubscription, UserPermission, App } from "astro:db";

const CAM_CLERK_ID = "user_2sLc5BX4F7qRUklqQ2UTUJXSipf";
// https://astro.build/db/seed
export default async function seed() {
  // Devices to seed
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

  // Insert all Wisephones (ignore if already exists)
  // Note: DeviceScreenTime will be initialized automatically by createWisephone action
  // when devices are added via the portal UI
  for (const device of devices) {
    try {
      await db.insert(Wisephone).values(device);
    } catch (error: any) {
      // Ignore if device already exists
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

  await db.insert(App).values([
    {
      packageName: "com.techless.wiseos",
      name: "WiseOS",
      source: 1, // Tool Drawer
      inCatalog: 1,
      createdAt: new Date()
    }
  ]);

  await db.insert(UserPermission).values([
    {
      userId: CAM_CLERK_ID,
      role: "admin"
    }
  ]);
}
