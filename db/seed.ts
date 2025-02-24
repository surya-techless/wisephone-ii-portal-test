import { db, Wisephone, BypassTechlessSubscription, App } from "astro:db";

// https://astro.build/db/seed
export default async function seed() {
  await db.insert(Wisephone).values([
    {
      imei: 350256485931533,
      nickname: "Cam Pak",
      phoneNumber: "405-206-0654",
      userId: "user_2sLc5BX4F7qRUklqQ2UTUJXSipf" // Cam's Clerk ID
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
}
