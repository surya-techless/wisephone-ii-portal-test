import { db, Features, Wisephone } from "astro:db";
import { WISEPHONE_FEATURES } from "../src/libs/utils";

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

  await db.insert(Features).values(WISEPHONE_FEATURES);
}
