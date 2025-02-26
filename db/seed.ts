import { db, Wisephone, BypassTechlessSubscription, UserPermission, App } from "astro:db";

const CAM_CLERK_ID = "user_2sLc5BX4F7qRUklqQ2UTUJXSipf";
// https://astro.build/db/seed
export default async function seed() {
  await db.insert(Wisephone).values([
    {
      imei: 350256485931533,
      nickname: "Cam Pak",
      phoneNumber: "405-206-0654",
      userId: CAM_CLERK_ID
    }
  ]);

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
      createdAt: new Date(),
      type: "Tool Drawer"
    }
  ]);

  await db.insert(UserPermission).values([
    {
      userId: CAM_CLERK_ID,
      role: "admin"
    }
  ]);
}
