import { defineDb, defineTable, column } from "astro:db";

const Wisephone = defineTable({
  columns: {
    imei: column.number({ primaryKey: true }),
    nickname: column.text({ optional: true }),
    phoneNumber: column.text(),
    userId: column.text() // Clerk ID
  }
});

const BypassTechlessSubscription = defineTable({
  columns: {
    imei: column.number({ primaryKey: true }),
    reason: column.text()
  }
});

// Catalog of apps available in Tool Management (replaces apps.json). packageName is the Android application id (from Play Store URL).
const App = defineTable({
  columns: {
    packageName: column.text({ primaryKey: true }),
    name: column.text(),
    playStoreUrl: column.text({ optional: true }), // Full Play Store listing URL, when known.
    iconUrl: column.text({ optional: true }), // Play Store / CDN icon URL shown in Tool Management.
    category: column.text({ optional: true }), // Play Store category label (e.g. "Productivity").
    source: column.number({ default: 0 }), // 0 = not set, 1 = Tool Drawer, 2 = faith.tools
    inCatalog: column.number({ default: 1 }), // 1 = show in Tool Management search/list; 0 = hidden. Filter search on inCatalog = 1.
    htiAppId: column.text({ optional: true }), // Optional HTI app id when upserted from an HTI approval webhook.
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ optional: true }),
    type: column.text()
  }
});

const UserPermission = defineTable({
  columns: {
    userId: column.text({ primaryKey: true }), // Clerk user ID
    role: column.text({ default: "member" }), // 'member' or 'admin'
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ optional: true })
  }
});

const OttogridCache = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),
    data: column.json(), // Stores the entire response data
    createdAt: column.date({ default: new Date() }),
    expiresAt: column.date()
  }
});

// One row per IMEI: screen time metrics (synced from WiseOS).
const DeviceScreenTimeMetrics = defineTable({
  columns: {
    imei: column.text({ primaryKey: true }),
    syncedAt: column.date({ default: new Date() }),
    deviceName: column.text({ optional: true }),
    deviceManufacturer: column.text({ optional: true }),
    screenTimeDetail: column.json()
  }
});

// One row per IMEI: feature flag state synced from Knox on manage page load.
// Defaults reflect the untouched-subscribed state (what a brand new device would have).
const DeviceFeatureFlags = defineTable({
  columns: {
    imei: column.text({ primaryKey: true }),
    TOOL_DRAWER: column.number({ default: 0 }),
    TOOL_DRAWER_IN_PHONE: column.number({ default: 0 }),
    GOOGLE_APPS: column.number({ default: 0 }),
    NO_HOTSPOT: column.number({ default: 1 }),
    ALLOW_FACTORY_RESET: column.number({ default: 1 }),
    WISEOS_PROTECT: column.number({ default: 0 }),
    SHOW_SCREEN_TIME: column.number({ default: 0 }),
    BLOCK_GOOGLE_MESSAGES_GIFS: column.number({ default: 0 }),
    phoneType: column.text({ default: "WPII" }),
    updatedAt: column.date({ default: new Date() })
  }
});

// One row per IMEI: data usage (future use).
const DeviceDataUsage = defineTable({
  columns: {
    imei: column.text({ primaryKey: true }),
    cycleStartDate: column.date({ optional: true }),
    usageDetail: column.json({ optional: true }),
    lastSyncedAt: column.date({ default: new Date() })
  }
});

export default defineDb({
  tables: {
    App,
    BypassTechlessSubscription,
    Wisephone,
    UserPermission,
    OttogridCache,
    DeviceScreenTimeMetrics,
    DeviceDataUsage,
    DeviceFeatureFlags
  }
});
