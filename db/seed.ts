import { db, Features, Wisephone, WisephoneFeatures } from "astro:db";

// https://astro.build/db/seed
export default async function seed() {
  await db.insert(Wisephone).values([
    {
      imei: 350256485931533,
      nickname: "Cam's Wisephone II",
      phoneNumber: "+14052060654",
      userId: "user_2sLc5BX4F7qRUklqQ2UTUJXSipf" // Cam's Clerk ID
    }
  ]);

  await db.insert(Features).values([
    {
      knoxManageId: "300830f61c574b9db37dabbae1e79aa9",
      lucideIcon: "wrench",
      isEnabled: true,
      name: "Enable Tool Drawer",
      description:
        "Get access to safe, vetted third-party apps that are tools to help you get a job done. Need a ride? There's Uber. Owe a friend? There's Cash App. Apps in the Tool Drawer are free from social media, internet browsers, pornography, games, and shopping to keep you safe and help you have a healthier relationship with technology."
    },
    {
      isEnabled: true,
      knoxManageId: "5ae84219a2ea4372a42f9da57c00d325",
      lucideIcon: "fish-symbol",
      name: "Enable faith.tools",
      description:
        "Get access to your favorite faith-based apps on the Tool Drawer, like the YouVersion Bible app and Hallow Prayer app."
    },
    {
      isEnabled: true,
      knoxManageId: "f463ade53b1f43f5bf2f540a99395c2d",
      lucideIcon: "signal",
      name: "Disable Hotspot",
      description: "Disable the hotspot feature on your device."
    }
  ]);
}
